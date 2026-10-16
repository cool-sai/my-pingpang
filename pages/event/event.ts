import { TabIndex } from '../../utils/tab'

const eventApp = getApp<IAppOption>()

type EventStatus = 'all' | 'upcoming' | 'ongoing' | 'finished'

Page({
  data: {
    events: [] as Array<Record<string, any>>,
    isLoading: false,
    status: 'all' as EventStatus
  },

  onLoad() {
    void this.loadEvents()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: TabIndex.Event })
    }
    void this.loadEvents()
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

  goToEventDetail(e: WechatMiniprogram.BaseEvent) {
    const eventId = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/event/detail?id=${eventId}` })
  }
})
