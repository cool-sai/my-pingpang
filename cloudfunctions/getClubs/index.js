const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { sortBy = 'score' } = event

  try {
    const orderField = sortBy === 'members' ? 'memberCount' : 'totalScore'
    const res = await db.collection('clubs')
      .orderBy(orderField, 'desc')
      .limit(50)
      .get()

    return { success: true, data: res.data }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
