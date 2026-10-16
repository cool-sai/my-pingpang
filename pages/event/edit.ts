const editApp = getApp<IAppOption>()

const FORMATS = ['积分赛', '循环赛', '淘汰赛']
const STATUS_LABELS = ['报名中', '进行中', '已结束']
const STATUS_VALUES = ['upcoming', 'ongoing', 'finished']

Page({
  data: {
    eventId: '',
    ready: false,
    submitting: false,
    name: '',
    date: '',
    time: '',
    location: '',
    description: '',
    maxPlayers: '',
    formats: FORMATS,
    statusLabels: STATUS_LABELS,
    formatIndex: 0,
    statusIndex: 0
  },

  onLoad(query: Record<string, string | undefined>) {
    const eventId = query.id || ''
    this.setData({ eventId })
    if (eventId) {
      wx.setNavigationBarTitle({ title: '编辑比赛' })
    }

    editApp.requireLogin(eventId ? '登录后才能修改比赛' : '登录后才能创建比赛', {
      success: () => {
        if (eventId) {
          void this.loadEvent(eventId)
          return
        }
        this.setData({ ready: true })
      },
      fail: (error) => {
        if (error !== '取消登录') {
          wx.showToast({ title: '登录失败', icon: 'none' })
        }
        wx.navigateBack()
      }
    })
  },

  async loadEvent(eventId: string) {
    try {
      const res = await editApp.callFunction<Array<Record<string, any>>>({
        name: 'getEvents',
        data: { id: eventId, status: 'all' }
      })
      const event = (res.result.data || []).find((item) => item._id === eventId) || null
      if (!res.result.success || !event) {
        wx.showToast({ title: res.result.error || '没有找到这场比赛', icon: 'none' })
        wx.navigateBack()
        return
      }
      if (event.creatorOpenid !== editApp.globalData.openid) {
        wx.showToast({ title: '只能修改自己发起的比赛', icon: 'none' })
        wx.navigateBack()
        return
      }

      const startTime = String(event.startTime || '')
      const matched = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(startTime)
      const formatIndex = Math.max(0, FORMATS.indexOf(event.format))
      const statusIndex = Math.max(0, STATUS_VALUES.indexOf(event.status))
      this.setData({
        ready: true,
        name: event.name || '',
        date: matched ? matched[1] : '',
        time: matched ? matched[2] : '',
        location: event.location || '',
        description: event.description || '',
        maxPlayers: Number(event.maxPlayers) > 0 ? String(event.maxPlayers) : '',
        formatIndex,
        statusIndex
      })
    } catch (err) {
      console.error('加载比赛失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      wx.navigateBack()
    }
  },

  setField(e: WechatMiniprogram.CustomEvent<{ value?: string }>) {
    const field = e.currentTarget.dataset.field
    if (field !== 'name' && field !== 'location' && field !== 'description' && field !== 'maxPlayers') return
    this.setData({ [field]: e.detail.value || '' })
  },

  setDate(e: WechatMiniprogram.CustomEvent<{ value?: string }>) {
    this.setData({ date: e.detail.value || '' })
  },

  setTime(e: WechatMiniprogram.CustomEvent<{ value?: string }>) {
    this.setData({ time: e.detail.value || '' })
  },

  setFormat(e: WechatMiniprogram.CustomEvent<{ value?: string }>) {
    this.setData({ formatIndex: Number(e.detail.value) || 0 })
  },

  setStatus(e: WechatMiniprogram.CustomEvent<{ value?: string }>) {
    this.setData({ statusIndex: Number(e.detail.value) || 0 })
  },

  async submit() {
    if (this.data.submitting) return

    const name = this.data.name.trim()
    const location = this.data.location.trim()
    const description = this.data.description.trim()
    const maxRaw = this.data.maxPlayers.trim()
    let maxPlayers = 0

    if (!name) {
      wx.showToast({ title: '请填写比赛名称', icon: 'none' })
      return
    }
    if (name.length > 30) {
      wx.showToast({ title: '比赛名称最多 30 字', icon: 'none' })
      return
    }
    if (!this.data.date || !this.data.time) {
      wx.showToast({ title: '请选择比赛时间', icon: 'none' })
      return
    }
    if (!location) {
      wx.showToast({ title: '请填写地点', icon: 'none' })
      return
    }
    if (location.length > 40) {
      wx.showToast({ title: '地点最多 40 字', icon: 'none' })
      return
    }
    if (maxRaw) {
      maxPlayers = Number.parseInt(maxRaw, 10)
      if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 128) {
        wx.showToast({ title: '人数上限填 2 到 128，不限制就留空', icon: 'none' })
        return
      }
    }
    if (description.length > 300) {
      wx.showToast({ title: '说明最多 300 字', icon: 'none' })
      return
    }

    const payload = {
      name,
      startTime: `${this.data.date} ${this.data.time}`,
      location,
      description,
      format: FORMATS[this.data.formatIndex] || FORMATS[0],
      status: STATUS_VALUES[this.data.statusIndex] || STATUS_VALUES[0],
      maxPlayers
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: this.data.eventId ? '保存中' : '发布中' })
    try {
      const res = await editApp.callFunction<{ _id?: string }>({
        name: this.data.eventId ? 'updateEvent' : 'createEvent',
        data: this.data.eventId ? { id: this.data.eventId, ...payload } : payload
      })
      wx.hideLoading()
      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '保存失败', icon: 'none' })
        return
      }
      wx.showToast({ title: this.data.eventId ? '已保存' : '已发布', icon: 'success' })
      wx.navigateBack()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
      console.error(err)
    } finally {
      this.setData({ submitting: false })
    }
  }
})
