const eventsApp = getApp<IAppOption>()

type EventScope = 'created' | 'signed'

let loadSeq = 0

Page({
  data: {
    scope: 'signed' as EventScope,
    emptyText: '还没有报名的比赛',
    events: [] as Array<Record<string, any>>,
    isLoading: true
  },

  onLoad(query: Record<string, string | undefined>) {
    const scope: EventScope = query.scope === 'created' ? 'created' : 'signed'
    const title = scope === 'created' ? '我发起的' : '我报名的'
    const emptyText = scope === 'created' ? '还没有发起的比赛' : '还没有报名的比赛'
    this.setData({ scope, emptyText })
    wx.setNavigationBarTitle({ title })
  },

  onShow() {
    if (!eventsApp.globalData.isLogin) {
      wx.showModal({
        title: '提示',
        content: '请先登录',
        confirmText: '去登录',
        success: (res) => {
          if (!res.confirm) {
            wx.navigateBack()
            return
          }
          eventsApp.login({
            success: () => {
              void this.loadEvents()
            },
            fail: () => {
              wx.navigateBack()
            }
          })
        }
      })
      return
    }
    void this.loadEvents()
  },

  onPullDownRefresh() {
    void this.loadEvents().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadEvents() {
    const seq = loadSeq + 1
    loadSeq = seq
    const scope = this.data.scope
    if (!this.data.events.length) this.setData({ isLoading: true })
    try {
      const res = await eventsApp.callFunction<Array<Record<string, any>>>({
        name: 'getEvents',
        data: { scope }
      })
      if (seq !== loadSeq) return
      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '加载失败', icon: 'none' })
        return
      }
      this.setData({ events: res.result.data || [] })
    } catch (err) {
      if (seq !== loadSeq) return
      console.error('加载我的比赛失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      if (seq === loadSeq) this.setData({ isLoading: false })
    }
  },

  goToEventDetail(e: WechatMiniprogram.CustomEvent<{ id?: string }>) {
    const eventId = e.detail.id
    if (!eventId) return
    wx.navigateTo({ url: `/pages/event/detail?id=${eventId}` })
  }
})
