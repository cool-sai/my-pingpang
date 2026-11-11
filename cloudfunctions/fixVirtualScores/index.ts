import type { Users } from '../common/types'

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database({ throwOnNotFound: false })

// 与 cloudfunctions/common/admin.ts 保持一致。common 不随函数上传，故在此内联。
const SUPER_ADMIN_OPENID = 'oNw7Y5E0Wkbx_ZqHgLNOAntmTp3g'
const INITIAL_SCORE = 1000

function isSuperAdmin(openid: string) {
  return String(openid || '') === SUPER_ADMIN_OPENID
}

function isVirtual(openid: string) {
  return String(openid || '').indexOf('virtual') === 0
}

function hasPlayed(user: Users) {
  const counts = [user.totalMatches, user.winMatches, user.loseMatches]
  return counts.some((value) => {
    const n = Number(value)
    return Number.isFinite(n) && n > 0
  })
}

function scoreNeedsFix(score: unknown) {
  if (score === null || score === undefined || score === '') return true
  const n = Number(score)
  if (!Number.isFinite(n)) return true
  return n === 0
}

async function authorize() {
  const ctx = cloud.getWXContext() || {}
  const openid = String(ctx.OPENID || '')

  // 开发者工具测试面板通常不带 OPENID。这个一次性函数没有前端入口，无登录态时允许执行。
  // 小程序里带 OPENID 的调用必须是超管。
  if (!openid) return { ok: true as const }
  if (!isSuperAdmin(openid)) {
    return { error: '只有管理员可以执行' as const }
  }
  return { ok: true as const }
}

async function loadVirtualUsers() {
  const all: Users[] = []
  const query = { openid: db.RegExp({ regexp: '^virtual', options: '' }) }
  for (let skip = 0; skip < 10000; skip += 100) {
    const res = await db.collection('users').where(query).skip(skip).limit(100).get()
    const rows = (res.data || []) as Users[]
    all.push(...rows)
    if (rows.length < 100) break
  }
  return all
}

export const main = async () => {
  try {
    const auth = await authorize()
    if (auth.error) return { success: false, error: auth.error }

    const users = await loadVirtualUsers()
    let updated = 0
    let skipped = 0

    for (let i = 0; i < users.length; i += 1) {
      const user = users[i]
      if (!isVirtual(user.openid) || !user._id) {
        continue
      }
      if (hasPlayed(user) || !scoreNeedsFix(user.score)) {
        skipped += 1
        continue
      }
      await db.collection('users').doc(user._id).update({
        data: {
          score: INITIAL_SCORE,
          updateTime: db.serverDate()
        }
      })
      updated += 1
    }

    return { success: true, data: { updated, skipped } }
  } catch (err) {
    console.error('补齐虚拟球友积分失败', err)
    return { success: false, error: '执行失败' }
  }
}
