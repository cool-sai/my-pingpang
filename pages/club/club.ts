const clubApp = getApp<IAppOption>()

type ClubSort = 'score' | 'members'

Page({
  data: {
    clubs: [] as Array<Record<string, any>>,
    isLoading: false,
    sortBy: 'score' as ClubSort
  },

  onLoad() {
    void this.loadClubs()
  },

  onShow() {
    void this.loadClubs()
  },

  async loadClubs() {
    this.setData({ isLoading: true })
    try {
      const res = await clubApp.callFunction<Array<Record<string, any>>>({
        name: 'getClubs',
        data: { sortBy: this.data.sortBy }
      })
      if (res.result.success) {
        this.setData({ clubs: res.result.data || [] })
      }
    } catch (err) {
      console.error('加载俱乐部失败', err)
    } finally {
      this.setData({ isLoading: false })
    }
  },

  onPullDownRefresh() {
    void this.loadClubs().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  switchSort(e: WechatMiniprogram.BaseEvent) {
    const sortBy = (e.currentTarget.dataset.sort || 'score') as ClubSort
    this.setData({ sortBy }, () => {
      void this.loadClubs()
    })
  },

  goToClubDetail(e: WechatMiniprogram.BaseEvent) {
    const clubId = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/club/detail?id=${clubId}` })
  },

  goToCreateClub() {
    wx.navigateTo({ url: '/pages/club/create' })
  }
})
