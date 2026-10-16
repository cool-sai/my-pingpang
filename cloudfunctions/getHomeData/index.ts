const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

export const main = async () => {
  try {
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

    const hotClubs = await db.collection('clubs')
      .orderBy('totalScore', 'desc')
      .limit(5)
      .field({
        _id: true,
        name: true,
        totalScore: true,
        memberCount: true,
        city: true,
        location: true
      })
      .get()

    const currentEvents = await db.collection('events')
      .where({
        status: 'upcoming'
      })
      .limit(5)
      .field({
        _id: true,
        name: true,
        startTime: true,
        status: true,
        location: true,
        signupCount: true
      })
      .get()

    const events = currentEvents.data.map((item: Record<string, any>) => ({
      ...item,
      statusText: item.status === 'upcoming'
        ? '报名中'
        : item.status === 'ongoing'
          ? '进行中'
          : '已结束'
    }))

    return {
      success: true,
      data: {
        topPlayers: topPlayers.data.map((item: Record<string, any>, index: number) => ({
          ...item,
          rank: index + 1
        })),
        hotClubs: hotClubs.data,
        currentEvents: events
      }
    }
  } catch (err) {
    const error = err as Error
    return {
      success: false,
      error: error.message
    }
  }
}
