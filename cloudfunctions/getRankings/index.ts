const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

interface GetRankingsEvent {
  filter?: 'all' | 'club'
}

export const main = async (event: GetRankingsEvent) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { filter = 'all' } = event

  try {
    let query = db.collection('users').orderBy('score', 'desc')

    if (filter === 'club') {
      query = query.orderBy('score', 'desc')
    }

    const res = await query.limit(100).get()

    const list = res.data.map((item: Record<string, any>, index: number) => ({
      ...item,
      rank: index + 1
    }))

    const myRank = list.find((item: Record<string, any>) => item.openid === openid) || null

    return { success: true, data: { list, myRank } }
  } catch (err) {
    const error = err as Error
    return { success: false, error: error.message }
  }
}
