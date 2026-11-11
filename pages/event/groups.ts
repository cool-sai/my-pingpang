import { groupTitle } from '../../utils/group-title'

const groupsApp = getApp<IAppOption>()

interface IBoardPerson {
  openid?: string
  nickname?: string
  groupNo?: number
}

interface IBoardResult {
  a?: string
  b?: string
  winner?: string
}

interface IBoardGroup {
  groupNo: number
  title: string
  note: string
  count: number
  played: number
  total: number
}

Page({
  data: {
    eventId: '',
    isOwner: false,
    groups: [] as IBoardGroup[],
    isLoading: true,
    saving: false
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ eventId: query.id || '' })
  },

  onShow() {
    void this.loadGroups()
  },

  async loadGroups() {
    const eventId = this.data.eventId
    if (!eventId) {
      this.setData({ isLoading: false, groups: [] })
      return
    }
    try {
      const res = await groupsApp.callFunction<Array<Record<string, any>>>({
        name: 'getEvents',
        data: { id: eventId, status: 'all' }
      })
      const event = (res.result.data || []).find((item) => item._id === eventId)
      const signups = (Array.isArray(event && event.signups) ? event.signups : []) as IBoardPerson[]
      const results = (Array.isArray(event && event.results) ? event.results : []) as IBoardResult[]
      const notes = Array.isArray(event && event.groupNotes) ? event.groupNotes : []
      const openid = groupsApp.globalData.openid
      const groupNos = Array.from(new Set(signups.map((item) => Number(item.groupNo) || 0).filter((groupNo) => groupNo > 0)))
      groupNos.sort((a, b) => a - b)
      const groups = groupNos.map((groupNo) => {
        const people = signups.filter((item) => Number(item.groupNo) === groupNo)
        const ids = new Set(people.map((item) => String(item.openid || '')))
        const total = people.length < 2 ? 0 : (people.length * (people.length - 1)) / 2
        const played = results.filter((result) => ids.has(String(result.a || '')) && ids.has(String(result.b || ''))).length
        const noteRow = notes.find((row: { groupNo?: number }) => Number(row.groupNo) === groupNo)
        return {
          groupNo,
          title: groupTitle(groupNo),
          note: noteRow && noteRow.note ? String(noteRow.note) : '',
          count: people.length,
          played,
          total
        }
      })
      this.setData({
        groups,
        isOwner: !!(event && openid && event.creatorOpenid === openid),
        isLoading: false
      })
    } catch (err) {
      console.error('加载分组失败', err)
      this.setData({ isLoading: false })
    }
  },

  openGroup(e: WechatMiniprogram.BaseEvent) {
    const groupNo = Number(e.currentTarget.dataset.groupNo)
    if (!groupNo || !this.data.eventId) return
    wx.navigateTo({ url: `/pages/event/board?id=${this.data.eventId}&group=${groupNo}` })
  },

  editNote(e: WechatMiniprogram.BaseEvent) {
    if (!this.data.isOwner || this.data.saving) return
    const groupNo = Number(e.currentTarget.dataset.groupNo)
    const found = this.data.groups.find((item) => item.groupNo === groupNo)
    const current = found ? found.note : ''
    if (!groupNo) return
    wx.showModal({
      title: groupTitle(groupNo),
      content: current ? `当前：${current}` : '例如 5 6 7 号台',
      editable: true,
      placeholderText: '备注，留空则去掉',
      success: (res) => {
        if (!res.confirm) return
        void this.saveNote(groupNo, String(res.content || '').trim())
      }
    })
  },

  async saveNote(groupNo: number, note: string) {
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中' })
    try {
      const res = await groupsApp.callFunction({
        name: 'eventSchedule',
        data: { id: this.data.eventId, action: 'note', groupNo, note }
      })
      wx.hideLoading()
      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '失败', icon: 'none' })
        return
      }
      await this.loadGroups()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '失败', icon: 'none' })
      console.error(err)
    } finally {
      this.setData({ saving: false })
    }
  }
})
