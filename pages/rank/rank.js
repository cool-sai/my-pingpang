// pages/rank/rank.js
Page({
  data: {
    rankings: [],
    isLoading: false,
    filter: 'all', // all, club
    myRank: null
  },

  onLoad() {
    this.loadRankings()
  },

  onShow() {
    this.loadRankings()
  },

  async loadRankings() {
    this.setData({ isLoading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getRankings',
        data: { filter: this.data.filter }
      })
      if (res.result.success) {
        this.setData({
          rankings: res.result.data.list,
          myRank: res.result.data.myRank
        })
      }
    } catch (err) {
      console.error('加载排名失败', err)
    } finally {
      this.setData({ isLoading: false })
    }
  },

  onPullDownRefresh() {
    this.loadRankings()
    wx.stopPullDownRefresh()
  },

  switchFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({ filter }, () => {
      this.loadRankings()
    })
  },

  goToUserDetail(e) {
    const openid = e.currentTarget.dataset.openid
    wx.navigateTo({ url: `/pages/user/detail?openid=${openid}` })
  }
})
