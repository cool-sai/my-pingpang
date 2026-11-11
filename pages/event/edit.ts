import { markEventNeedRefresh } from '../../utils/event-list-sync'
import { fetchEvent } from '../../utils/load-event'

const editApp = getApp<IAppOption>()

const FORMATS = ['分段赛', '淘汰赛']
const STATUS_LABELS = ['报名中', '进行中', '已结束']
const STATUS_VALUES = ['upcoming', 'ongoing', 'finished']

function readPlayers(value: unknown) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return 0
  if (parsed > 128) return 128
  return parsed
}

function shiftPlayers(current: number, delta: number) {
  if (delta > 0) {
    if (current <= 0) return 2
    return Math.min(128, current + 1)
  }
  if (current <= 2) return 0
  return current - 1
}

Page({
  data: {
    eventId: '',
    ready: false,
    submitting: false,
    cover: '',
    coverLocal: '',
    coverPreview: '',
    name: '',
    date: '',
    time: '',
    location: '',
    locationAddress: '',
    latitude: null as number | null,
    longitude: null as number | null,
    description: '',
    maxPlayers: 0,
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
      const { event, error } = await fetchEvent(editApp, eventId, false)
      if (!event) {
        wx.showToast({ title: error || '没有找到这场比赛', icon: 'none' })
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
      const savedFormat = String(event.format || '')
      const formats = !savedFormat || FORMATS.indexOf(savedFormat) >= 0 ? FORMATS : [savedFormat, ...FORMATS]
      const formatIndex = Math.max(0, formats.indexOf(savedFormat))
      const statusIndex = Math.max(0, STATUS_VALUES.indexOf(event.status))
      const cover = String(event.cover || '')
      this.setData({
        ready: true,
        formats,
        cover,
        coverLocal: '',
        coverPreview: String(event.coverUrl || cover),
        name: event.name || '',
        date: matched ? matched[1] : '',
        time: matched ? matched[2] : '',
        location: event.location || '',
        locationAddress: event.locationAddress || '',
        latitude: event.latitude != null && Number.isFinite(Number(event.latitude)) ? Number(event.latitude) : null,
        longitude: event.longitude != null && Number.isFinite(Number(event.longitude)) ? Number(event.longitude) : null,
        description: event.description || '',
        maxPlayers: readPlayers(event.maxPlayers),
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
    if (field !== 'name' && field !== 'description') return
    this.setData({ [field]: e.detail.value || '' })
  },

  setPlayers(e: WechatMiniprogram.CustomEvent<{ value?: string }>) {
    const digits = String(e.detail.value || '').replace(/\D/g, '').slice(0, 3)
    this.setData({ maxPlayers: digits === '' ? 0 : Number(digits) })
  },

  blurPlayers() {
    this.setData({ maxPlayers: readPlayers(this.data.maxPlayers) })
  },

  stepPlayers(e: WechatMiniprogram.TouchEvent) {
    const delta = Number(e.currentTarget.dataset.delta) || 0
    this.setData({ maxPlayers: shiftPlayers(readPlayers(this.data.maxPlayers), delta) })
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

  pickLocation() {
    const options: WechatMiniprogram.ChooseLocationOption = {
      success: (res) => {
        const name = String(res.name || '').trim()
        const address = String(res.address || '').trim()
        const label = (name || address).slice(0, 80)
        if (!label || !Number.isFinite(res.latitude) || !Number.isFinite(res.longitude)) {
          wx.showToast({ title: '没有选到地点', icon: 'none' })
          return
        }
        this.setData({
          location: label,
          locationAddress: address.slice(0, 120),
          latitude: res.latitude,
          longitude: res.longitude
        })
      },
      fail: (err) => {
        const message = String(err.errMsg || '')
        if (message.indexOf('cancel') >= 0) return
        wx.showModal({
          title: '无法打开地图',
          content: message || '请允许使用位置信息',
          showCancel: false
        })
      }
    }
    if (this.data.latitude != null && this.data.longitude != null) {
      options.latitude = this.data.latitude
      options.longitude = this.data.longitude
    }
    wx.chooseLocation(options)
  },

  pickCover() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = (res.tempFiles || [])[0]
        const path = file && file.tempFilePath ? String(file.tempFilePath) : ''
        if (!path) {
          wx.showToast({ title: '没有选到图片', icon: 'none' })
          return
        }
        this.setData({ coverLocal: path, coverPreview: path })
      },
      fail: (err) => {
        const message = String(err.errMsg || '')
        if (message.indexOf('cancel') >= 0) return
        wx.showToast({ title: '无法选择图片', icon: 'none' })
      }
    })
  },

  clearCover() {
    this.setData({ cover: '', coverLocal: '', coverPreview: '' })
  },

  async submit() {
    if (this.data.submitting) return

    const name = this.data.name.trim()
    const location = this.data.location.trim()
    const latitude = this.data.latitude
    const longitude = this.data.longitude
    const description = this.data.description.trim()
    const maxPlayers = readPlayers(this.data.maxPlayers)

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
    if (!location || latitude == null || longitude == null) {
      wx.showToast({ title: '请在地图上选择地点', icon: 'none' })
      return
    }
    if (Number(this.data.maxPlayers) === 1) {
      wx.showToast({ title: '人数填 0，或填 2 到 128', icon: 'none' })
      return
    }
    if (description.length > 300) {
      wx.showToast({ title: '说明最多 300 字', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: this.data.eventId ? '保存中' : '发布中' })
    try {
      let cover = this.data.cover
      if (this.data.coverLocal) {
        const openid = editApp.globalData.openid || 'user'
        const uploaded = await wx.cloud.uploadFile({
          cloudPath: `event-covers/${openid}-${Date.now()}.jpg`,
          filePath: this.data.coverLocal
        })
        cover = uploaded.fileID
      }

      const payload = {
        cover,
        name,
        startTime: `${this.data.date} ${this.data.time}`,
        location,
        locationAddress: this.data.locationAddress.trim(),
        latitude,
        longitude,
        description,
        format: this.data.formats[this.data.formatIndex] || FORMATS[0],
        status: STATUS_VALUES[this.data.statusIndex] || STATUS_VALUES[0],
        maxPlayers
      }

      const res = await editApp.callFunction<{ _id?: string }>({
        name: this.data.eventId ? 'updateEvent' : 'createEvent',
        data: this.data.eventId ? { id: this.data.eventId, ...payload } : payload
      })
      wx.hideLoading()
      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '保存失败', icon: 'none' })
        return
      }
      const savedId = String(this.data.eventId || (res.result.data && res.result.data._id) || '')
      if (savedId) markEventNeedRefresh(savedId)
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
