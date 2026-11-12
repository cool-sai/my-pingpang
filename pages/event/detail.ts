import { avatarSrc } from '../../utils/avatar'
import { markEventNeedRefresh, markEventRemoved } from '../../utils/event-list-sync'

import { groupSizes, groupStartError } from '../../utils/group-sizes'
import { fetchEvent } from '../../utils/load-event'

const detailApp = getApp<IAppOption>()

/* ── 分享图画布常量 ── */
const SHARE_W = 500  // px（5:4 比例）
const SHARE_H = 400
const COVER_H = 200  // 封面区高度
const PAD = 32        // 左右 padding
const BG_COLOR = '#f2f5f3'
const CARD_BG = '#ffffff'
const TEXT_PRIMARY = '#17211b'
const TEXT_SECONDARY = '#8b97a3'
const GREEN = '#148f4c'

interface ISignupRow {
  openid: string
  nickname: string
  avatar: string
  groupNo?: number
  groupSeq?: number
}

Page({
  _shareImagePath: '',
  _shareImageCacheKey: '',
  _isGeneratingShareImage: false,
  _shareImagePromise: null as Promise<string> | null,
  _shareImagePromiseKey: '',

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
    scheduling: false,
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
      const { event } = await fetchEvent(detailApp, eventId, true)
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
        avatar: avatarSrc(item.avatar),
        groupNo: Number(item.groupNo) || 0,
        groupSeq: Number(item.groupSeq) || 0
      }))
      const signupCount = Number(event && event.signupCount) || 0
      const maxPlayers = Number(event && event.maxPlayers) || 0
      const prev = this.data.event
      if (
        event &&
        prev &&
        String(prev.cover || '') === String(event.cover || '') &&
        prev.coverUrl
      ) {
        event.coverUrl = prev.coverUrl
      }
      this.setData({
        event,
        signups,
        isOwner: !!(event && openid && event.creatorOpenid === openid),
        signed: !!(openid && signups.some((item) => item.openid === openid)),
        full: !!(event && maxPlayers > 0 && signupCount >= maxPlayers)
      })
      if (event && event._id) markEventNeedRefresh(String(event._id))
      // 数据就绪后预生成分享图
      if (event) this._prepareShareImage()
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

  goToScore() {
    if (!this.data.eventId || !this.data.signed || !this.data.event || !this.data.event.started) return
    wx.navigateTo({ url: `/pages/event/group?id=${this.data.eventId}` })
  },

  goToGroups() {
    if (!this.data.eventId || !this.data.event || !this.data.event.started) return
    wx.navigateTo({ url: `/pages/event/board?id=${this.data.eventId}` })
  },

  onSignupTap() {
    if (!this.data.event || this.data.signing || this.data.event.started) return
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
    if (!this.data.event || this.data.signed || this.data.signing || this.data.full || this.data.event.started || this.data.event.status === 'finished') return
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

  addVirtual() {
    if (!this.data.isOwner || !this.data.event || this.data.event.started || this.data.scheduling) return
    this.setData({ showManage: false })
    wx.showModal({
      title: '加虚拟球友',
      editable: true,
      placeholderText: '人数，最多 30',
      success: (res) => {
        if (!res.confirm) return
        const count = Number.parseInt(String(res.content || '').trim(), 10)
        if (!count || count < 1 || count > 30) {
          wx.showToast({ title: '请输入 1 到 30', icon: 'none' })
          return
        }
        void this.callSchedule('virtual', count)
      }
    })
  },

  startEvent() {
    if (!this.data.isOwner || !this.data.event || this.data.event.started || this.data.scheduling) return
    this.setData({ showManage: false })
    const count = this.data.signups.length
    const sizes = groupSizes(count)
    if (!sizes) {
      wx.showToast({ title: groupStartError(count), icon: 'none' })
      return
    }
    wx.showModal({
      title: '开启比赛？',
      content: `分成 ${sizes.length} 组：${sizes.join('、')}。开启后不能再报名。`,
      success: (res) => {
        if (!res.confirm) return
        void this.callSchedule('start')
      }
    })
  },

  async callSchedule(action: 'virtual' | 'start', count?: number) {
    if (this.data.scheduling) return
    this.setData({ scheduling: true })
    wx.showLoading({ title: '处理中' })
    try {
      const res = await detailApp.callFunction<{ count?: number }>({
        name: 'eventSchedule',
        data: { id: this.data.eventId, action, count }
      })
      wx.hideLoading()
      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '失败', icon: 'none' })
        return
      }
      await this.loadEvent(this.data.eventId)
      const added = res.result.data && res.result.data.count
      wx.showToast({ title: action === 'virtual' ? `已加入${added || 0}人` : '已开启', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '失败', icon: 'none' })
      console.error(err)
    } finally {
      this.setData({ scheduling: false })
    }
  },

  finishEvent() {
    const event = this.data.event
    if (!this.data.isOwner || !event || !event.started || event.status === 'finished' || event.settled || this.data.scheduling) return
    this.setData({ showManage: false })
    wx.showModal({
      title: '结束比赛？',
      content: '结束后将结算全员积分，未记录的对局不计分，且结束后不可再记分或改判，确认结束吗？',
      confirmText: '结束',
      confirmColor: '#d14343',
      success: (res) => {
        if (!res.confirm) return
        void this.submitFinish()
      }
    })
  },

  async submitFinish() {
    if (this.data.scheduling) return
    this.setData({ scheduling: true })
    wx.showLoading({ title: '结束中' })
    try {
      const res = await detailApp.callFunction<{ archived?: boolean; queued?: boolean }>({
        name: 'finishEvent',
        data: { id: this.data.eventId }
      })
      wx.hideLoading()
      if (!res.result.success) {
        await this.loadEvent(this.data.eventId)
        const locked = !!(this.data.event && this.data.event.status === 'finished')
        wx.showToast({
          title: locked ? '比赛已结束，积分结算中' : (res.result.error || '结束失败'),
          icon: 'none'
        })
        return
      }
      await this.loadEvent(this.data.eventId)
      const data = res.result.data || {}
      const title = data.queued ? '已结束，积分结算中' : data.archived ? '已归档，不改积分' : '已结束并结算'
      wx.showToast({ title, icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      console.error(err)
      await this.loadEvent(this.data.eventId)
      const locked = !!(this.data.event && this.data.event.status === 'finished')
      wx.showToast({
        title: locked ? '比赛已结束，积分结算处理中' : '结束失败',
        icon: 'none'
      })
    } finally {
      this.setData({ scheduling: false })
    }
  },

  goToEdit() {
    if (!this.data.eventId) return
    this.setData({ showManage: false })
    wx.navigateTo({ url: `/pages/event/edit?id=${this.data.eventId}` })
  },

  onDelete() {
    if (this.data.deleting || !this.data.event || this.data.event.status === 'finished' || this.data.event.settled) return
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
  },

  onShareAppMessage() {
    const event = this.data.event
    const name = event && event.name ? String(event.name) : '乒乓球约战'
    const fallbackImageUrl = (event && event.coverUrl && event.coverUrl.indexOf('https://') === 0)
      ? String(event.coverUrl)
      : ''

    const payload: { title: string; path: string; imageUrl?: string; promise?: Promise<any> } = {
      title: name,
      path: `/pages/event/detail?id=${this.data.eventId}`
    }

    // 1. 如果分享图已生成就绪，直接同步使用
    if (this._shareImagePath) {
      payload.imageUrl = this._shareImagePath
      return payload
    }

    // 2. 如果正在绘制中，通过微信官方支持的 promise 异步交付（避免首次快速点击降级）
    if (this._shareImagePromise) {
      payload.promise = new Promise((resolve) => {
        // 安全超时：最多等待 2 秒，超时自动降级走兜底，避免任何卡顿
        const timer = setTimeout(() => {
          resolve({
            title: name,
            path: `/pages/event/detail?id=${this.data.eventId}`,
            ...(fallbackImageUrl ? { imageUrl: fallbackImageUrl } : {})
          })
        }, 2000)

        this._shareImagePromise!.then((path) => {
          clearTimeout(timer)
          resolve({
            title: name,
            path: `/pages/event/detail?id=${this.data.eventId}`,
            imageUrl: path || fallbackImageUrl || undefined
          })
        }).catch(() => {
          clearTimeout(timer)
          resolve({
            title: name,
            path: `/pages/event/detail?id=${this.data.eventId}`,
            ...(fallbackImageUrl ? { imageUrl: fallbackImageUrl } : {})
          })
        })
      })
      return payload
    }

    // 3. 兜底回退
    if (fallbackImageUrl) payload.imageUrl = fallbackImageUrl
    return payload
  },

  /* ── 分享图生成（含缓存 & 防抖机制） ── */

  /**
   * 预生成分享图，在数据就绪后调用。
   * 采用基于数据特征的 cacheKey 缓存策略，如果数据未发生变化则跳过生成，避免重复消耗资源。
   */
  _prepareShareImage(): Promise<string> {
    if (!this.data.event) return Promise.resolve('')
    const event = this.data.event
    const cacheKey = [
      event._id || this.data.eventId,
      event.name || '',
      event.startTime || '',
      event.location || '',
      event.signupCount || 0,
      event.maxPlayers || 0,
      event.cover || event.coverUrl || ''
    ].join('|')

    // 缓存命中且图片路径有效时，直接跳过生成
    if (this._shareImagePath && this._shareImageCacheKey === cacheKey) {
      return Promise.resolve(this._shareImagePath)
    }

    // 同一份数据正在画时复用这次请求，数据变了就重新画
    if (this._shareImagePromise && this._shareImagePromiseKey === cacheKey) {
      return this._shareImagePromise
    }

    this._isGeneratingShareImage = true
    this._shareImagePromiseKey = cacheKey
    this._shareImagePromise = new Promise<string>((resolve) => {
      const coverSrc: string = event.coverUrl || event.cover || ''

      const doDraw = (localPath: string) => {
        this._drawShareCard(localPath, cacheKey, (resPath) => {
          this._isGeneratingShareImage = false
          this._shareImagePromise = null
          this._shareImagePromiseKey = ''
          resolve(resPath)
        })
      }

      // 如果封面是 cloud:// 或 https，先下载到本地再画
      if (coverSrc && (coverSrc.indexOf('cloud://') === 0 || coverSrc.indexOf('https://') === 0 || coverSrc.indexOf('http://') === 0)) {
        wx.getImageInfo({
          src: coverSrc,
          success: (imgRes) => {
            doDraw(imgRes.path)
          },
          fail: () => {
            // 封面下载失败，画无封面版本
            doDraw('')
          }
        })
      } else if (coverSrc) {
        // 本地路径
        doDraw(coverSrc)
      } else {
        doDraw('')
      }
    })

    return this._shareImagePromise
  },

  _drawShareCard(coverLocalPath: string, cacheKey: string, callback?: (path: string) => void) {
    const event = this.data.event
    const done = (path: string) => {
      callback && callback(path)
    }
    if (!event) {
      done('')
      return
    }

    const dpr = (typeof wx.getWindowInfo === 'function'
      ? wx.getWindowInfo()
      : wx.getSystemInfoSync()
    ).pixelRatio || 2
    // 用离屏画布，避免页面上的 canvas 盖住详情（原生组件不吃 opacity）
    const canvas = wx.createOffscreenCanvas({
      type: '2d',
      width: SHARE_W * dpr,
      height: SHARE_H * dpr
    })
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      done('')
      return
    }
    ctx.scale(dpr, dpr)

        // 1. 背景
        ctx.fillStyle = BG_COLOR
        ctx.fillRect(0, 0, SHARE_W, SHARE_H)

        // 2. 白色卡片（圆角矩形）
        const cardX = 16
        const cardY = 16
        const cardW = SHARE_W - 32
        const cardH = SHARE_H - 32
        const radius = 16
        this._roundRect(ctx, cardX, cardY, cardW, cardH, radius)
        ctx.fillStyle = CARD_BG
        ctx.fill()

        // 封面区域裁剪
        ctx.save()
        // 上半圆角
        this._roundRectTop(ctx, cardX, cardY, cardW, COVER_H, radius)
        ctx.clip()

        const drawTextPart = () => {
          ctx.restore()

          // 信息区域
          const textX = cardX + PAD
          const textTop = cardY + COVER_H + 26
          let y = textTop

          // 比赛名
          ctx.fillStyle = TEXT_PRIMARY
          ctx.font = 'bold 22px sans-serif'
          const eventName = String(event.name || '乒乓球约战')
          // 截断过长的名字
          const maxNameWidth = cardW - PAD * 2
          let displayName = eventName
          while (ctx.measureText(displayName).width > maxNameWidth && displayName.length > 1) {
            displayName = displayName.slice(0, -1)
          }
          if (displayName !== eventName) displayName += '…'
          ctx.fillText(displayName, textX, y)
          y += 34

          // 绘制信息行（使用中文字符标签，彻底规避部分安卓系统 Emoji 乱码/黑白框/缺失问题）
          const drawInfoRow = (label: string, value: string) => {
            // Label
            ctx.fillStyle = TEXT_SECONDARY
            ctx.font = '14px sans-serif'
            ctx.fillText(label, textX, y)
            // Value
            ctx.fillStyle = '#243028'
            ctx.font = '500 14px sans-serif'
            const valX = textX + 44
            const maxValW = cardW - PAD * 2 - 44
            let dispVal = value
            while (ctx.measureText(dispVal).width > maxValW && dispVal.length > 1) {
              dispVal = dispVal.slice(0, -1)
            }
            if (dispVal !== value) dispVal += '…'
            ctx.fillText(dispVal, valX, y)
            y += 26
          }

          drawInfoRow('时间', event.startTime || '待定')
          drawInfoRow('地点', event.location || '待定')

          const signupCount = Number(event.signupCount) || 0
          const maxPlayers = Number(event.maxPlayers) || 0
          const countText = maxPlayers > 0
            ? `${signupCount}/${maxPlayers} 人`
            : `${signupCount} 人已报名`
          drawInfoRow('人数', countText)

          // 右下角品牌小字
          ctx.fillStyle = '#c0c8cf'
          ctx.font = '12px sans-serif'
          const brand = '乒乓球约战'
          const brandW = ctx.measureText(brand).width
          ctx.fillText(brand, cardX + cardW - PAD - brandW, cardY + cardH - 16)

          // 导出图片
          wx.canvasToTempFilePath({
            canvas,
            x: 0,
            y: 0,
            width: SHARE_W * dpr,
            height: SHARE_H * dpr,
            destWidth: SHARE_W * 2,
            destHeight: SHARE_H * 2,
            fileType: 'jpg',
            quality: 0.9,
            success: (fileRes) => {
              this._shareImagePath = fileRes.tempFilePath
              this._shareImageCacheKey = cacheKey
              done(fileRes.tempFilePath)
            },
            fail: (err) => {
              console.warn('分享图导出失败', err)
              done('')
            }
          })
        }

        const drawFallbackBanner = () => {
          // 优雅矢量兜底图：绿色调背景 + 乒乓约战微标签
          ctx.fillStyle = '#eaf3ec'
          ctx.fillRect(cardX, cardY, cardW, COVER_H)

          const badgeW = 120
          const badgeH = 36
          const badgeX = cardX + (cardW - badgeW) / 2
          const badgeY = cardY + (COVER_H - badgeH) / 2
          this._roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 18)
          ctx.fillStyle = 'rgba(20, 143, 76, 0.12)'
          ctx.fill()

          ctx.fillStyle = GREEN
          ctx.font = 'bold 15px sans-serif'
          const badgeText = '乒乓球约战'
          const tw = ctx.measureText(badgeText).width
          ctx.fillText(badgeText, badgeX + (badgeW - tw) / 2, badgeY + 23)

          drawTextPart()
        }

        if (coverLocalPath) {
          const img = canvas.createImage()
          img.onload = () => {
            // 铺满封面区域（居中裁剪）
            const iw = img.width
            const ih = img.height
            const coverRatio = cardW / COVER_H
            const imgRatio = iw / ih
            let sx = 0, sy = 0, sw = iw, sh = ih
            if (imgRatio > coverRatio) {
              sw = ih * coverRatio
              sx = (iw - sw) / 2
            } else {
              sh = iw / coverRatio
              sy = (ih - sh) / 2
            }
            ctx.drawImage(img, sx, sy, sw, sh, cardX, cardY, cardW, COVER_H)
            drawTextPart()
          }
          img.onerror = () => {
            drawFallbackBanner()
          }
          img.src = coverLocalPath
        } else {
          drawFallbackBanner()
        }
  },

  /** 辅助：画圆角矩形路径 */
  _roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
  },

  /** 辅助：上半部分圆角矩形路径（用于裁剪封面区域） */
  _roundRectTop(ctx: any, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h)
    ctx.lineTo(x, y + h)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
  }
})
