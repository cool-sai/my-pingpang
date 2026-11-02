import type { Events, SignupsInsert, Users } from '../common/types'

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database({ throwOnNotFound: false })

const AVATAR_TTL_SEC = 86400
const AVATAR_FALLBACK_SEC = 10 * 60

function secondsOf(raw: unknown) {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return AVATAR_FALLBACK_SEC
  const seconds = value > AVATAR_TTL_SEC * 2 ? Math.round(value / 1000) : Math.round(value)
  if (seconds <= 0) return AVATAR_FALLBACK_SEC
  return Math.min(seconds, AVATAR_TTL_SEC)
}

function readTemp(item?: { tempFileURL?: string; status?: number | string; maxAge?: number }) {
  if (!item) return null
  const avatarUrl = String(item.tempFileURL || '')
  if (avatarUrl.indexOf('https://') !== 0) return null
  if (item.status !== undefined && item.status !== 0 && String(item.status) !== '0') return null
  return { avatarUrl, avatarMaxAge: secondsOf(item.maxAge) }
}

async function ensureSignups() {
  try {
    await db.createCollection('signups')
  } catch (err) {
    // 集合已经有了
  }
}

async function signAvatar(fileID: string) {
  if (fileID.indexOf('cloud://') !== 0) {
    return { avatarUrl: fileID, avatarExpire: 0, avatarMaxAge: 0 }
  }
  const attempts = [
    [{ fileID, maxAge: AVATAR_TTL_SEC }],
    [fileID]
  ]
  for (let i = 0; i < attempts.length; i += 1) {
    try {
      const res = await cloud.getTempFileURL({ fileList: attempts[i] })
      const signed = readTemp(res && res.fileList && res.fileList[0])
      if (signed) {
        return {
          avatarUrl: signed.avatarUrl,
          avatarExpire: Date.now() + signed.avatarMaxAge * 1000,
          avatarMaxAge: signed.avatarMaxAge
        }
      }
    } catch (err) {
      console.error('换取头像链接失败', err)
    }
  }
  return { avatarUrl: '', avatarExpire: 0, avatarMaxAge: 0 }
}

async function cancelSignup(id: string, openid: string) {
  const signupId = `${id}_${openid}`
  await ensureSignups()
  try {
    const signupCount = await db.runTransaction(async (transaction) => {
      const eventSnap = await transaction.collection('events').doc(id).get()
      const current = eventSnap.data as Events | undefined
      if (!current) throw new Error('没有找到这场比赛')
      const signupSnap = await transaction.collection('signups').doc(signupId).get()
      const next = Math.max(0, (Number(current.signupCount) || 0) - (signupSnap && signupSnap.data ? 1 : 0))
      if (signupSnap && signupSnap.data) {
        await transaction.collection('signups').doc(signupId).remove()
        await transaction.collection('events').doc(id).update({
          data: { signupCount: next, updateTime: db.serverDate() }
        })
      }
      return next
    })
    return { success: true, data: { signupCount } }
  } catch (err) {
    const error = err as Error
    const message = error.message || '取消失败'
    if (/没有找到这场比赛/.test(message)) {
      return { success: false, error: message }
    }
    return { success: false, error: '取消失败' }
  }
}

export const main = async (event: { id?: string; action?: string }) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) {
    return { success: false, error: '请先登录' }
  }

  const id = String(event.id || '').trim()
  if (!id || id.length > 64) {
    return { success: false, error: '没有找到这场比赛' }
  }

  const userRes = await db.collection('users').where({ openid }).limit(1).get()
  const user = userRes.data[0] as Users | undefined
  if (!user) {
    return { success: false, error: '请先登录' }
  }
  if (!user.profileReady) {
    return { success: false, error: '请先填写昵称' }
  }
  if (event.action === 'cancel') {
    return cancelSignup(id, openid)
  }

  const signupId = `${id}_${openid}`
  const nickname = String(user.nickname || '球友').slice(0, 32)
  const avatar = String(user.avatar || '')
  const signedAvatar = await signAvatar(avatar)
  const row: SignupsInsert = {
    eventId: id,
    openid,
    nickname,
    avatar,
    avatarUrl: signedAvatar.avatarUrl,
    avatarExpire: signedAvatar.avatarExpire,
    avatarMaxAge: signedAvatar.avatarMaxAge,
    createTime: db.serverDate()
  }

  await ensureSignups()

  try {
    const signupCount = await db.runTransaction(async (transaction) => {
      const eventSnap = await transaction.collection('events').doc(id).get()
      const current = eventSnap.data as Events | undefined
      if (!current) throw new Error('没有找到这场比赛')
      if (current.status === 'finished') throw new Error('报名已结束')

      const signupSnap = await transaction.collection('signups').doc(signupId).get()
      if (signupSnap && signupSnap.data) return Number(current.signupCount) || 0
      if (current.maxPlayers > 0 && (Number(current.signupCount) || 0) >= current.maxPlayers) {
        throw new Error('人数已满')
      }

      await transaction.collection('signups').doc(signupId).set({ data: row })
      await transaction.collection('events').doc(id).update({
        data: {
          signupCount: db.command.inc(1),
          updateTime: db.serverDate()
        }
      })
      return (Number(current.signupCount) || 0) + 1
    })

    return { success: true, data: { signupCount } }
  } catch (err) {
    const error = err as Error
    const message = error.message || '报名失败'
    if (/人数已满|报名已结束|没有找到这场比赛/.test(message)) {
      return { success: false, error: message }
    }
    if (/collection not exist|集合不存在|DATABASE_COLLECTION_NOT_EXIST/i.test(message)) {
      return { success: false, error: '报名名单还没建好，请再点一次' }
    }
    return { success: false, error: '报名失败' }
  }
}
