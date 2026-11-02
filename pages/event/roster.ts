const rosterApp = getApp<IAppOption>()

interface ISignupRow {
  openid: string
  nickname: string
  avatar: string
}

interface IAvatarFile {
  openid: string
  body: string
}

function localAvatarPath(eventId: string, openid: string) {
  const safe = `${eventId}_${openid}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120)
  return `${wx.env.USER_DATA_PATH}/roster-${safe}.jpg`
}

function hasLocalAvatar(path: string) {
  try {
    wx.getFileSystemManager().accessSync(path)
    return true
  } catch (err) {
    return false
  }
}

Page({
  alive: true,
  loadSeq: 0,
  queued: {} as Record<string, boolean>,
  localRetried: {} as Record<string, boolean>,
  pending: [] as string[],
  timer: 0,

  data: {
    eventId: '',
    signups: [] as ISignupRow[],
    isLoading: true
  },

  onLoad(query: Record<string, string | undefined>) {
    this.alive = true
    this.setData({ eventId: query.id || '' })
  },

  onUnload() {
    this.alive = false
    if (this.timer) clearTimeout(this.timer)
  },

  onShow() {
    if (!this.data.eventId) {
      this.setData({ isLoading: false, signups: [] })
      return
    }
    void this.loadSignups(this.data.eventId)
  },

  async loadSignups(eventId: string) {
    const seq = this.loadSeq + 1
    this.loadSeq = seq
    this.queued = {}
    this.pending = []
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = 0
    }
    try {
      const res = await rosterApp.callFunction<Array<Record<string, any>>>({
        name: 'getEvents',
        data: { id: eventId, status: 'all' }
      })
      const event = (res.result.data || []).find((item) => item._id === eventId) || null
      const rawSignups = Array.isArray(event && event.signups) ? event.signups : []
      const signups = rawSignups.map((item: ISignupRow) => {
        const openid = String(item.openid || '')
        const local = openid ? localAvatarPath(eventId, openid) : ''
        return {
          openid,
          nickname: item.nickname || '球友',
          avatar: local && hasLocalAvatar(local) ? local : String(item.avatar || '')
        }
      })
      if (!this.alive || seq !== this.loadSeq) return
      this.setData({ signups })
      signups.forEach((item) => {
        if (item.openid && !item.avatar) this.queueAvatar(item.openid)
      })
    } catch (err) {
      console.error('加载参赛名单失败', err)
    } finally {
      this.setData({ isLoading: false })
    }
  },

  onAvatarError(e: WechatMiniprogram.CustomEvent) {
    const openid = String((e.currentTarget.dataset && e.currentTarget.dataset.openid) || '')
    if (!openid) return
    const row = this.data.signups.find((item) => item.openid === openid)
    const local = localAvatarPath(this.data.eventId, openid)
    if (row && row.avatar === local) {
      try {
        wx.getFileSystemManager().unlinkSync(local)
      } catch (err) {
        // 本地文件已经不在
      }
      if (this.localRetried[openid]) {
        const signups = this.data.signups.map((item) => (
          item.openid === openid ? { ...item, avatar: '' } : item
        ))
        this.setData({ signups })
        return
      }
      this.localRetried[openid] = true
      delete this.queued[openid]
    }
    this.queueAvatar(openid)
  },

  queueAvatar(openid: string) {
    if (!openid || this.queued[openid]) return
    this.queued[openid] = true
    this.pending.push(openid)
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      void this.flushAvatars()
    }, 60) as unknown as number
  },

  async flushAvatars() {
    const seq = this.loadSeq
    this.timer = 0
    const eventId = this.data.eventId
    const ids = this.pending.splice(0, 4)
    if (!eventId || !ids.length || !this.alive) return
    if (this.pending.length) {
      this.timer = setTimeout(() => {
        void this.flushAvatars()
      }, 0) as unknown as number
    }
    try {
      const res = await rosterApp.callFunction<IAvatarFile[]>({
        name: 'getEvents',
        data: { id: eventId, avatarOpenids: ids }
      })
      const files = Array.isArray(res.result.data) ? res.result.data : []
      const byOpenid = new Map(files.map((item) => [item.openid, item.body]))
      const fs = wx.getFileSystemManager()
      const next = this.data.signups.slice()
      ids.forEach((openid) => {
        const body = byOpenid.get(openid) || ''
        const index = next.findIndex((item) => item.openid === openid)
        if (index < 0) return
        if (!body) {
          next[index] = { ...next[index], avatar: '' }
          return
        }
        const path = localAvatarPath(eventId, openid)
        try {
          fs.writeFileSync(path, body, 'base64')
          next[index] = { ...next[index], avatar: path }
        } catch (err) {
          console.error('保存头像失败', err)
          next[index] = { ...next[index], avatar: '' }
        }
      })
      if (this.alive && seq === this.loadSeq) this.setData({ signups: next })
    } catch (err) {
      console.error('读取头像失败', err)
    }
  }
})
