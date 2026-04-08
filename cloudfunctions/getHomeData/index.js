const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  try {
    // 获取积分榜TOP5
    const topPlayers = await db.collection('users')
      .orderBy('score', 'desc')
      .limit(5)
      .field({
        openid: true,
        nickname: true,
        avatar: true,
        score: true
      })
      .get()

    // 获取热门俱乐部
    const hotClubs = await db.collection('clubs')
      .orderBy('totalScore', 'desc')
      .limit(5)
      .field({
        name: true,
        totalScore: true,
        memberCount: true
      })
      .get()

    // 获取当前赛事
    const currentEvents = await db.collection('events')
      .where({
        status: 'upcoming'
      })
      .limit(5)
      .field({
        name: true,
        startTime: true,
        status: true
      })
      .get()

    // 处理赛事状态显示
    const events = currentEvents.data.map(e => ({
      ...e,
      statusText: e.status === 'upcoming' ? '报名中' : e.status === 'ongoing' ? '进行中' : '已结束'
    }))

    return {
      success: true,
      data: {
        topPlayers: topPlayers.data,
        hotClubs: hotClubs.data,
        currentEvents: events
      }
    }
  } catch (err) {
    return {
      success: false,
      error: err.message
    }
  }
}
