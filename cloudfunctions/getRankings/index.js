const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { filter = 'all' } = event

  try {
    let query = db.collection('users').orderBy('score', 'desc')

    const res = await query.limit(100).get()

    const list = res.data.map((u, i) => ({
      ...u,
      rank: i + 1
    }))

    // 我的排名
    const myRank = list.find(u => u.openid === openid)

    return { success: true, data: { list, myRank } }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
