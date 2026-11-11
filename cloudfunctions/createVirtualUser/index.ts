import type { Users, UsersInsert } from '../common/types'

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

const TEMP_BATCH = 50

// 与 common/signFileUrls.ts 保持一致：cloud:// → 临时 https；不管过期
async function signFileUrls(fileIDs: string[]) {
  const cloudIDs = Array.from(new Set(fileIDs.filter((id) => id && id.indexOf('cloud://') === 0)))
  const urls = new Map<string, string>()
  for (let i = 0; i < cloudIDs.length; i += TEMP_BATCH) {
    const batch = cloudIDs.slice(i, i + TEMP_BATCH)
    let list: Array<{ tempFileURL?: string; status?: number | string }> = []
    try {
      const res = await cloud.getTempFileURL({ fileList: batch })
      list = (res && res.fileList) || []
    } catch (err) {
      console.error('换取临时链接失败', err)
    }
    batch.forEach((fileID, index) => {
      const item = list[index]
      const url = String(item && item.tempFileURL || '')
      if (url.indexOf('https://') !== 0) return
      if (item && item.status !== undefined && item.status !== 0 && String(item.status) !== '0') return
      urls.set(fileID, url)
    })
  }
  return urls
}

function resolveAvatar(fileID: string, urls: Map<string, string>) {
  const id = String(fileID || '')
  if (!id) return ''
  if (id.indexOf('https://') === 0) return id
  return urls.get(id) || (id.indexOf('cloud://') === 0 ? '' : id)
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

function readNickname(value: unknown, fallback: string) {
  const nickname = String(value || '').trim()
  if (!nickname) return { nickname: fallback }
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

export const main = async (event: { nickname?: unknown; avatar?: unknown }) => {
  try {
    const auth = await requireLogin()
    if (auth.error) return { success: false, error: auth.error }

    const existing = await loadVirtualUsers()
    const identity = nextVirtualIdentity(existing)
    const nicknameResult = readNickname(event && event.nickname, identity.nickname)
    if (nicknameResult.error) return { success: false, error: nicknameResult.error }
    const avatarResult = readAvatar(event && event.avatar)
    if (avatarResult.error) return { success: false, error: avatarResult.error }

    const user: UsersInsert = {
      openid: identity.openid,
      nickname: nicknameResult.nickname,
      avatar: avatarResult.avatar,
      userNo: 0,
      profileReady: true,
      score: 1000,
      totalMatches: 0,
      winMatches: 0,
      loseMatches: 0,
      ownerOpenid: auth.openid,
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
    const added = await db.collection('users').add({ data: user })
    const urls = await signFileUrls([user.avatar])
    return {
      success: true,
      data: {
        openid: identity.openid,
        nickname: user.nickname,
        avatar: resolveAvatar(user.avatar, urls),
        ownerOpenid: auth.openid,
        _id: added && added._id
      }
    }
  } catch (err) {
    console.error('新建虚拟球友失败', err)
    return { success: false, error: '保存失败' }
  }
}
