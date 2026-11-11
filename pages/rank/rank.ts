import { getNavLayout } from '../../utils/nav'
import { TabIndex } from '../../utils/tab'

const rankApp = getApp<IAppOption>()

type RankFilter = 'all' | 'club'

interface IRankingResult {
  list: Array<Record<string, any>>
  myRank: Record<string, any> | null
}

Page({
  data: {
    navPad: getNavLayout().navHeight,
    rankings: [] as Array<Record<string, any>>,
    isLoading: true,
    filter: 'all' as RankFilter,
    myRank: null as Record<string, any> | null,
    isLogin: false
  },

  onLoad() {
    this.setData({ isLogin: rankApp.globalData.isLogin })
    void this.loadRankings()
  },

  onNavLayout(e: WechatMiniprogram.CustomEvent<{ navHeight?: number; titleBarHeight?: number }>) {
    const navHeight = Number(e.detail.navHeight) || getNavLayout().navHeight
    const titleBarHeight = Number(e.detail.titleBarHeight) || 44
    // 标题行再加点底距，绿头更融入
    this.setData({ navPad: navHeight - 4 })
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: TabIndex.Rank })
    }
    this.setData({ isLogin: rankApp.globalData.isLogin })
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
        const isLogin = rankApp.globalData.isLogin
        this.setData({
          rankings: res.result.data.list || [],
          myRank: isLogin ? (res.result.data.myRank || null) : null,
          isLogin
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

  onViewMyRank() {
    if (this.data.isLogin) {
      wx.navigateTo({ url: '/pages/user/detail' })
      return
    }
    rankApp.requireLogin('登录后查看我的排名', {
      success: () => {
        void this.loadRankings()
      },
      fail: (error) => {
        if (error === '取消登录') return
        wx.showToast({ title: '登录失败', icon: 'none' })
      }
    })
  },

  goToUserDetail(e: WechatMiniprogram.BaseEvent) {
    const openid = e.currentTarget.dataset.openid
    wx.navigateTo({ url: `/pages/user/detail?openid=${openid}` })
  }
})
