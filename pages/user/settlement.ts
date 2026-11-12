const settleApp = getApp<IAppOption>()

interface ILockInfo {
  locked: boolean
  lockedAt: number
  expired: boolean
  eventId: string
  lockedText?: string
}

interface IJournalInfo {
  eventId: string
  matchesCount: number
  usersCount: number
  archived: boolean
}

interface IRawEvent {
  _id: string
  name: string
  startTime: string
  creatorName: string
  status: string
  settled: boolean
  archived: boolean
  settledAt: number
  gameCount: number
  overdue: boolean
}

interface IViewEvent extends IRawEvent {
  badgeText: string
  badgeClass: string
  metaText: string
}

function formatTs(ms: number) {
  if (!ms) return ''
  const d = new Date(ms)
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toView(item: IRawEvent): IViewEvent {
  let badgeText = '进行中'
  let badgeClass = 'status-pill--warning'
  if (item.settled) {
    badgeText = item.archived ? '已归档' : '已结算'
    badgeClass = item.archived ? 'status-pill--muted' : 'status-pill--success'
  } else if (item.status === 'finished') {
    badgeText = '待补结算'
    badgeClass = 'status-pill--danger'
  }
  const parts = [item.startTime || '时间待定']
  if (item.creatorName) parts.push(item.creatorName)
  parts.push(`${item.gameCount} 局`)
  if (!item.settled && item.overdue) parts.push('已超14天将归档')
  if (item.settled && item.settledAt) parts.push(`结算于 ${formatTs(item.settledAt)}`)
  return {
    ...item,
    badgeText,
    badgeClass,
    metaText: parts.join(' · ')
  }
}

Page({
  data: {
    tab: 'pending' as 'pending' | 'settled',
    isLoading: true,
    ready: false,
    denied: false,
    acting: '',
    lock: null as ILockInfo | null,
    journal: null as IJournalInfo | null,
    all: [] as IViewEvent[],
    visible: [] as IViewEvent[],
    pendingCount: 0,
    settledCount: 0
  },

  onShow() {
    void this.loadList()
  },

  onPullDownRefresh() {
    void this.loadList().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  applyTab(all: IViewEvent[], tab: 'pending' | 'settled') {
    const pending = all.filter((item) => !item.settled)
    // 待补结算（已结束未结算）排最前面，其次才是仍在进行中的
    pending.sort((a, b) => {
      const fa = a.status === 'finished' ? 0 : 1
      const fb = b.status === 'finished' ? 0 : 1
      if (fa !== fb) return fa - fb
      return a.startTime < b.startTime ? 1 : a.startTime > b.startTime ? -1 : 0
    })
    const settled = all.filter((item) => item.settled)
    this.setData({
      tab,
      all,
      visible: tab === 'pending' ? pending : settled,
      pendingCount: pending.length,
      settledCount: settled.length
    })
  },

  async loadList() {
    if (!this.data.ready) this.setData({ isLoading: true })
    try {
      const res = await settleApp.callFunction<{
        lock?: ILockInfo
        journal?: IJournalInfo | null
        events?: IRawEvent[]
      }>({
        name: 'finishEvent',
        data: { action: 'adminList' }
      })
      if (!res.result.success) {
        if (res.result.error === '无权限') {
          this.setData({ denied: true, ready: true, isLoading: false })
          return
        }
        wx.showToast({ title: res.result.error || '加载失败', icon: 'none' })
        this.setData({ isLoading: false })
        return
      }
      const data = res.result.data || {}
      const lock = data.lock
        ? { ...data.lock, lockedText: formatTs(data.lock.lockedAt) }
        : null
      const all = (Array.isArray(data.events) ? data.events : []).map(toView)
      this.setData({
        denied: false,
        ready: true,
        lock,
        journal: data.journal || null
      })
      this.applyTab(all, this.data.tab)
    } catch (err) {
      console.error('加载结算管理失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ isLoading: false })
    }
  },

  onTab(e: WechatMiniprogram.BaseEvent) {
    const tab = e.currentTarget.dataset.tab === 'settled' ? 'settled' : 'pending'
    if (tab === this.data.tab) return
    this.applyTab(this.data.all, tab)
  },

  goToDetail(e: WechatMiniprogram.BaseEvent) {
    const id = String(e.currentTarget.dataset.id || '')
    if (!id) return
    wx.navigateTo({ url: `/pages/event/detail?id=${id}` })
  },

  onReplay() {
    if (this.data.acting) return
    wx.showModal({
      title: '补完写入日志？',
      content: '将继续把上次中断的积分与场次写入数据库。',
      success: (res) => {
        if (!res.confirm) return
        void this.runAction('replay', { action: 'adminReplay' }, '已补完')
      }
    })
  },

  onUnlock() {
    if (this.data.acting) return
    wx.showModal({
      title: '强制解锁？',
      content: '仅在确认当前没有云函数正在运行时使用。',
      confirmColor: '#d14343',
      success: (res) => {
        if (!res.confirm) return
        void this.runAction('unlock', { action: 'adminUnlock' }, '已解锁')
      }
    })
  },

  onSettle(e: WechatMiniprogram.BaseEvent) {
    if (this.data.acting) return
    const id = String(e.currentTarget.dataset.id || '')
    const item = this.data.all.find((row) => row._id === id)
    if (!item || item.settled) return
    const head = item.status === 'finished'
      ? `确认对「${item.name}」执行结算？`
      : `「${item.name}」尚未结束，确认代为结束并结算积分吗？`
    const tail = item.overdue ? '\n（开赛已超过 14 天，将只归档战绩不改积分）' : ''
    wx.showModal({
      title: '执行结算',
      content: `${head}${tail}`,
      confirmText: '结算',
      success: (res) => {
        if (!res.confirm) return
        void this.runAction(id, { id }, item.overdue ? '已归档' : '已结算')
      }
    })
  },

  async runAction(actingKey: string, payload: Record<string, unknown>, okText: string) {
    this.setData({ acting: actingKey })
    wx.showLoading({ title: '处理中' })
    try {
      const res = await settleApp.callFunction<{ archived?: boolean; queued?: boolean }>({
        name: 'finishEvent',
        data: payload
      })
      wx.hideLoading()
      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '操作失败', icon: 'none' })
        await this.loadList()
        return
      }
      const data = res.result.data || {}
      const title = data.queued ? '已入队，结算中' : data.archived ? '已归档' : okText
      wx.showToast({ title, icon: 'success' })
      await this.loadList()
    } catch (err) {
      wx.hideLoading()
      console.error('操作失败', err)
      wx.showToast({ title: '操作失败', icon: 'none' })
      await this.loadList()
    } finally {
      this.setData({ acting: '' })
    }
  }
})
