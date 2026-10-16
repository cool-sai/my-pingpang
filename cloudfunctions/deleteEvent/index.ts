const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

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
    const current = await db.collection('events').doc(id).get()
    if (!current.data) {
      return { success: false, error: '没有找到这场比赛' }
    }
    if (current.data.creatorOpenid !== openid) {
      return { success: false, error: '只能删除自己发起的比赛' }
    }

    await db.collection('events').doc(id).remove()
    return { success: true, data: { _id: id } }
  } catch (err) {
    const error = err as Error
    return { success: false, error: error.message }
  }
}
