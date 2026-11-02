import type { Clubs, Events, Users } from '../common/types'

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

type HomePlayer = Pick<Users, 'openid' | 'nickname' | 'avatar' | 'score'>
type HomeClub = Pick<Clubs, '_id' | 'name' | 'totalScore' | 'memberCount' | 'city' | 'location'>
type HomeEvent = Pick<Events, '_id' | 'name' | 'startTime' | 'status' | 'location' | 'signupCount'>

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

    const events = (currentEvents.data as HomeEvent[]).map((item) => ({
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
        topPlayers: (topPlayers.data as HomePlayer[]).map((item, index) => ({
          ...item,
          rank: index + 1
        })),
        hotClubs: hotClubs.data as HomeClub[],
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
