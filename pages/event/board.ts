import { groupTitle } from '../../utils/group-title'

const boardApp = getApp<IAppOption>()

interface IBoardPerson {
  openid?: string
  nickname?: string
  groupNo?: number
  groupSeq?: number
}

interface IBoardResult {
  a?: string
  b?: string
  winner?: string
}

interface IBoardNote {
  groupNo?: number
  note?: string
}

interface IBoardCell {
  key: string
  mark: string
  self: boolean
  left: string
  right: string
  leftName: string
  rightName: string
}

interface IBoardRow {
  no: number
  label: string
  mine: boolean
  cells: IBoardCell[]
}

function boardView(
  signups: IBoardPerson[],
  results: IBoardResult[],
  notes: IBoardNote[],
  groupNo: number,
  myOpenid: string
) {
  const people = signups
    .filter((item) => Number(item.groupNo) === groupNo)
    .slice()
    .sort((a, b) => (Number(a.groupSeq) || 0) - (Number(b.groupSeq) || 0))
  const rows: IBoardRow[] = people.map((person, rowIndex) => {
    const openid = String(person.openid || '')
    const no = Number(person.groupSeq) || rowIndex + 1
    const leftName = `${no} ${person.nickname || '球友'}`
    return {
      no,
      label: leftName,
      mine: myOpenid !== '' && openid === myOpenid,
      cells: people.map((other, colIndex) => {
        const otherId = String(other.openid || '')
        const otherNo = Number(other.groupSeq) || colIndex + 1
        let mark = ''
        if (rowIndex !== colIndex) {
          const found = results.find((result) => (
            (result.a === openid && result.b === otherId) ||
            (result.a === otherId && result.b === openid)
          ))
          if (found && found.winner) mark = found.winner === openid ? 'win' : 'lose'
        }
        return {
          key: `${rowIndex}-${colIndex}`,
          mark,
          self: rowIndex === colIndex,
          left: openid,
          right: otherId,
          leftName,
          rightName: `${otherNo} ${other.nickname || '球友'}`
        }
      })
    }
  })
  const noteRow = notes.find((row) => Number(row.groupNo) === groupNo)
  return {
    groupNo,
    note: noteRow && noteRow.note ? String(noteRow.note) : '',
    heads: rows.map((row) => row.no),
    rows
  }
}

Page({
  data: {
    eventId: '',
    groupNo: 0,
    note: '',
    tabs: [] as Array<{ groupNo: number; title: string; mine: boolean }>,
    heads: [] as number[],
    rows: [] as IBoardRow[],
    signups: [] as IBoardPerson[],
    results: [] as IBoardResult[],
    notes: [] as IBoardNote[],
    isOwner: false,
    signed: false,
    myGroupNo: 0,
    saving: false,
    isLoading: true
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ eventId: query.id || '', groupNo: Number(query.group) || 0 })
  },

  onShow() {
    void this.loadBoard()
  },

  async loadBoard() {
    const eventId = this.data.eventId
    if (!eventId) {
      this.setData({ isLoading: false, rows: [] })
      return
    }
    try {
      const res = await boardApp.callFunction<Array<Record<string, any>>>({
        name: 'getEvents',
        data: { id: eventId, status: 'all' }
      })
      const event = (res.result.data || []).find((item) => item._id === eventId)
      const signups = (Array.isArray(event && event.signups) ? event.signups : []) as IBoardPerson[]
      const results = (Array.isArray(event && event.results) ? event.results : []) as IBoardResult[]
      const notes = (Array.isArray(event && event.groupNotes) ? event.groupNotes : []) as IBoardNote[]
      const groupNos = Array.from(new Set(signups.map((item) => Number(item.groupNo) || 0).filter((groupNo) => groupNo > 0)))
      groupNos.sort((a, b) => a - b)
      const openid = boardApp.globalData.openid || ''
      const mine = signups.find((item) => String(item.openid || '') === openid)
      const myGroupNo = mine && Number(mine.groupNo) > 0 ? Number(mine.groupNo) : 0
      const current = groupNos.indexOf(this.data.groupNo) >= 0 ? this.data.groupNo : myGroupNo
      const groupNo = groupNos.indexOf(current) >= 0 ? current : (groupNos[0] || 0)
      const tabs = groupNos.map((no) => ({ groupNo: no, title: groupTitle(no), mine: no === myGroupNo }))
      this.setData({
        signups,
        results,
        notes,
        tabs,
        signed: myGroupNo > 0,
        myGroupNo,
        isOwner: !!(event && openid && event.creatorOpenid === openid),
        ...boardView(signups, results, notes, groupNo, openid),
        isLoading: false
      })
      if (groupNo) wx.setNavigationBarTitle({ title: groupTitle(groupNo) })
    } catch (err) {
      console.error('加载对战失败', err)
      this.setData({ isLoading: false })
    }
  },

  onTab(e: WechatMiniprogram.BaseEvent) {
    const groupNo = Number(e.currentTarget.dataset.groupNo)
    if (!groupNo || groupNo === this.data.groupNo) return
    this.setData(boardView(this.data.signups, this.data.results, this.data.notes, groupNo, boardApp.globalData.openid || ''))
    wx.setNavigationBarTitle({ title: groupTitle(groupNo) })
  },

  onCell(e: WechatMiniprogram.BaseEvent) {
    const mineHere = this.data.myGroupNo > 0 && this.data.groupNo === this.data.myGroupNo
    if (this.data.saving || (!this.data.isOwner && !mineHere)) return
    const left = String(e.currentTarget.dataset.left || '')
    const right = String(e.currentTarget.dataset.right || '')
    if (!left || !right || left === right) return
    const mark = e.currentTarget.dataset.mark
    if (!this.data.isOwner && (mark === 'win' || mark === 'lose')) {
      wx.showToast({ title: '不能再点', icon: 'none' })
      return
    }
    const leftName = String(e.currentTarget.dataset.leftName || '球友')
    const rightName = String(e.currentTarget.dataset.rightName || '球友')
    wx.showActionSheet({
      alertText: '点胜利的人',
      itemList: [leftName, rightName],
      success: (res) => {
        const winner = res.tapIndex === 0 ? left : right
        void this.saveWinner(left, right, winner)
      }
    })
  },

  async saveWinner(left: string, right: string, winner: string) {
    if (this.data.saving) return
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中' })
    try {
      const res = await boardApp.callFunction({
        name: 'eventSchedule',
        data: { id: this.data.eventId, action: 'set', left, right, winner }
      })
      wx.hideLoading()
      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '失败', icon: 'none' })
        return
      }
      await this.loadBoard()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '失败', icon: 'none' })
      console.error(err)
    } finally {
      this.setData({ saving: false })
    }
  },

  goToScore() {
    if (!this.data.signed || !this.data.eventId) return
    wx.navigateTo({ url: `/pages/event/group?id=${this.data.eventId}` })
  },

  editNote() {
    if (!this.data.isOwner || this.data.saving || !this.data.groupNo) return
    const groupNo = this.data.groupNo
    const current = this.data.note
    wx.showModal({
      title: groupTitle(groupNo),
      content: current ? `当前：${current}` : '例如 5 6 7 号台',
      editable: true,
      placeholderText: '备注，留空则去掉',
      success: (res) => {
        if (!res.confirm) return
        void this.saveNote(groupNo, String(res.content || '').trim())
      }
    })
  },

  async saveNote(groupNo: number, note: string) {
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中' })
    try {
      const res = await boardApp.callFunction({
        name: 'eventSchedule',
        data: { id: this.data.eventId, action: 'note', groupNo, note }
      })
      wx.hideLoading()
      if (!res.result.success) {
        wx.showToast({ title: res.result.error || '失败', icon: 'none' })
        return
      }
      await this.loadBoard()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '失败', icon: 'none' })
      console.error(err)
    } finally {
      this.setData({ saving: false })
    }
  }
})
