import type { Events, EventStatus } from '../common/types'

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

interface GetEventsEvent {
  status?: 'all' | EventStatus
  id?: string
  province?: string
  city?: string
}

const statusMap: Record<EventStatus, { text: string; class: string }> = {
  upcoming: { text: '报名中', class: 'upcoming' },
  ongoing: { text: '进行中', class: 'ongoing' },
  finished: { text: '已结束', class: 'finished' }
}

function mapEvent(item: Events) {
  return {
    ...item,
    statusText: statusMap[item.status]?.text || item.status,
    statusClass: statusMap[item.status]?.class || ''
  }
}

export const main = async (event: GetEventsEvent) => {
  const { status = 'all', id = '' } = event

  try {
    if (id) {
      const one = await db.collection('events').doc(String(id)).get()
      if (!one.data) {
        return { success: false, error: '没有找到这场比赛' }
      }
      return { success: true, data: [mapEvent(one.data as Events)] }
    }

    const province = String(event.province || '').trim()
    const city = String(event.city || '').trim()
    const where: { status?: EventStatus; province?: string; city?: string } = {}
    if (status !== 'all') where.status = status
    if (province) where.province = province
    if (city) where.city = city
    let query = db.collection('events')
    if (Object.keys(where).length > 0) {
      query = query.where(where)
    }

    const res = await query.orderBy('startTime', 'desc').limit(50).get()
    return { success: true, data: (res.data as Events[]).map(mapEvent) }
  } catch (err) {
    const error = err as Error
    if (id) {
      return { success: false, error: '没有找到这场比赛' }
    }
    return { success: false, error: error.message }
  }
}
