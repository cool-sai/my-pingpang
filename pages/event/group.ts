import { groupTitle } from '../../utils/group-title'

const groupApp = getApp<IAppOption>()

interface IGroupOpponent {
  openid: string
  nickname: string
  result: string
}

interface IGroupResult {
  a?: string
  b?: string
  winner?: string
}

Page({
  data: {
    eventId: '',
    opponents: [] as IGroupOpponent[],
    title: '',
    note: '',
    emptyText: '你不在这组',
    isLoading: true,
    reporting: ''
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ eventId: query.id || '' })
  },

  onShow() {
    void this.loadGroup()
  },

  async loadGroup() {
    const eventId = this.data.eventId
    const openid = groupApp.globalData.openid
    if (!eventId || !openid) {
      this.setData({ isLoading: false, opponents: [], emptyText: '你不在这组' })
      return
    }
    try {
      const res = await groupApp.callFunction<Array<Record<string, any>>>({
        name: 'getEvents',
        data: { id: eventId, status: 'all' }
      })
      const event = (res.result.data || []).find((item) => item._id === eventId)
      const signups = Array.isArray(event && event.signups) ? event.signups : []
      const me = signups.find((item: { openid?: string }) => item.openid === openid)
      const groupNo = me ? Number(me.groupNo) || 0 : 0
      const results = Array.isArray(event && event.results) ? event.results as IGroupResult[] : []
      const notes = Array.isArray(event && event.groupNotes) ? event.groupNotes : []
      const noteRow = notes.find((row: { groupNo?: number }) => Number(row.groupNo) === groupNo)
      const opponents = signups
        .filter((item: { openid?: string; groupNo?: number }) => groupNo && Number(item.groupNo) === groupNo && item.openid !== openid)
        .map((item: { openid?: string; nickname?: string }) => {
          const other = String(item.openid || '')
          const row = results.find((result) => (
            (result.a === openid && result.b === other) ||
            (result.a === other && result.b === openid)
          ))
          return {
            openid: other,
            nickname: item.nickname || '球友',
            result: !row ? '' : row.winner === openid ? '胜' : '负'
          }
        })
      this.setData({
        opponents,
        title: groupNo ? groupTitle(groupNo) : '',
        note: noteRow && noteRow.note ? String(noteRow.note) : '',
        emptyText: groupNo ? '这一组没有对手' : '你不在这组',
        isLoading: false
      })
    } catch (err) {
      console.error('加载分组失败', err)
      this.setData({ isLoading: false })
    }
  },

  async onResult(e: WechatMiniprogram.BaseEvent) {
    const opponentOpenid = String(e.currentTarget.dataset.openid || '')
    const win = String(e.currentTarget.dataset.win || '') === '1'
    if (!opponentOpenid || this.data.reporting) return
    this.setData({ reporting: opponentOpenid })
    try {
      const res = await groupApp.callFunction({
        name: 'eventSchedule',
        data: { id: this.data.eventId, action: 'report', opponentOpenid, win }
      })
      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '失败', icon: 'none' })
      }
      await this.loadGroup()
    } catch (err) {
      wx.showToast({ title: '失败', icon: 'none' })
      console.error(err)
    } finally {
      this.setData({ reporting: '' })
    }
  }
})
