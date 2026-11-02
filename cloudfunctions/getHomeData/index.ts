import type { Clubs, Events, Users } from '../common/types'

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

type HomePlayer = Pick<Users, 'openid' | 'nickname' | 'avatar' | 'score'>
type HomeClub = Pick<Clubs, '_id' | 'name' | 'totalScore' | 'memberCount' | 'city' | 'location'>
type HomeEvent = Pick<Events, '_id' | 'name' | 'cover' | 'startTime' | 'status' | 'location' | 'signupCount'>

// 与 common/signFileUrls.ts 保持一致：cloud:// → 临时 https；不管过期
const TEMP_BATCH = 50

async function signFileUrls(fileIDs: string[]) {
  const cloudIDs = Array.from(new Set(fileIDs.filter((id) => id && id.indexOf('cloud://') === 0)))
  const urls = new Map<string, string>()
  for (let i = 0; i < cloudIDs.length; i += TEMP_BATCH) {
    const batch = cloudIDs.slice(i, i + TEMP_BATCH)
    let list: Array<{ tempFileURL?: string; status?: number | string }> = []
    try {
      const res = await cloud.getTempFileURL({ fileList: batch })
      list = (res && res.fileList) || []
    } catch (err) {
      console.error('换取临时链接失败', err)
    }
    batch.forEach((fileID, index) => {
      const item = list[index]
      const url = String(item && item.tempFileURL || '')
      if (url.indexOf('https://') !== 0) return
      if (item && item.status !== undefined && item.status !== 0 && String(item.status) !== '0') return
      urls.set(fileID, url)
    })
  }
  return urls
}

async function withCoverUrls<T extends { cover?: string }>(items: T[]) {
  const urls = await signFileUrls(items.map((item) => String(item.cover || '')))
  return items.map((item) => {
    const fileID = String(item.cover || '')
    const coverUrl = urls.get(fileID) || (fileID.indexOf('https://') === 0 ? fileID : '')
    return { ...item, coverUrl }
  })
}

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
        cover: true,
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
    // cover 保持库内 fileID；coverUrl 为临时 https，供非上传者展示
    const currentEventsSigned = await withCoverUrls(events)

    return {
      success: true,
      data: {
        topPlayers: (topPlayers.data as HomePlayer[]).map((item, index) => ({
          ...item,
          rank: index + 1
        })),
        hotClubs: hotClubs.data as HomeClub[],
        currentEvents: currentEventsSigned
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
