import type { Matches } from '../common/types'

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

interface GetMatchesEvent {
  status?: 'all' | 'pending' | 'completed'
}

export const main = async (event: GetMatchesEvent) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { status = 'all' } = event

  try {
    let query = db.collection('matches').where(
      db.command.or([
        { player1Openid: openid },
        { player2Openid: openid }
      ])
    )

    if (status !== 'all') {
      query = query.where({ status })
    }

    const res = await query.orderBy('createTime', 'desc').limit(50).get()

    const matches = (res.data as Matches[]).map((item) => ({
      ...item,
      statusText: item.status === 'pending' ? '待确认' : '已结束'
    }))

    return { success: true, data: matches }
  } catch (err) {
    const error = err as Error
    return { success: false, error: error.message }
  }
}
