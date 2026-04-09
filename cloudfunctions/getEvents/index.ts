const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

interface GetEventsEvent {
  status?: 'all' | 'upcoming' | 'ongoing' | 'finished'
}

const statusMap: Record<string, { text: string; class: string }> = {
  upcoming: { text: '报名中', class: 'upcoming' },
  ongoing: { text: '进行中', class: 'ongoing' },
  finished: { text: '已结束', class: 'finished' }
}

export const main = async (event: GetEventsEvent) => {
  const { status = 'all' } = event

  try {
    let query = db.collection('events')
    if (status !== 'all') {
      query = query.where({ status })
    }

    const res = await query.orderBy('startTime', 'desc').limit(50).get()

    const events = res.data.map((item: Record<string, any>) => ({
      ...item,
      statusText: statusMap[item.status]?.text || item.status,
      statusClass: statusMap[item.status]?.class || ''
    }))

    return { success: true, data: events }
  } catch (err) {
    const error = err as Error
    return { success: false, error: error.message }
  }
}
