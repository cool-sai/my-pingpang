const matchApp = getApp<IAppOption>()

type MatchStatus = 'all' | 'pending' | 'completed'

Page({
  data: {
    matches: [] as Array<Record<string, any>>,
    isLoading: false,
    status: 'all' as MatchStatus
  },

  onLoad() {
    void this.loadMatches()
  },

  onShow() {
    void this.loadMatches()
  },

  async loadMatches() {
    this.setData({ isLoading: true })
    try {
      const res = await matchApp.callFunction<Array<Record<string, any>>>({
        name: 'getMatches',
        data: { status: this.data.status }
      })
      if (res.result.success) {
        this.setData({ matches: res.result.data || [] })
      }
    } catch (err) {
      console.error('加载比赛记录失败', err)
    } finally {
      this.setData({ isLoading: false })
    }
  },

  onPullDownRefresh() {
    void this.loadMatches().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  switchStatus(e: WechatMiniprogram.BaseEvent) {
    const status = (e.currentTarget.dataset.status || 'all') as MatchStatus
    this.setData({ status }, () => {
      void this.loadMatches()
    })
  },

  goToCreateMatch() {
    matchApp.requireLogin('登录后才能发起比赛', {
      success: () => {
        wx.navigateTo({ url: '/pages/match/create' })
      },
      fail: (error) => {
        if (error === '取消登录') return
        wx.showToast({ title: '登录失败', icon: 'none' })
      }
    })
  },

  goToMatchDetail(e: WechatMiniprogram.BaseEvent) {
    const matchId = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/match/detail?id=${matchId}` })
  }
})
