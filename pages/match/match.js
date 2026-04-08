// pages/match/match.js
const app = getApp()

Page({
  data: {
    matches: [],
    isLoading: false,
    status: 'all' // all, pending, completed
  },

  onLoad() {
    this.loadMatches()
  },

  onShow() {
    if (app.globalData.isLogin) {
      this.loadMatches()
    }
  },

  async loadMatches() {
    this.setData({ isLoading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getMatches',
        data: { status: this.data.status }
      })
      if (res.result.success) {
        this.setData({ matches: res.result.data })
      }
    } catch (err) {
      console.error('加载比赛记录失败', err)
    } finally {
      this.setData({ isLoading: false })
    }
  },

  onPullDownRefresh() {
    this.loadMatches()
    wx.stopPullDownRefresh()
  },

  switchStatus(e) {
    const status = e.currentTarget.dataset.status
    this.setData({ status }, () => {
      this.loadMatches()
    })
  },

  goToCreateMatch() {
    wx.navigateTo({ url: '/pages/match/create' })
  },

  goToMatchDetail(e) {
    const matchId = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/match/detail?id=${matchId}` })
  }
})
