const rankApp = getApp<IAppOption>()

type RankFilter = 'all' | 'club'

interface IRankingResult {
  list: Array<Record<string, any>>
  myRank: Record<string, any> | null
}

Page({
  data: {
    rankings: [] as Array<Record<string, any>>,
    isLoading: false,
    filter: 'all' as RankFilter,
    myRank: null as Record<string, any> | null
  },

  onLoad() {
    void this.loadRankings()
  },

  onShow() {
    void this.loadRankings()
  },

  async loadRankings() {
    this.setData({ isLoading: true })
    try {
      const res = await rankApp.callFunction<IRankingResult>({
        name: 'getRankings',
        data: { filter: this.data.filter }
      })
      if (res.result.success) {
        this.setData({
          rankings: res.result.data.list || [],
          myRank: res.result.data.myRank || null
        })
      }
    } catch (err) {
      console.error('加载排名失败', err)
    } finally {
      this.setData({ isLoading: false })
    }
  },

  onPullDownRefresh() {
    void this.loadRankings().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  switchFilter(e: WechatMiniprogram.BaseEvent) {
    const filter = (e.currentTarget.dataset.filter || 'all') as RankFilter
    this.setData({ filter }, () => {
      void this.loadRankings()
    })
  },

  goToUserDetail(e: WechatMiniprogram.BaseEvent) {
    const openid = e.currentTarget.dataset.openid
    wx.navigateTo({ url: `/pages/user/detail?openid=${openid}` })
  }
})
