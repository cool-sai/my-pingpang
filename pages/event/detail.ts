const detailApp = getApp<IAppOption>()
const SIGNUP_KEY = 'eventSignups'

Page({
  data: {
    eventId: '',
    event: null as Record<string, any> | null,
    signed: false,
    isLoading: true,
    isOwner: false,
    deleting: false
  },

  onLoad(query: Record<string, string | undefined>) {
    const eventId = query.id || ''
    const signedIds = (wx.getStorageSync(SIGNUP_KEY) || []) as string[]
    this.setData({
      eventId,
      signed: signedIds.indexOf(eventId) >= 0
    })
  },

  onShow() {
    if (!this.data.eventId) {
      this.setData({ isLoading: false })
      return
    }
    void this.loadEvent(this.data.eventId)
  },

  async loadEvent(eventId: string) {
    try {
      const res = await detailApp.callFunction<Array<Record<string, any>>>({
        name: 'getEvents',
        data: { id: eventId, status: 'all' }
      })
      const event = (res.result.data || []).find((item) => item._id === eventId) || null
      if (event) {
        const latitude = Number(event.latitude)
        const longitude = Number(event.longitude)
        event.hasMap =
          event.latitude != null &&
          event.longitude != null &&
          Number.isFinite(latitude) &&
          Number.isFinite(longitude)
      }
      const openid = detailApp.globalData.openid
      this.setData({
        event,
        isOwner: !!(event && openid && event.creatorOpenid === openid)
      })
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
        const openid = detailApp.globalData.openid
        this.setData({
          signed: true,
          isOwner: !!(this.data.event && openid && this.data.event.creatorOpenid === openid)
        })
        wx.showToast({ title: '报名成功', icon: 'success' })
      },
      fail: (error) => {
        if (error === '取消登录') return
        wx.showToast({ title: '登录失败', icon: 'none' })
      }
    })
  },

  openLocation() {
    const event = this.data.event
    if (!event || !event.hasMap) return
    const latitude = Number(event.latitude)
    const longitude = Number(event.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
    wx.openLocation({
      latitude,
      longitude,
      name: event.location || '',
      address: event.locationAddress || event.location || '',
      scale: 16
    })
  },

  goToEdit() {
    if (!this.data.eventId) return
    wx.navigateTo({ url: `/pages/event/edit?id=${this.data.eventId}` })
  },

  onDelete() {
    if (this.data.deleting || !this.data.event) return
    const name = this.data.event.name || '这场比赛'
    wx.showModal({
      title: '删除这场比赛？',
      content: name,
      confirmText: '删除',
      confirmColor: '#d14343',
      success: (res) => {
        if (!res.confirm) return
        void this.deleteEvent()
      }
    })
  },

  async deleteEvent() {
    this.setData({ deleting: true })
    wx.showLoading({ title: '删除中' })
    try {
      const res = await detailApp.callFunction({
        name: 'deleteEvent',
        data: { id: this.data.eventId }
      })
      wx.hideLoading()
      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '删除失败', icon: 'none' })
        return
      }
      wx.showToast({ title: '已删除', icon: 'success' })
      wx.navigateBack()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '删除失败', icon: 'none' })
      console.error(err)
    } finally {
      this.setData({ deleting: false })
    }
  }
})
