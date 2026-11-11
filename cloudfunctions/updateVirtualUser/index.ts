import type { Signups, Users } from '../common/types'

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database({ throwOnNotFound: false })

const NICKNAME_LIMIT = 20

// 与 cloudfunctions/common/admin.ts 保持一致。common 不随函数上传，故在此内联。
const SUPER_ADMIN_OPENID = 'oNw7Y5E0Wkbx_ZqHgLNOAntmTp3g'

function isSuperAdmin(openid: string) {
  return String(openid || '') === SUPER_ADMIN_OPENID
}

function isVirtual(openid: string) {
  return String(openid || '').indexOf('virtual') === 0
}

function virtualNo(nickname: string) {
  const matched = /^球友(\d+)$/.exec(String(nickname || ''))
  return matched ? Number(matched[1]) : 0
}

function virtualOpenidNo(openid: string) {
  const matched = /^virtual(\d+)$/.exec(String(openid || ''))
  return matched ? Number(matched[1]) : 0
}

function isUnowned(user: Users) {
  return !String(user.ownerOpenid || '').trim()
}

function inMyVirtualPool(user: Users, ownerOpenid: string) {
  const owner = String(user.ownerOpenid || '').trim()
  return !owner || owner === ownerOpenid
}

async function requireLogin() {
  const openid = String((cloud.getWXContext() && cloud.getWXContext().OPENID) || '')
  if (!openid) return { error: '请先登录' as const }
  const res = await db.collection('users').where({ openid }).limit(1).get()
  if (!res.data.length) return { error: '请先登录' as const }
  return { openid, user: res.data[0] as Users }
}

async function loadVirtualUsers() {
  const all: Users[] = []
  const query = { openid: db.RegExp({ regexp: '^virtual', options: '' }) }
  for (let skip = 0; skip < 1000; skip += 100) {
    const res = await db.collection('users').where(query).skip(skip).limit(100).get()
    const rows = (res.data || []) as Users[]
    all.push(...rows)
    if (rows.length < 100) break
  }
  return all.slice().sort((a, b) => {
    const diff = virtualNo(a.nickname) - virtualNo(b.nickname)
    return diff || String(a.openid).localeCompare(String(b.openid))
  })
}

async function loadUser(openid: string) {
  const res = await db.collection('users').where({ openid }).limit(1).get()
  return ((res.data || []) as Users[])[0] || null
}

function nextVirtualIdentity(existing: Users[]) {
  const openids = new Set(existing.map((user) => String(user.openid)))
  let nextNo = existing.reduce((max, user) => Math.max(max, virtualNo(user.nickname), virtualOpenidNo(user.openid)), 0)
  let openid = ''
  do {
    nextNo += 1
    openid = `virtual${nextNo}`
  } while (openids.has(openid))
  return { openid, nickname: `球友${nextNo}` }
}

function readNickname(value: unknown) {
  const nickname = String(value || '').trim()
  if (!nickname) return { error: '请填写昵称' }
  if (nickname.length > NICKNAME_LIMIT) return { error: `昵称最多 ${NICKNAME_LIMIT} 字` }
  return { nickname }
}

function readAvatar(value: unknown) {
  const avatar = String(value || '').trim()
  if (!avatar) return { avatar: '' }
  if (avatar.indexOf('cloud://') === 0 || avatar.indexOf('https://') === 0) {
    return { avatar }
  }
  return { error: '头像无效' }
}

async function updateSignups(openid: string, nickname: string, avatar: string) {
  const rows: Signups[] = []
  for (let skip = 0; skip < 500; skip += 100) {
    const res = await db.collection('signups').where({ openid }).skip(skip).limit(100).get()
    const batch = (res.data || []) as Signups[]
    rows.push(...batch)
    if (batch.length < 100) break
  }
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    await db.collection('signups').doc(row._id).update({
      data: { nickname, avatar }
    })
  }
}

export const main = async (event: { openid?: unknown; nickname?: unknown; avatar?: unknown }) => {
  try {
    const auth = await requireLogin()
    if (auth.error) return { success: false, error: auth.error }

    const openid = String(event && event.openid || '').trim()
    if (!openid || !isVirtual(openid)) return { success: false, error: '没有这个虚拟球友' }

    const user = await loadUser(openid)
    if (!user) return { success: false, error: '没有这个虚拟球友' }

    const admin = isSuperAdmin(auth.openid)
    const owner = String(user.ownerOpenid || '').trim()
    if (!admin && owner && owner !== auth.openid) {
      return { success: false, error: '只能改自己的虚拟球友' }
    }

    const nicknameResult = readNickname(event && event.nickname)
    if (nicknameResult.error) return { success: false, error: nicknameResult.error }
    const avatarResult = readAvatar(event && event.avatar)
    if (avatarResult.error) return { success: false, error: avatarResult.error }

    const patch: Record<string, unknown> = {
      nickname: nicknameResult.nickname,
      avatar: avatarResult.avatar,
      updateTime: db.serverDate()
    }
    // 普通用户编辑无主人的旧记录时认领。超管编辑不改 ownerOpenid。
    if (!admin && !owner) {
      patch.ownerOpenid = auth.openid
    }

    await db.collection('users').doc(user._id).update({ data: patch })
    await updateSignups(openid, nicknameResult.nickname, avatarResult.avatar)

    const saved = await loadUser(openid)
    return {
      success: true,
      data: {
        openid,
        nickname: (saved && saved.nickname) || nicknameResult.nickname,
        avatar: (saved && saved.avatar) || avatarResult.avatar,
        ownerOpenid: String((saved && saved.ownerOpenid) || patch.ownerOpenid || owner)
      }
    }
  } catch (err) {
    console.error('更新虚拟球友失败', err)
    return { success: false, error: '保存失败' }
  }
}
