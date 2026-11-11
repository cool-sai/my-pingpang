import type { Users } from '../common/types'

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database({ throwOnNotFound: false })

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

export const main = async (event: { openid?: unknown }) => {
  try {
    const auth = await requireLogin()
    if (auth.error) return { success: false, error: auth.error }
    if (!isSuperAdmin(auth.openid)) {
      return { success: false, error: '只有管理员可以删除' }
    }

    const openid = String(event && event.openid || '').trim()
    if (!openid || !isVirtual(openid)) return { success: false, error: '没有这个虚拟球友' }

    const user = await loadUser(openid)
    if (!user) return { success: false, error: '没有这个虚拟球友' }

    const signups = await db.collection('signups').where({ openid }).limit(1).get()
    if ((signups.data || []).length) {
      return { success: false, error: '已报名的虚拟球友不能删除' }
    }

    await db.collection('users').doc(user._id).remove()
    return { success: true, data: { openid } }
  } catch (err) {
    console.error('删除虚拟球友失败', err)
    return { success: false, error: '删除失败' }
  }
}
