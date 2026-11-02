const KEY = 'eventListPending'

export type EventListPending =
  | { kind: 'refresh'; id: string; at: number }
  | { kind: 'remove'; id: string; at: number }

/** 编辑/报名后：列表回来时按 id 调 getEvent 刷新这一项 */
export function markEventNeedRefresh(eventId: string) {
  const id = String(eventId || '').trim()
  if (!id) return
  const payload: EventListPending = { kind: 'refresh', id, at: Date.now() }
  wx.setStorageSync(KEY, payload)
}

export function markEventRemoved(eventId: string) {
  const id = String(eventId || '').trim()
  if (!id) return
  const payload: EventListPending = { kind: 'remove', id, at: Date.now() }
  wx.setStorageSync(KEY, payload)
}

export function readEventPending(): EventListPending | null {
  try {
    const raw = wx.getStorageSync(KEY) as EventListPending | ''
    if (!raw || typeof raw !== 'object' || !raw.id || !raw.at || !raw.kind) return null
    return raw
  } catch (err) {
    return null
  }
}

/** 用接口返回的单场数据替换/插入列表项 */
export function replaceEventInList<T extends { _id?: string }>(
  list: T[],
  id: string,
  event: T | null,
  opts?: { province?: string; city?: string; status?: string }
): T[] {
  const index = list.findIndex((item) => item && item._id === id)
  if (!event) {
    if (index < 0) return list
    const next = list.slice()
    next.splice(index, 1)
    return next
  }

  const province = opts && opts.province
  const city = opts && opts.city
  if (province && city) {
    const row = event as T & { province?: string; city?: string }
    const ep = String(row.province || '')
    const ec = String(row.city || '')
    if (ep && ec && (ep !== province || ec !== city)) {
      if (index < 0) return list
      const next = list.slice()
      next.splice(index, 1)
      return next
    }
  }

  const statusFilter = opts && opts.status
  if (statusFilter && statusFilter !== 'all') {
    const row = event as T & { status?: string }
    if (String(row.status || '') !== statusFilter) {
      if (index < 0) return list
      const next = list.slice()
      next.splice(index, 1)
      return next
    }
  }

  if (index < 0) {
    return [event, ...list]
  }
  const next = list.slice()
  next[index] = { ...next[index], ...event, _id: id }
  return next
}
