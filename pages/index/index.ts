import { newsList } from '../../data/news'
import { TabIndex } from '../../utils/tab'

const indexApp = getApp<IAppOption>()
const REGION_KEY = 'homeEventRegion'
let promptedProfile = false
let eventLoadSeq = 0

function readRegion() {
  const saved = wx.getStorageSync(REGION_KEY) || {}
  const province = String(saved.province || '')
  const city = String(saved.city || '')
  const region = Array.isArray(saved.region) ? saved.region.map((item: unknown) => String(item)) : []
  return {
    province,
    city,
    region,
    regionText: province && city ? `${province} ${city}` : '全部城市'
  }
}

function writeRegion(province: string, city: string, region: string[]) {
  if (!province && !city) {
    wx.removeStorageSync(REGION_KEY)
    return
  }
  wx.setStorageSync(REGION_KEY, { province, city, region })
}

function regionView(province: string, city: string, region: string[]) {
  return {
    province,
    city,
    region: region.length ? region : province && city ? [province, city] : [],
    regionText: province && city ? `${province} ${city}` : '全部城市'
  }
}

interface IEventCard {
  _id: string
  name: string
  startTime?: string
  location?: string
  status?: string
  statusText?: string
  signupCount?: number
  maxPlayers?: number
  format?: string
  creatorName?: string
  province?: string
  city?: string
}

Page({
  data: {
    news: newsList,
    events: [] as IEventCard[],
    isLoading: true,
    region: [] as string[],
    province: '',
    city: '',
    regionText: '全部城市'
  },

  onLoad() {
    const chosen = this.currentRegion()
    this.setData(regionView(chosen.province, chosen.city, chosen.region))
    void this.loadEvents()
    if (chosen.upload) {
      void this.saveRegion(chosen.province, chosen.city, chosen.region, false)
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: TabIndex.Index })
    }
    const user = indexApp.globalData.userInfo
    if (!promptedProfile && indexApp.globalData.isLogin && user && !user.profileReady) {
      promptedProfile = true
      wx.navigateTo({ url: '/pages/user/profile?required=1' })
    }
  },

  onPullDownRefresh() {
    void this.loadEvents().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  currentRegion() {
    const local = readRegion()
    const user = indexApp.globalData.userInfo
    if (!indexApp.globalData.isLogin || !user) {
      return { province: local.province, city: local.city, region: local.region, upload: false }
    }
    if (user.province == null && user.city == null) {
      return {
        province: local.province,
        city: local.city,
        region: local.region,
        upload: Boolean(local.province && local.city)
      }
    }
    const province = String(user.province || '')
    const city = String(user.city || '')
    return { province, city, region: province && city ? [province, city] : [], upload: false }
  },

  async saveRegion(province: string, city: string, region: string[], reload: boolean) {
    writeRegion(province, city, region)
    this.setData(regionView(province, city, region))
    if (reload) void this.loadEvents()
    if (!indexApp.globalData.isLogin) return
    try {
      const result = await indexApp.callFunction<IUserInfo>({
        name: 'updateUser',
        data: { action: 'region', province, city }
      })
      if (!result.result.success || !result.result.data) {
        wx.showToast({ title: result.result.error || '保存失败', icon: 'none' })
        return
      }
      indexApp.saveUser(result.result.data)
    } catch (err) {
      console.error('保存筛选省市失败', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  setRegion(e: WechatMiniprogram.CustomEvent<{ value?: string[] }>) {
    const value = e.detail.value || []
    const province = String(value[0] || '')
    const city = String(value[1] || '')
    void this.saveRegion(province, city, value, true)
  },

  clearRegion() {
    void this.saveRegion('', '', [], true)
  },

  async loadEvents() {
    const seq = ++eventLoadSeq
    const province = this.data.province
    const city = this.data.city
    this.setData({ isLoading: true })
    try {
      const res = await indexApp.callFunction<IEventCard[]>({ name: 'getEvents', data: {} })
      if (seq !== eventLoadSeq) return
      const all = res.result.success ? res.result.data || [] : []
      const events = province && city
        ? all.filter((item) => item.province === province && item.city === city)
        : all
      this.setData({ events, isLoading: false })
    } catch (err) {
      console.error('加载首页赛事失败', err)
      if (seq !== eventLoadSeq) return
      this.setData({ isLoading: false })
    }
  },

  goToNews(e: WechatMiniprogram.BaseEvent) {
    const newsId = e.currentTarget.dataset.id
    if (!newsId) return
    wx.navigateTo({ url: `/pages/news/detail?id=${newsId}` })
  },

  goToEventDetail(e: WechatMiniprogram.CustomEvent<{ id?: string }>) {
    const eventId = e.detail.id
    if (!eventId) return
    wx.navigateTo({ url: `/pages/event/detail?id=${eventId}` })
  },

  goToCreate() {
    indexApp.requireLogin('登录后才能创建比赛', {
      success: () => {
        wx.navigateTo({ url: '/pages/event/edit' })
      },
      fail: (error) => {
        if (error === '取消登录') return
        wx.showToast({ title: '登录失败', icon: 'none' })
      }
    })
  }
})
