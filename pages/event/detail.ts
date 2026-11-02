import { avatarSrc } from '../../utils/avatar'

const detailApp = getApp<IAppOption>()

interface ISignupRow {
  openid: string
  nickname: string
  avatar: string
}

Page({
  data: {
    eventId: '',
    event: null as Record<string, any> | null,
    signups: [] as ISignupRow[],
    signed: false,
    full: false,
    isLoading: true,
    isOwner: false,
    deleting: false,
    signing: false,
    showManage: false
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ eventId: query.id || '' })
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
      const signups = (Array.isArray(event && event.signups) ? event.signups : []).map((item: ISignupRow) => ({
        openid: String(item.openid || ''),
        nickname: item.nickname || '球友',
        avatar: avatarSrc(item.avatar)
      }))
      const signupCount = Number(event && event.signupCount) || 0
      const maxPlayers = Number(event && event.maxPlayers) || 0
      this.setData({
        event,
        signups,
        isOwner: !!(event && openid && event.creatorOpenid === openid),
        signed: !!(openid && signups.some((item) => item.openid === openid)),
        full: !!(event && maxPlayers > 0 && signupCount >= maxPlayers)
      })
    } catch (err) {
      console.error('加载赛事详情失败', err)
    } finally {
      this.setData({ isLoading: false })
    }
  },

  goToRoster() {
    if (!this.data.eventId) return
    wx.navigateTo({ url: `/pages/event/roster?id=${this.data.eventId}` })
  },

  onSignupTap() {
    if (!this.data.event || this.data.signing) return
    if (this.data.signed) {
      wx.showModal({
        title: '取消报名？',
        confirmText: '取消报名',
        confirmColor: '#d14343',
        success: (res) => {
          if (!res.confirm) return
          void this.submitCancel()
        }
      })
      return
    }
    if (this.data.full || this.data.event.status === 'finished') return
    this.onSignup()
  },

  onSignup() {
    if (!this.data.event || this.data.signed || this.data.signing || this.data.full || this.data.event.status === 'finished') return
    detailApp.requireLogin('登录后才能报名', {
      success: () => {
        void this.submitSignup()
      },
      fail: (error) => {
        if (error === '取消登录') return
        wx.showToast({ title: '登录失败', icon: 'none' })
      }
    })
  },

  async submitSignup() {
    if (this.data.signing) return
    this.setData({ signing: true })
    try {
      const res = await detailApp.callFunction<{ signupCount?: number }>({
        name: 'signupEvent',
        data: { id: this.data.eventId }
      })
      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '报名失败', icon: 'none' })
        return
      }
      await this.loadEvent(this.data.eventId)
      wx.showToast({ title: '报名成功', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: '报名失败', icon: 'none' })
      console.error(err)
    } finally {
      this.setData({ signing: false })
    }
  },

  async submitCancel() {
    if (this.data.signing) return
    this.setData({ signing: true })
    try {
      const res = await detailApp.callFunction<{ signupCount?: number }>({
        name: 'signupEvent',
        data: { id: this.data.eventId, action: 'cancel' }
      })
      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '取消失败', icon: 'none' })
        return
      }
      await this.loadEvent(this.data.eventId)
      wx.showToast({ title: '已取消报名', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: '取消失败', icon: 'none' })
      console.error(err)
    } finally {
      this.setData({ signing: false })
    }
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

  openManage() {
    if (!this.data.isOwner) return
    this.setData({ showManage: true })
  },

  closeManage() {
    this.setData({ showManage: false })
  },

  stopMove() {},

  goToEdit() {
    if (!this.data.eventId) return
    this.setData({ showManage: false })
    wx.navigateTo({ url: `/pages/event/edit?id=${this.data.eventId}` })
  },

  onDelete() {
    if (this.data.deleting || !this.data.event) return
    this.setData({ showManage: false })
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
