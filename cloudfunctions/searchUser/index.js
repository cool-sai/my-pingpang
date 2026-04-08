const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { nickname } = event

  if (!nickname || nickname.length < 2) {
    return { success: false, error: '昵称至少2个字符' }
  }

  try {
    const res = await db.collection('users')
      .where({
        nickname: db.RegExp({
          regexp: nickname,
          options: 'i'
        })
      })
      .limit(10)
      .field({
        openid: true,
        nickname: true,
        avatar: true,
        score: true
      })
      .get()

    return { success: true, data: res.data }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
