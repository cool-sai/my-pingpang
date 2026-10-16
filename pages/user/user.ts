import { TabIndex } from '../../utils/tab'

const userApp = getApp<IAppOption>()

interface IUserStats {
  totalMatches: number
  winRate: number
  score: number
}

interface IMenuItem {
  id: string
  icon: string
  title: string
  url: string
}

Page({
  data: {
    userInfo: null as IUserInfo | null,
    stats: {
      totalMatches: 0,
      winRate: 0,
      score: 0
    } as IUserStats,
    menuItems: [
      { id: 'matches', icon: '🎾', title: '我的比赛', url: '/pages/match/match' },
      { id: 'clubs', icon: '🏠', title: '我的俱乐部', url: '/pages/club/my' },
      { id: 'favorites', icon: '⭐', title: '我的收藏', url: '/pages/user/favorites' },
      { id: 'settings', icon: '⚙️', title: '设置', url: '/pages/user/settings' }
    ] as IMenuItem[]
  },

  onLoad() {
    if (userApp.globalData.isLogin) {
      this.setData({ userInfo: userApp.globalData.userInfo })
      this.loadUserStats()
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: TabIndex.User })
    }
    if (userApp.globalData.isLogin) {
      this.setData({
        userInfo: userApp.globalData.userInfo
      })
      this.loadUserStats()
    } else {
      this.setData({
        userInfo: null,
        stats: { totalMatches: 0, winRate: 0, score: 0 }
      })
    }
  },

  loadUserStats() {
    const userInfo = userApp.globalData.userInfo
    if (userInfo) {
      const totalMatches = userInfo.totalMatches || 0
      const winMatches = userInfo.winMatches || 0
      const winRate = totalMatches > 0
        ? Math.round((winMatches / totalMatches) * 100)
        : 0

      this.setData({
        stats: {
          totalMatches,
          winRate,
          score: userInfo.score || 0
        }
      })
    }
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后可以重新登录',
      confirmText: '退出',
      confirmColor: '#d14343',
      success: (res) => {
        if (res.confirm) {
          userApp.logout()
          this.setData({
            userInfo: null,
            stats: { totalMatches: 0, winRate: 0, score: 0 }
          })
          wx.showToast({ title: '已退出登录', icon: 'none' })
        }
      }
    })
  },

  onLogin() {
    userApp.login({
      success: (userInfo) => {
        this.setData({
          userInfo
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

  goToMenu(e: WechatMiniprogram.BaseEvent) {
    const url = e.currentTarget.dataset.url
    if (!userApp.globalData.isLogin) {
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
