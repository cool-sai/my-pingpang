import { groupTitle } from '../../utils/group-title'
import { fetchEvent } from '../../utils/load-event'

const groupApp = getApp<IAppOption>()

interface IGroupSide {
  openid: string
  label: string
  win: boolean
}

interface IGroupOpponent {
  openid: string
  done: boolean
  left: IGroupSide
  right: IGroupSide
}

interface IGroupPerson {
  openid?: string
  nickname?: string
  groupNo?: number
  groupSeq?: number
}

interface IGroupResult {
  a?: string
  b?: string
  winner?: string
}

Page({
  data: {
    eventId: '',
    opponents: [] as IGroupOpponent[],
    title: '',
    note: '',
    emptyText: '你不在这组',
    isLoading: true,
    reporting: ''
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ eventId: query.id || '' })
  },

  onShow() {
    void this.loadGroup()
  },

  async loadGroup() {
    const eventId = this.data.eventId
    const openid = groupApp.globalData.openid
    if (!eventId || !openid) {
      this.setData({ isLoading: false, opponents: [], emptyText: '你不在这组' })
      return
    }
    try {
      const { event, missing } = await fetchEvent(groupApp, eventId, true)
      if (missing || !event) {
        this.setData({ isLoading: false, opponents: [], emptyText: '没有找到这场比赛' })
        return
      }
      const signups = (Array.isArray(event.signups) ? event.signups : []) as IGroupPerson[]
      const me = signups.find((item) => item.openid === openid)
      const groupNo = me ? Number(me.groupNo) || 0 : 0
      const people = signups
        .filter((item) => groupNo && Number(item.groupNo) === groupNo)
        .slice()
        .sort((a, b) => (Number(a.groupSeq) || 0) - (Number(b.groupSeq) || 0))
      const meIndex = people.findIndex((item) => item.openid === openid)
      const results = Array.isArray(event && event.results) ? event.results as IGroupResult[] : []
      const notes = Array.isArray(event && event.groupNotes) ? event.groupNotes : []
      const noteRow = notes.find((row: { groupNo?: number }) => Number(row.groupNo) === groupNo)
      const seat = (person: IGroupPerson, index: number) => `${Number(person.groupSeq) || index + 1} ${person.nickname || '球友'}`
      const myNo = me ? Number(me.groupSeq) || meIndex + 1 : 0
      const opponents = people
        .map((item, index) => ({ item, index }))
        .filter(({ index }) => index !== meIndex)
        .map(({ item, index }) => {
          const other = String(item.openid || '')
          const row = results.find((result) => (
            (result.a === openid && result.b === other) ||
            (result.a === other && result.b === openid)
          ))
          const winner = row && row.winner ? String(row.winner) : ''
          const mineSide = { openid, label: me ? seat(me, meIndex) : '', win: winner === openid }
          const otherSide = { openid: other, label: seat(item, index), win: winner === other }
          const otherNo = Number(item.groupSeq) || index + 1
          const left = myNo <= otherNo ? mineSide : otherSide
          return {
            openid: other,
            done: winner !== '',
            left,
            right: left === mineSide ? otherSide : mineSide
          }
        })
      this.setData({
        opponents,
        title: groupNo ? groupTitle(groupNo) : '',
        note: noteRow && noteRow.note ? String(noteRow.note) : '',
        emptyText: groupNo ? '这一组没有对手' : '你不在这组',
        isLoading: false
      })
    } catch (err) {
      console.error('加载分组失败', err)
      this.setData({ isLoading: false })
    }
  },

  onPick(e: WechatMiniprogram.BaseEvent) {
    const done = e.currentTarget.dataset.done
    if (done === true || done === 'true') {
      wx.showToast({ title: '不能再点', icon: 'none' })
      return
    }
    const opponentOpenid = String(e.currentTarget.dataset.openid || '')
    const winner = String(e.currentTarget.dataset.winner || '')
    const name = String(e.currentTarget.dataset.name || '球友')
    if (!opponentOpenid || !winner || this.data.reporting) return
    const win = winner === groupApp.globalData.openid
    this.setData({ reporting: opponentOpenid })
    wx.showModal({
      title: '确认获胜者',
      content: `${name}获胜`,
      confirmText: '确认',
      success: (res) => {
        if (!res.confirm) {
          this.setData({ reporting: '' })
          return
        }
        void this.saveResult(opponentOpenid, win)
      },
      fail: () => {
        this.setData({ reporting: '' })
      }
    })
  },

  async saveResult(opponentOpenid: string, win: boolean) {
    wx.showLoading({ title: '保存中' })
    try {
      const res = await groupApp.callFunction({
        name: 'eventSchedule',
        data: { id: this.data.eventId, action: 'report', opponentOpenid, win }
      })
      wx.hideLoading()
      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '失败', icon: 'none' })
        return
      }
      await this.loadGroup()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '失败', icon: 'none' })
      console.error(err)
    } finally {
      this.setData({ reporting: '' })
    }
  }
})
