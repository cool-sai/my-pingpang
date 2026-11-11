import { getNavLayout } from '../../utils/nav'
import { AVATAR_PLACEHOLDER } from '../../utils/avatar'
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
  tab?: boolean
}

Page({
  data: {
    navPad: getNavLayout().navHeight,
    placeholder: AVATAR_PLACEHOLDER,
    userInfo: null as IUserInfo | null,
    stats: {
      totalMatches: 0,
      winRate: 0,
      score: 0
    } as IUserStats,
    menuItems: [
      { id: 'created', icon: '📌', title: '我发起的', url: '/pages/user/events?scope=created' },
      { id: 'signed', icon: '📝', title: '我报名的', url: '/pages/user/events?scope=signed' },
      { id: 'record', icon: '🏓', title: '我的战绩', url: '/pages/match/match' },
      { id: 'score', icon: '🏆', title: '积分', url: '/pages/user/detail' },
      { id: 'virtuals', icon: '👥', title: '虚拟球友', url: '/pages/user/virtuals' },
      { id: 'credit', icon: '✅', title: '我的信用', url: '' }
    ] as IMenuItem[]
  },

  onLoad() {
    if (userApp.globalData.isLogin) {
      this.setData({ userInfo: userApp.globalData.userInfo })
      this.loadUserStats()
    }
  },

  onNavLayout(e: WechatMiniprogram.CustomEvent<{ navHeight?: number }>) {
    const navHeight = Number(e.detail.navHeight) || getNavLayout().navHeight
    this.setData({ navPad: navHeight })
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
        if (!userInfo.profileReady) {
          wx.navigateTo({ url: '/pages/user/profile?required=1' })
          return
        }
        wx.showToast({ title: '登录成功', icon: 'success' })
      },
      fail: (err) => {
        wx.showModal({
          title: '登录失败',
          content: String(err || '登录失败'),
          showCancel: false
        })
      }
    })
  },

  onEditProfile() {
    wx.navigateTo({ url: '/pages/user/profile' })
  },

  goToMenu(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id
    const url = e.currentTarget.dataset.url
    const tab = e.currentTarget.dataset.tab
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
    if (id === 'credit') {
      const credit = userApp.globalData.userInfo?.creditScore || 80
      wx.showModal({
        title: '我的信用',
        content: `当前信用分 ${credit}。新用户从 80 分起算，报名后无故缺席会扣分。`,
        showCancel: false
      })
      return
    }
    if (tab) {
      wx.switchTab({ url })
      return
    }
    wx.navigateTo({ url })
  }
})
