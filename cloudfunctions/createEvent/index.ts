import type { EventFormat, EventInput, EventStatus, EventsInsert, Users } from '../common/types'

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function isRealDateTime(value: string) {
  const [datePart, timePart] = value.split(' ')
  const [year, month, day] = datePart.split('-').map((part) => Number(part))
  const [hour, minute] = timePart.split(':').map((part) => Number(part))
  if (hour > 23 || minute > 59) return false
  const date = new Date(year, month - 1, day, hour, minute)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function readEventFields(
  input: Record<string, any>
): { error: string; value?: undefined } | { error?: undefined; value: EventInput } {
  const name = String(input.name || '').trim()
  const startTime = String(input.startTime || '').trim()
  const location = String(input.location || '').trim()
  const description = String(input.description || '').trim()
  const format = String(input.format || '').trim()
  const status = String(input.status || '').trim()
  const maxPlayers = Number.parseInt(String(input.maxPlayers ?? '0'), 10)
  const formats: EventFormat[] = ['积分赛', '循环赛', '淘汰赛']
  const statuses: EventStatus[] = ['upcoming', 'ongoing', 'finished']

  if (!name) return { error: '请填写比赛名称' }
  if (name.length > 30) return { error: '比赛名称最多 30 字' }
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(startTime) || !isRealDateTime(startTime)) {
    return { error: '请选择比赛时间' }
  }
  if (!location) return { error: '请填写地点' }
  if (location.length > 40) return { error: '地点最多 40 字' }
  if ((formats as string[]).indexOf(format) < 0) return { error: '请选择赛制' }
  if ((statuses as string[]).indexOf(status) < 0) return { error: '请选择状态' }
  if (!Number.isInteger(maxPlayers) || maxPlayers < 0 || maxPlayers > 128 || (maxPlayers !== 0 && maxPlayers < 2)) {
    return { error: '人数上限填 2 到 128，不限制就留空' }
  }
  if (description.length > 300) return { error: '说明最多 300 字' }

  return {
    value: {
      name,
      startTime,
      location,
      description,
      format: format as EventFormat,
      status: status as EventStatus,
      maxPlayers,
    },
  }
}

export const main = async (event: Record<string, any>) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) {
    return { success: false, error: '请先登录' }
  }

  const parsed = readEventFields(event)
  if (parsed.error || !parsed.value) {
    return { success: false, error: parsed.error || '请检查比赛信息' }
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get()
    const creator = userRes.data[0] as Users | undefined
    const creatorName = String(creator?.nickname || '球友')
    const data: EventsInsert = {
      ...parsed.value,
      signupCount: 0,
      creatorOpenid: openid,
      creatorName,
      createTime: db.serverDate(),
      updateTime: db.serverDate(),
    }
    const added = await db.collection('events').add({ data })

    return { success: true, data: { _id: added._id } }
  } catch (err) {
    const error = err as Error
    return { success: false, error: error.message }
  }
}
