import type { Events } from '../common/types'

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database({ throwOnNotFound: false })

async function removeByEventId(collectionName: string, eventId: string) {
  while (true) {
    // 读取或删除失败必须保留 deleting，不能当成清理完成后把比赛本身删掉。
    const res = await db.collection(collectionName).where({ eventId }).limit(100).get()
    const rows = res.data as Array<{ _id: string }>
    if (!rows.length) return
    const results = await Promise.allSettled(rows.map((row) => db.collection(collectionName).doc(row._id).remove()))
    const failed = results.find((result) => result.status === 'rejected')
    if (failed && failed.status === 'rejected') throw failed.reason
    if (rows.length < 100) return
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

  try {
    // 与 finishEvent.markFinished 争用同一份 events 文档：谁先提交，另一方重试后就会被拦住。
    await db.runTransaction(async (transaction) => {
      const current = await transaction.collection('events').doc(id).get()
      const currentEvent = current.data as Events | undefined
      if (!currentEvent) throw new Error('没有找到这场比赛')
      if (currentEvent.creatorOpenid !== openid) throw new Error('只能删除自己发起的比赛')
      if (currentEvent.status === 'finished' || currentEvent.settled) throw new Error('比赛已结束，不能删除')
      if (!currentEvent.deleting) {
        await transaction.collection('events').doc(id).update({
          data: { deleting: true, updateTime: db.serverDate() }
        })
      }
    })

    await removeByEventId('signups', id)
    // 进行中未结算的比赛删掉时，一并清掉未入账的对局快照，避免个人主页留孤儿记录
    await removeByEventId('matches', id)
    await db.collection('events').doc(id).remove()
    return { success: true, data: { _id: id } }
  } catch (err) {
    const error = err as Error
    return { success: false, error: error.message }
  }
}
