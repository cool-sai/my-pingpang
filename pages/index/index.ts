import { newsList } from '../../data/news'
import { TabIndex } from '../../utils/tab'

const indexApp = getApp<IAppOption>()

interface IEventCard {
  _id: string
  name: string
  startTime?: string
  location?: string
  status?: string
  statusText?: string
  signupCount?: number
}

Page({
  data: {
    news: newsList,
    events: [] as IEventCard[]
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: TabIndex.Index })
    }
    void this.loadEvents()
  },

  onPullDownRefresh() {
    void this.loadEvents().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadEvents() {
    try {
      const [ongoingRes, upcomingRes] = await Promise.all([
        indexApp.callFunction<IEventCard[]>({ name: 'getEvents', data: { status: 'ongoing' } }),
        indexApp.callFunction<IEventCard[]>({ name: 'getEvents', data: { status: 'upcoming' } })
      ])
      this.setData({
        events: [
          ...(ongoingRes.result.success ? ongoingRes.result.data : []),
          ...(upcomingRes.result.success ? upcomingRes.result.data : [])
        ]
      })
    } catch (err) {
      console.error('加载首页赛事失败', err)
    }
  },

  goToNews(e: WechatMiniprogram.BaseEvent) {
    const newsId = e.currentTarget.dataset.id
    if (!newsId) return
    wx.navigateTo({ url: `/pages/news/detail?id=${newsId}` })
  },

  goToEventDetail(e: WechatMiniprogram.BaseEvent) {
    const eventId = e.currentTarget.dataset.id
    if (!eventId) return
    wx.navigateTo({ url: `/pages/event/detail?id=${eventId}` })
  },

  goToEvent() {
    wx.switchTab({ url: '/pages/event/event' })
  }
})
