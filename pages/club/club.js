// pages/club/club.js
Page({
  data: {
    clubs: [],
    isLoading: false,
    sortBy: 'score' // score, members
  },

  onLoad() {
    this.loadClubs()
  },

  onShow() {
    this.loadClubs()
  },

  async loadClubs() {
    this.setData({ isLoading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getClubs',
        data: { sortBy: this.data.sortBy }
      })
      if (res.result.success) {
        this.setData({ clubs: res.result.data })
      }
    } catch (err) {
      console.error('加载俱乐部失败', err)
    } finally {
      this.setData({ isLoading: false })
    }
  },

  onPullDownRefresh() {
    this.loadClubs()
    wx.stopPullDownRefresh()
  },

  switchSort(e) {
    const sortBy = e.currentTarget.dataset.sort
    this.setData({ sortBy }, () => {
      this.loadClubs()
    })
  },

  goToClubDetail(e) {
    const clubId = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/club/detail?id=${clubId}` })
  },

  goToCreateClub() {
    wx.navigateTo({ url: '/pages/club/create' })
  }
})
