// pages/user/user.js
const app = getApp()

Page({
  data: {
    userInfo: null,
    stats: {
      totalMatches: 0,
      winRate: 0,
      score: 0
    },
    menuItems: [
      { id: 'matches', icon: '🎾', title: '我的比赛', url: '/pages/match/match' },
      { id: 'clubs', icon: '🏠', title: '我的俱乐部', url: '/pages/club/my' },
      { id: 'favorites', icon: '⭐', title: '我的收藏', url: '/pages/user/favorites' },
      { id: 'settings', icon: '⚙️', title: '设置', url: '/pages/user/settings' }
    ]
  },

  onLoad() {
    if (app.globalData.isLogin) {
      this.setData({ userInfo: app.globalData.userInfo })
      this.loadUserStats()
    }
  },

  onShow() {
    if (app.globalData.isLogin) {
      this.setData({
        userInfo: app.globalData.userInfo
      })
      this.loadUserStats()
    }
  },

  loadUserStats() {
    const userInfo = app.globalData.userInfo
    if (userInfo) {
      const winRate = userInfo.totalMatches > 0
        ? Math.round(userInfo.winMatches / userInfo.totalMatches * 100)
        : 0
      this.setData({
        stats: {
          totalMatches: userInfo.totalMatches || 0,
          winRate: winRate,
          score: userInfo.score || 0
        }
      })
    }
  },

  onLogin() {
    app.login({
      success: (userInfo) => {
        this.setData({
          userInfo: userInfo,
          isLogin: true
        })
        this.loadUserStats()
        wx.showToast({ title: '登录成功', icon: 'success' })
      },
      fail: (err) => {
        wx.showToast({ title: '登录失败', icon: 'none' })
        console.error('登录失败', err)
      }
    })
  },

  goToMenu(e) {
    const url = e.currentTarget.dataset.url
    if (!app.globalData.isLogin) {
      wx.showModal({
        title: '提示',
        content: '请先登录',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) this.onLogin()
        }
      })
      return
    }
    wx.navigateTo({ url })
  }
})
