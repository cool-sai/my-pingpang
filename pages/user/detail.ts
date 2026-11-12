import { AVATAR_PLACEHOLDER } from '../../utils/avatar'

const detailApp = getApp<IAppOption>()

interface IProfileUser {
  openid: string
  nickname: string
  avatar: string
  score: number
  totalMatches: number
  winMatches: number
  loseMatches: number
  winRate: number
  rank?: number
  isOwner?: boolean
  isAdmin?: boolean
}

interface IPlayerView {
  openid: string
  nickname: string
  avatar: string
  score: number
}

interface IProfileMatch {
  key: string
  _id?: string
  left: IPlayerView
  right: IPlayerView
  winner: 'win' | 'lose' | 'draw'
  scoreChange: number
  showScore: boolean
  showChange: boolean
  date: string
  matchType: string
  eventId: string
  eventName: string
}

interface IChartPoint {
  eventId?: string
  eventName?: string
  score: number
  change: number
  date: string
}

interface IChartCoord {
  x: number
  y: number
  xPct: number
  yPct: number
}

interface IProfileResult {
  user?: IProfileUser
  matches?: IProfileMatch[]
  chart?: IChartPoint[]
  missing?: boolean
  cancelled?: boolean
}

function escapeXml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function getChartMetrics(): { width: number; height: number; left: number } {
  const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync()
  const winW = Number(info && info.windowWidth) || 375
  const rpx = winW / 750
  return {
    width: Math.max(200, Math.round(686 * rpx)),
    height: Math.max(120, Math.round(360 * rpx)),
    left: Math.round(32 * rpx)
  }
}

function buildChartSvg(
  width: number,
  height: number,
  points: IChartPoint[]
): { svgUrl: string; coords: IChartCoord[] } {
  if (!points.length) return { svgUrl: '', coords: [] }

  const padL = 40
  const padR = 16
  const padT = Math.round((36 / 360) * height)
  const padB = Math.round((56 / 360) * height)
  const innerW = Math.max(1, width - padL - padR)
  const innerH = Math.max(1, height - padT - padB)
  const scores = points.map((item) => item.score)
  let min = Math.min.apply(null, scores)
  let max = Math.max.apply(null, scores)
  if (min === max) {
    min -= 20
    max += 20
  } else {
    const pad = (max - min) * 0.12
    min -= pad
    max += pad
  }
  const span = max - min || 1

  const xAt = (index: number) => {
    if (points.length === 1) return padL + innerW / 2
    return padL + (index / (points.length - 1)) * innerW
  }
  const yAt = (score: number) => padT + (1 - (score - min) / span) * innerH

  const coords: IChartCoord[] = points.map((item, index) => {
    const x = round2(xAt(index))
    const y = round2(yAt(item.score))
    return {
      x,
      y,
      xPct: round2((x / width) * 100),
      yPct: round2((y / height) * 100)
    }
  })

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  ]

  for (let i = 0; i < 3; i += 1) {
    const y = round2(padT + (innerH / 2) * i)
    parts.push(
      `<line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="rgba(22, 40, 30, 0.08)" stroke-width="1" />`
    )
  }

  parts.push(
    `<text x="${padL - 6}" y="${round2(padT + 3.5)}" fill="#8b97a3" font-size="10" font-family="sans-serif" text-anchor="end">${Math.round(max)}</text>`,
    `<text x="${padL - 6}" y="${round2(padT + innerH + 3.5)}" fill="#8b97a3" font-size="10" font-family="sans-serif" text-anchor="end">${Math.round(min)}</text>`
  )

  if (coords.length > 1) {
    const poly = coords.map((pt) => `${pt.x},${pt.y}`).join(' ')
    parts.push(
      `<polyline fill="none" stroke="#148f4c" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${poly}" />`
    )
  }

  coords.forEach((pt) => {
    parts.push(
      `<circle cx="${pt.x}" cy="${pt.y}" r="3" fill="#148f4c" />`,
      `<circle cx="${pt.x}" cy="${pt.y}" r="1.5" fill="#ffffff" />`
    )
  })

  const first = points[0].date
  const last = points[points.length - 1].date
  const dateY = round2(padT + innerH + 17)
  if (first) {
    const firstX = round2(coords[0].x - (points.length === 1 ? 20 : 0))
    parts.push(
      `<text x="${firstX}" y="${dateY}" fill="#8b97a3" font-size="10" font-family="sans-serif" text-anchor="start">${escapeXml(first)}</text>`
    )
  }
  if (last && last !== first) {
    parts.push(
      `<text x="${coords[coords.length - 1].x}" y="${dateY}" fill="#8b97a3" font-size="10" font-family="sans-serif" text-anchor="end">${escapeXml(last)}</text>`
    )
  }

  parts.push('</svg>')
  const svgUrl = `data:image/svg+xml;utf8,${encodeURIComponent(parts.join(''))}`
  return { svgUrl, coords }
}

Page({
  _chartW: 0,
  _chartLeft: 0,
  _chartCoords: [] as IChartCoord[],
  _activeIndex: -1,
  _touchStart: null as { x: number; y: number } | null,

  data: {
    placeholder: AVATAR_PLACEHOLDER,
    targetOpenid: '',
    isLoading: true,
    missing: false,
    cancelled: false,
    needLogin: false,
    user: null as IProfileUser | null,
    canEdit: false,
    matches: [] as IProfileMatch[],
    chart: [] as IChartPoint[],
    chartSvg: '',
    activePoint: null as IChartPoint | null,
    activeCursor: null as { xPct: number; yPct: number } | null
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({
      targetOpenid: String(query.openid || '').trim()
    })
  },

  onShow() {
    const openid = this.data.targetOpenid || (detailApp.globalData.isLogin ? (detailApp.globalData.openid || '') : '')
    if (!openid) {
      this.setData({
        isLoading: false,
        needLogin: true,
        missing: false,
        cancelled: false,
        user: null,
        canEdit: false,
        matches: [],
        chart: [],
        chartSvg: '',
        activePoint: null,
        activeCursor: null
      })
      return
    }
    if (!this.data.targetOpenid) this.setData({ targetOpenid: openid })
    void this.loadProfile(openid, !!this.data.user)
  },

  onResize() {
    this.renderChart(this.data.chart)
  },

  async loadProfile(openid: string, quiet = false) {
    if (!quiet) this.setData({ isLoading: true, needLogin: false, missing: false, cancelled: false })
    try {
      const res = await detailApp.callFunction<IProfileResult>({
        name: 'getUserProfile',
        data: { openid }
      })
      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '加载失败', icon: 'none' })
        if (!this.data.user) this.setData({ missing: true })
        return
      }
      const data = res.result.data || {}
      if (data.cancelled || data.missing) {
        this.setData({
          cancelled: true,
          missing: false,
          user: null,
          canEdit: false,
          matches: [],
          chart: [],
          chartSvg: '',
          activePoint: null,
          activeCursor: null,
          needLogin: false
        })
        wx.setNavigationBarTitle({ title: '已注销' })
        return
      }
      const user = data.user || null
      const matches = Array.isArray(data.matches) ? data.matches : []
      const chart = Array.isArray(data.chart) ? data.chart : []
      const metrics = getChartMetrics()
      const built = buildChartSvg(metrics.width, metrics.height, chart)
      this._chartW = metrics.width
      this._chartLeft = metrics.left
      this._chartCoords = built.coords
      this._activeIndex = -1
      this.setData({
        user,
        canEdit: !!(user && (user.isOwner || user.isAdmin)),
        matches,
        chart,
        chartSvg: built.svgUrl,
        activePoint: null,
        activeCursor: null,
        missing: false,
        cancelled: false,
        needLogin: false,
        isLoading: false
      }, () => {
        this.syncChartBoxRect()
      })
      wx.setNavigationBarTitle({ title: (user && user.nickname) || '个人主页' })
    } catch (err) {
      console.error('加载个人主页失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      if (!this.data.user) this.setData({ missing: true })
    } finally {
      this.setData({ isLoading: false })
    }
  },

  renderChart(points: IChartPoint[]) {
    if (!points.length) {
      this._chartCoords = []
      this._activeIndex = -1
      this.setData({ chartSvg: '', activePoint: null, activeCursor: null })
      return
    }
    const metrics = getChartMetrics()
    const built = buildChartSvg(metrics.width, metrics.height, points)
    this._chartW = metrics.width
    this._chartLeft = metrics.left
    this._chartCoords = built.coords
    const activeIdx = this._activeIndex >= 0 && this._activeIndex < built.coords.length ? this._activeIndex : -1
    const coord = activeIdx >= 0 ? built.coords[activeIdx] : null
    this.setData({
      chartSvg: built.svgUrl,
      activePoint: activeIdx >= 0 ? points[activeIdx] : null,
      activeCursor: coord ? { xPct: coord.xPct, yPct: coord.yPct } : null
    }, () => {
      this.syncChartBoxRect()
    })
  },

  syncChartBoxRect() {
    wx.createSelectorQuery()
      .in(this)
      .select('.chart-box')
      .boundingClientRect((rect) => {
        if (!rect || !rect.width) return
        this._chartLeft = Number(rect.left) || this._chartLeft
        this._chartW = Number(rect.width) || this._chartW
      })
      .exec()
  },

  touchChartPos(e: WechatMiniprogram.TouchEvent) {
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
    if (!touch) return null
    const raw = touch as unknown as { x?: number; y?: number; clientX?: number; clientY?: number; pageX?: number; pageY?: number }
    const clientX = typeof raw.clientX === 'number' ? raw.clientX : (typeof raw.pageX === 'number' ? raw.pageX : Number(raw.x) || 0)
    const clientY = typeof raw.clientY === 'number' ? raw.clientY : (typeof raw.pageY === 'number' ? raw.pageY : Number(raw.y) || 0)
    return {
      x: clientX - this._chartLeft,
      y: clientY
    }
  },

  selectChartAt(x: number) {
    const coords = this._chartCoords
    const points = this.data.chart
    if (!coords.length || !points.length) return
    const ratioX = this._chartW > 0 ? (x / this._chartW) * 100 : 0
    let best = 0
    let bestDist = Math.abs(coords[0].xPct - ratioX)
    for (let i = 1; i < coords.length; i += 1) {
      const dist = Math.abs(coords[i].xPct - ratioX)
      if (dist < bestDist) {
        bestDist = dist
        best = i
      }
    }
    if (best === this._activeIndex) return
    this._activeIndex = best
    const coord = coords[best]
    this.setData({
      activePoint: points[best] || null,
      activeCursor: coord ? { xPct: coord.xPct, yPct: coord.yPct } : null
    })
  },

  onChartTouchStart(e: WechatMiniprogram.TouchEvent) {
    const pos = this.touchChartPos(e)
    if (!pos) return
    this._touchStart = pos
    this.selectChartAt(pos.x)
  },

  onChartTouchMove(e: WechatMiniprogram.TouchEvent) {
    const pos = this.touchChartPos(e)
    if (!pos) return
    if (this._touchStart) {
      const dx = Math.abs(pos.x - this._touchStart.x)
      const dy = Math.abs(pos.y - this._touchStart.y)
      // 竖向滚动页面时不抢占手势
      if (dy > dx && dy > 6) return
    }
    this.selectChartAt(pos.x)
  },

  goToEventBoard(e: WechatMiniprogram.BaseEvent) {
    const eventId = String((e.currentTarget.dataset && e.currentTarget.dataset.eventId) || '')
    if (!eventId || eventId.indexOf('sk-') === 0) return
    wx.navigateTo({ url: `/pages/event/board?id=${eventId}` })
  },

  goToOpponent(e: WechatMiniprogram.BaseEvent) {
    const openid = String((e.currentTarget.dataset && e.currentTarget.dataset.openid) || '')
    if (!openid || openid.indexOf('sk-') === 0) return
    if (openid === this.data.targetOpenid) return
    wx.navigateTo({ url: `/pages/user/detail?openid=${openid}` })
  },

  goToEdit() {
    const openid = this.data.targetOpenid
    if (!openid || !this.data.canEdit) return
    const go = () => {
      wx.navigateTo({ url: `/pages/user/virtual-edit?openid=${openid}` })
    }
    if (detailApp.globalData.isLogin) {
      go()
      return
    }
    detailApp.requireLogin('登录后才能编辑虚拟球友', {
      success: () => go(),
      fail: (error) => {
        if (error === '取消登录') return
        wx.showToast({ title: '登录失败', icon: 'none' })
      }
    })
  },

  onLogin() {
    detailApp.requireLogin('登录后查看自己的主页', {
      success: (userInfo) => {
        const openid = userInfo.openid || detailApp.globalData.openid || ''
        if (!openid) return
        this.setData({ targetOpenid: openid, needLogin: false, isLoading: true })
        void this.loadProfile(openid)
      },
      fail: (error) => {
        if (error === '取消登录') return
        wx.showToast({ title: '登录失败', icon: 'none' })
      }
    })
  }
})
