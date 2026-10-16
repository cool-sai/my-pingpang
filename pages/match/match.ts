import { TabIndex } from '../../utils/tab'

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
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: TabIndex.Match })
    }
    if (matchApp.globalData.isLogin) {
      void this.loadMatches()
    }
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
    wx.navigateTo({ url: '/pages/match/create' })
  },

  goToMatchDetail(e: WechatMiniprogram.BaseEvent) {
    const matchId = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/match/detail?id=${matchId}` })
  }
})
