const detailApp = getApp<IAppOption>()
const SIGNUP_KEY = 'eventSignups'

Page({
  data: {
    eventId: '',
    event: null as Record<string, any> | null,
    signed: false,
    isLoading: true
  },

  onLoad(query: Record<string, string | undefined>) {
    const eventId = query.id || ''
    const signedIds = (wx.getStorageSync(SIGNUP_KEY) || []) as string[]
    this.setData({
      eventId,
      signed: signedIds.indexOf(eventId) >= 0
    })
    void this.loadEvent(eventId)
  },

  async loadEvent(eventId: string) {
    try {
      const res = await detailApp.callFunction<Array<Record<string, any>>>({
        name: 'getEvents',
        data: { status: 'all' }
      })
      const event = (res.result.data || []).find((item) => item._id === eventId) || null
      this.setData({ event })
    } catch (err) {
      console.error('加载赛事详情失败', err)
    } finally {
      this.setData({ isLoading: false })
    }
  },

  onSignup() {
    if (!this.data.event || this.data.signed || this.data.event.status === 'finished') return
    detailApp.requireLogin('登录后才能报名', {
      success: () => {
        const ids = ((wx.getStorageSync(SIGNUP_KEY) || []) as string[]).slice()
        if (ids.indexOf(this.data.eventId) < 0) ids.push(this.data.eventId)
        wx.setStorageSync(SIGNUP_KEY, ids)
        this.setData({ signed: true })
        wx.showToast({ title: '报名成功', icon: 'success' })
      },
      fail: (error) => {
        if (error === '取消登录') return
        wx.showToast({ title: '登录失败', icon: 'none' })
      }
    })
  }
})
