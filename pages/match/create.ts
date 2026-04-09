const createMatchApp = getApp<IAppOption>()

type ScoreField = 'player1Score' | 'player2Score'
type IValueEvent = WechatMiniprogram.BaseEvent & {
  detail: {
    value?: string
  }
}

interface ISearchUserResult {
  openid: string
  nickname: string
}

interface ICreateMatchResult {
  winner?: string
  scoreChange?: {
    player1?: number
    player2?: number
  }
}

Page({
  data: {
    searchKeyword: '',
    opponentName: '',
    opponentOpenid: '',
    player1Score: 0,
    player2Score: 0,
    location: '',
    matchType: 'friendly',
    isSearching: false
  },

  onLoad() {
    if (!createMatchApp.globalData.userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/user/user' })
      }, 1000)
    }
  },

  setSearchKeyword(e: IValueEvent) {
    this.setData({
      searchKeyword: (e.detail.value || '').trim()
    })
  },

  async searchOpponent(e?: IValueEvent) {
    const nickname = ((e?.detail?.value || this.data.searchKeyword) ?? '').trim()
    if (!nickname) return

    this.setData({ isSearching: true })
    try {
      const res = await createMatchApp.callFunction<ISearchUserResult[]>({
        name: 'searchUser',
        data: { nickname }
      })

      if (res.result.success && res.result.data.length > 0) {
        this.setData({
          searchKeyword: nickname,
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

  setScore(e: WechatMiniprogram.BaseEvent) {
    const player = e.currentTarget.dataset.player as ScoreField
    const rawValue = e.currentTarget.dataset.value
    const score = Number.parseInt(String(rawValue || '0'), 10) || 0

    if (!player || score < 0 || score > 99) return
    this.setData({ [player]: score })
  },

  incrementScore(e: WechatMiniprogram.BaseEvent) {
    const player = e.currentTarget.dataset.player as ScoreField
    const current = this.data[player]

    if (player && current < 99) {
      this.setData({ [player]: current + 1 })
    }
  },

  decrementScore(e: WechatMiniprogram.BaseEvent) {
    const player = e.currentTarget.dataset.player as ScoreField
    const current = this.data[player]

    if (player && current > 0) {
      this.setData({ [player]: current - 1 })
    }
  },

  setLocation(e: IValueEvent) {
    this.setData({ location: e.detail.value })
  },

  async submitMatch() {
    const { opponentOpenid, player1Score, player2Score, location } = this.data

    if (!opponentOpenid) {
      wx.showToast({ title: '请先搜索并选择对手', icon: 'none' })
      return
    }

    wx.showLoading({ title: '提交中...' })

    try {
      const res = await createMatchApp.callFunction<ICreateMatchResult>({
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
        const myChange = res.result.data.scoreChange?.player1 || 0
        wx.showModal({
          title: '比赛记录成功',
          content: `${myChange >= 0 ? '+' : ''}${myChange}积分`,
          showCancel: false,
          success: () => {
            wx.navigateBack()
          }
        })
      } else {
        wx.showToast({ title: res.result.error || '提交失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '提交失败', icon: 'none' })
      console.error(err)
    }
  }
})
