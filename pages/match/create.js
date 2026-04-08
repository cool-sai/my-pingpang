// pages/match/create.js
const app = getApp()

Page({
  data: {
    opponentName: '',
    opponentOpenid: '',
    player1Score: 0,
    player2Score: 0,
    location: '',
    matchType: 'friendly',
    isSearching: false
  },

  onLoad() {
    const userInfo = app.globalData.userInfo
    if (!userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(() => wx.switchTab({ url: '/pages/user/user' }), 1000)
    }
  },

  // 搜索对手
  async searchOpponent(e) {
    const nickname = e.detail.value.trim()
    if (!nickname) return

    this.setData({ isSearching: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'searchUser',
        data: { nickname }
      })
      if (res.result.success && res.result.data.length > 0) {
        this.setData({
          opponentOpenid: res.result.data[0].openid,
          opponentName: res.result.data[0].nickname
        })
        wx.showToast({ title: '找到对手', icon: 'success' })
      } else {
        wx.showToast({ title: '未找到用户', icon: 'none' })
      }
    } catch (err) {
      wx.showToast({ title: '搜索失败', icon: 'none' })
    } finally {
      this.setData({ isSearching: false })
    }
  },

  // 设置比分
  setScore(e) {
    const { player, value } = e.currentTarget.dataset
    const score = parseInt(value) || 0
    if (score < 0 || score > 99) return
    this.setData({ [player]: score })
  },

  incrementScore(player) {
    const current = this.data[player]
    if (current < 99) {
      this.setData({ [player]: current + 1 })
    }
  },

  decrementScore(player) {
    const current = this.data[player]
    if (current > 0) {
      this.setData({ [player]: current - 1 })
    }
  },

  // 设置地点
  setLocation(e) {
    this.setData({ location: e.detail.value })
  },

  // 提交比赛
  async submitMatch() {
    const { opponentOpenid, player1Score, player2Score, location } = this.data

    if (!opponentOpenid) {
      wx.showToast({ title: '请先搜索并选择对手', icon: 'none' })
      return
    }

    wx.showLoading({ title: '提交中...' })

    try {
      const res = await wx.cloud.callFunction({
        name: 'createMatch',
        data: {
          opponentOpenid,
          player1Score,
          player2Score,
          location,
          matchType: 'friendly'
        }
      })

      wx.hideLoading()

      if (res.result.success) {
        const { winner, scoreChange } = res.result.data
        const myChange = scoreChange.player1
        wx.showModal({
          title: '比赛记录成功',
          content: `${myChange >= 0 ? '+' : ''}${myChange}积分`,
          showCancel: false,
          success: () => {
            wx.navigateBack()
          }
        })
      } else {
        wx.showToast({ title: res.result.error, icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '提交失败', icon: 'none' })
      console.error(err)
    }
  }
})
