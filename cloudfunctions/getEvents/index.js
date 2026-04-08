const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { status = 'all' } = event

  try {
    let query = db.collection('events')
    if (status !== 'all') {
      query = query.where({ status })
    }

    const res = await query.orderBy('startTime', 'desc').limit(50).get()

    const statusMap = {
      upcoming: { text: '报名中', class: 'upcoming' },
      ongoing: { text: '进行中', class: 'ongoing' },
      finished: { text: '已结束', class: 'finished' }
    }

    const events = res.data.map(e => ({
      ...e,
      statusText: statusMap[e.status]?.text || e.status,
      statusClass: statusMap[e.status]?.class || ''
    }))

    return { success: true, data: events }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
