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
}

interface IBoardRow {
  no: number
  label: string
  cells: IBoardCell[]
}

function boardView(
  signups: IBoardPerson[],
  results: IBoardResult[],
  notes: IBoardNote[],
  groupNo: number
) {
  const people = signups
    .filter((item) => Number(item.groupNo) === groupNo)
    .slice()
    .sort((a, b) => (Number(a.groupSeq) || 0) - (Number(b.groupSeq) || 0))
  const rows: IBoardRow[] = people.map((person, rowIndex) => {
    const openid = String(person.openid || '')
    const no = Number(person.groupSeq) || rowIndex + 1
    return {
      no,
      label: `${no} ${person.nickname || '球友'}`,
      cells: people.map((other, colIndex) => {
        const otherId = String(other.openid || '')
        if (rowIndex === colIndex) return { key: `${rowIndex}-${colIndex}`, mark: '' }
        const found = results.find((result) => (
          (result.a === openid && result.b === otherId) ||
          (result.a === otherId && result.b === openid)
        ))
        if (!found || !found.winner) return { key: `${rowIndex}-${colIndex}`, mark: '' }
        return { key: `${rowIndex}-${colIndex}`, mark: found.winner === openid ? 'win' : 'lose' }
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
    tabs: [] as Array<{ groupNo: number; title: string }>,
    heads: [] as number[],
    rows: [] as IBoardRow[],
    signups: [] as IBoardPerson[],
    results: [] as IBoardResult[],
    notes: [] as IBoardNote[],
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
      const groupNo = groupNos.indexOf(this.data.groupNo) >= 0 ? this.data.groupNo : (groupNos[0] || 0)
      const tabs = groupNos.map((no) => ({ groupNo: no, title: groupTitle(no) }))
      this.setData({
        signups,
        results,
        notes,
        tabs,
        ...boardView(signups, results, notes, groupNo),
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
    this.setData(boardView(this.data.signups, this.data.results, this.data.notes, groupNo))
    wx.setNavigationBarTitle({ title: groupTitle(groupNo) })
  }
})
