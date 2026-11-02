import { readEventPending, replaceEventInList } from '../../utils/event-list-sync'

const eventApp = getApp<IAppOption>()

type EventStatus = 'all' | 'upcoming' | 'ongoing' | 'finished'

let lastEventPatchAt = 0

Page({
  data: {
    events: [] as Array<Record<string, any>>,
    isLoading: true,
    status: 'all' as EventStatus
  },

  onLoad() {
    void this.loadEvents()
  },

  onShow() {
    void this.refreshPendingEventCard()
  },

  async refreshPendingEventCard() {
    const pending = readEventPending()
    if (!pending || pending.at === lastEventPatchAt) return
    lastEventPatchAt = pending.at
    if (pending.kind === 'remove') {
      this.setData({
        events: replaceEventInList(this.data.events, pending.id, null)
      })
      return
    }
    try {
      const res = await eventApp.callFunction<Record<string, any>>({
        name: 'getEvent',
        data: { id: pending.id }
      })
      if (!res.result.success || !res.result.data) {
        this.setData({
          events: replaceEventInList(this.data.events, pending.id, null)
        })
        return
      }
      this.setData({
        events: replaceEventInList(this.data.events, pending.id, res.result.data, {
          status: this.data.status
        })
      })
    } catch (err) {
      console.error('刷新比赛卡片失败', err)
    }
  },

  async loadEvents() {
    this.setData({ isLoading: true })
    try {
      const res = await eventApp.callFunction<Array<Record<string, any>>>({
        name: 'getEvents',
        data: { status: this.data.status }
      })
      if (res.result.success) {
        this.setData({ events: res.result.data || [] })
      }
    } catch (err) {
      console.error('加载赛事失败', err)
    } finally {
      this.setData({ isLoading: false })
    }
  },

  onPullDownRefresh() {
    void this.loadEvents().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  switchStatus(e: WechatMiniprogram.BaseEvent) {
    const status = (e.currentTarget.dataset.status || 'all') as EventStatus
    this.setData({ status }, () => {
      void this.loadEvents()
    })
  },

  goToEventDetail(e: WechatMiniprogram.CustomEvent<{ id?: string }>) {
    const eventId = e.detail.id
    if (!eventId) return
    wx.navigateTo({ url: `/pages/event/detail?id=${eventId}` })
  },

  goToCreate() {
    eventApp.requireLogin('登录后才能创建比赛', {
      success: () => {
        wx.navigateTo({ url: '/pages/event/edit' })
      },
      fail: (error) => {
        if (error === '取消登录') return
        wx.showToast({ title: '登录失败', icon: 'none' })
      }
    })
  }
})
