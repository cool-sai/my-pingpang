// pages/event/event.js
Page({
  data: {
    events: [],
    isLoading: false,
    status: 'all' // all, upcoming, ongoing, finished
  },

  onLoad() {
    this.loadEvents()
  },

  onShow() {
    this.loadEvents()
  },

  async loadEvents() {
    this.setData({ isLoading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getEvents',
        data: { status: this.data.status }
      })
      if (res.result.success) {
        this.setData({ events: res.result.data })
      }
    } catch (err) {
      console.error('加载赛事失败', err)
    } finally {
      this.setData({ isLoading: false })
    }
  },

  onPullDownRefresh() {
    this.loadEvents()
    wx.stopPullDownRefresh()
  },

  switchStatus(e) {
    const status = e.currentTarget.dataset.status
    this.setData({ status }, () => {
      this.loadEvents()
    })
  },

  goToEventDetail(e) {
    const eventId = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/event/detail?id=${eventId}` })
  }
})
