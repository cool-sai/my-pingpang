const indexApp = getApp<IAppOption>()

interface IHomeData {
  topPlayers: IUserInfo[]
  hotClubs: Array<Record<string, any>>
  currentEvents: Array<Record<string, any>>
}

Page({
  data: {
    userInfo: null as IUserInfo | null,
    topPlayers: [] as IUserInfo[],
    hotClubs: [] as Array<Record<string, any>>,
    currentEvents: [] as Array<Record<string, any>>
  },

  onLoad() {
    this.checkLogin()
  },

  onShow() {
    if (indexApp.globalData.isLogin) {
      this.setData({
        userInfo: indexApp.globalData.userInfo
      })
      void this.loadData()
    }
  },

  onPullDownRefresh() {
    void this.loadData().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  checkLogin() {
    if (!indexApp.globalData.isLogin) {
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
      const res = await indexApp.callFunction<IHomeData>({
        name: 'getHomeData'
      })

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
