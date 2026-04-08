// pages/index/index.js
const app = getApp()

Page({
  data: {
    userInfo: null,
    topPlayers: [],
    hotClubs: [],
    currentEvents: []
  },

  onLoad() {
    this.checkLogin()
  },

  onShow() {
    if (app.globalData.isLogin) {
      this.setData({
        userInfo: app.globalData.userInfo
      })
      this.loadData()
    }
  },

  onPullDownRefresh() {
    this.loadData()
    wx.stopPullDownRefresh()
  },

  checkLogin() {
    if (!app.globalData.isLogin) {
      wx.showModal({
        title: '提示',
        content: '请先登录后使用',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/user/user' })
          }
        }
      })
    }
  },

  async loadData() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getHomeData' })
      if (res.result.success) {
        this.setData({
          topPlayers: res.result.data.topPlayers || [],
          hotClubs: res.result.data.hotClubs || [],
          currentEvents: res.result.data.currentEvents || []
        })
      }
    } catch (err) {
      console.error('加载首页数据失败', err)
    }
  },

  goToMatch() {
    wx.navigateTo({ url: '/pages/match/match' })
  },

  goToRank() {
    wx.switchTab({ url: '/pages/rank/rank' })
  },

  goToEvent() {
    wx.switchTab({ url: '/pages/event/event' })
  },

  goToClub() {
    wx.switchTab({ url: '/pages/club/club' })
  }
})
