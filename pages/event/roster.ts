import { avatarSrc } from '../../utils/avatar'

const rosterApp = getApp<IAppOption>()

interface ISignupRow {
  openid: string
  nickname: string
  avatar: string
}

Page({
  data: {
    eventId: '',
    signups: [] as ISignupRow[],
    isLoading: true
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ eventId: query.id || '' })
  },

  onShow() {
    if (!this.data.eventId) {
      this.setData({ isLoading: false, signups: [] })
      return
    }
    void this.loadSignups(this.data.eventId)
  },

  async loadSignups(eventId: string) {
    try {
      const res = await rosterApp.callFunction<Array<Record<string, any>>>({
        name: 'getEvents',
        data: { id: eventId, status: 'all' }
      })
      const event = (res.result.data || []).find((item) => item._id === eventId) || null
      const signups = (Array.isArray(event && event.signups) ? event.signups : []).map((item: ISignupRow) => ({
        openid: String(item.openid || ''),
        nickname: item.nickname || '球友',
        avatar: avatarSrc(item.avatar)
      }))
      this.setData({ signups })
    } catch (err) {
      console.error('加载参赛名单失败', err)
    } finally {
      this.setData({ isLoading: false })
    }
  }
})
