import type { Clubs } from '../common/types'

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

interface GetClubsEvent {
  sortBy?: 'score' | 'members'
}

export const main = async (event: GetClubsEvent) => {
  const { sortBy = 'score' } = event

  try {
    const orderField: keyof Pick<Clubs, 'memberCount' | 'totalScore'> =
      sortBy === 'members' ? 'memberCount' : 'totalScore'
    const res = await db.collection('clubs')
      .orderBy(orderField, 'desc')
      .limit(50)
      .get()

    return { success: true, data: res.data as Clubs[] }
  } catch (err) {
    const error = err as Error
    return { success: false, error: error.message }
  }
}
