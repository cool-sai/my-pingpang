const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 新用户初始积分
const INITIAL_SCORE = 1000

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 查询用户是否已存在
    const userResult = await db.collection('users').where({
      openid: openid
    }).get()

    if (userResult.data.length > 0) {
      // 用户已存在，返回用户信息
      return {
        success: true,
        data: userResult.data[0]
      }
    }

    // 新用户，创建用户记录
    const newUser = {
      openid: openid,
      nickname: event.userInfo.nickName || '乒乓球爱好者',
      avatar: event.userInfo.avatarUrl || '',
      score: INITIAL_SCORE,
      totalMatches: 0,
      winMatches: 0,
      loseMatches: 0,
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }

    await db.collection('users').add({
      data: newUser
    })

    return {
      success: true,
      data: newUser
    }
  } catch (err) {
    return {
      success: false,
      error: err.message
    }
  }
}
