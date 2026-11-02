import type { Events, SignupsInsert, Users } from '../common/types'

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database({ throwOnNotFound: false })

async function ensureSignups() {
  try {
    await db.createCollection('signups')
  } catch (err) {
    // 集合已经有了
  }
}

export const main = async (event: { id?: string }) => {
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

  const signupId = `${id}_${openid}`
  const nickname = String(user.nickname || '球友').slice(0, 32)
  const avatar = String(user.avatar || '')
  const row: SignupsInsert = {
    eventId: id,
    openid,
    nickname,
    avatar,
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
