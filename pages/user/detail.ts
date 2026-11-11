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
  score: number
  change: number
  date: string
}

interface IProfileResult {
  user?: IProfileUser
  matches?: IProfileMatch[]
  chart?: IChartPoint[]
  missing?: boolean
  cancelled?: boolean
}

function drawLineChart(
  ctx: any,
  width: number,
  height: number,
  points: IChartPoint[]
) {
  ctx.clearRect(0, 0, width, height)
  if (!points.length) return

  const padL = 40
  const padR = 16
  const padT = 18
  const padB = 28
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

  ctx.strokeStyle = 'rgba(22, 40, 30, 0.08)'
  ctx.lineWidth = 1
  for (let i = 0; i < 3; i += 1) {
    const y = padT + (innerH / 2) * i
    ctx.beginPath()
    ctx.moveTo(padL, y)
    ctx.lineTo(width - padR, y)
    ctx.stroke()
  }

  ctx.fillStyle = '#8b97a3'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(Math.round(max)), padL - 6, padT)
  ctx.fillText(String(Math.round(min)), padL - 6, padT + innerH)

  const coords = points.map((item, index) => ({ x: xAt(index), y: yAt(item.score) }))
  if (coords.length > 1) {
    ctx.beginPath()
    coords.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    })
    ctx.strokeStyle = '#148f4c'
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke()
  }

  coords.forEach((point) => {
    ctx.beginPath()
    ctx.arc(point.x, point.y, 3, 0, Math.PI * 2)
    ctx.fillStyle = '#148f4c'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(point.x, point.y, 1.5, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
  })

  ctx.fillStyle = '#8b97a3'
  ctx.font = '10px sans-serif'
  ctx.textBaseline = 'top'
  const first = points[0].date
  const last = points[points.length - 1].date
  if (first) {
    ctx.textAlign = 'left'
    ctx.fillText(first, coords[0].x - (points.length === 1 ? 20 : 0), padT + innerH + 8)
  }
  if (last && last !== first) {
    ctx.textAlign = 'right'
    ctx.fillText(last, coords[coords.length - 1].x, padT + innerH + 8)
  }
}

Page({
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
    chart: [] as IChartPoint[]
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ targetOpenid: String(query.openid || '').trim() })
  },

  onShow() {
    const openid = this.data.targetOpenid || (detailApp.globalData.isLogin ? (detailApp.globalData.openid || '') : '')
    if (!openid) {
      this.setData({ isLoading: false, needLogin: true, missing: false, cancelled: false, user: null, canEdit: false, matches: [], chart: [] })
      return
    }
    if (!this.data.targetOpenid) this.setData({ targetOpenid: openid })
    void this.loadProfile(openid, !!this.data.user)
  },

  onResize() {
    this.drawChart()
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
        this.setData({ cancelled: true, missing: false, user: null, canEdit: false, matches: [], chart: [], needLogin: false })
        wx.setNavigationBarTitle({ title: '已注销' })
        return
      }
      const user = data.user || null
      const matches = Array.isArray(data.matches) ? data.matches : []
      const chart = Array.isArray(data.chart) ? data.chart : []
      this.setData({
        user,
        canEdit: !!(user && (user.isOwner || user.isAdmin)),
        matches,
        chart,
        missing: false,
        cancelled: false,
        needLogin: false,
        isLoading: false
      }, () => {
        wx.nextTick(() => this.drawChart())
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

  drawChart() {
    const points = this.data.chart
    if (!points.length || this.data.isLoading) return
    wx.createSelectorQuery()
      .in(this)
      .select('#scoreChart')
      .fields({ node: true, size: true })
      .exec((res) => {
        const got = res && res[0]
        if (!got || !got.node || !got.width || !got.height) return
        const canvas = got.node
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync()
        const dpr = Number(info && info.pixelRatio) || 2
        canvas.width = got.width * dpr
        canvas.height = got.height * dpr
        ctx.scale(dpr, dpr)
        drawLineChart(ctx, got.width, got.height, points)
      })
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
