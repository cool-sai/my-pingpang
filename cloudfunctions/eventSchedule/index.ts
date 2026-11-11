import type { Events, Signups, Users, UsersInsert } from '../common/types'

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database({ throwOnNotFound: false })

interface ScheduleEvent {
  id?: string
  action?: string
  opponentOpenid?: string
  win?: boolean
  count?: number
  groupNo?: number
  note?: string
  left?: string
  right?: string
  winner?: string
}

function virtualNo(nickname: string) {
  const matched = /^球友(\d+)$/.exec(String(nickname || ''))
  return matched ? Number(matched[1]) : 0
}

function signupTime(value: unknown) {
  if (value instanceof Date) return value.getTime()
  if (value && typeof value === 'object' && '$date' in value) {
    const raw = (value as { $date?: unknown }).$date
    const parsed = typeof raw === 'number' ? raw : Date.parse(String(raw || ''))
    return Number.isNaN(parsed) ? 0 : parsed
  }
  const parsed = Date.parse(String(value || ''))
  return Number.isNaN(parsed) ? 0 : parsed
}

function pairKey(left: string, right: string) {
  return left < right ? { a: left, b: right } : { a: right, b: left }
}

async function loadSignups(eventId: string) {
  const res = await db.collection('signups').where({ eventId }).limit(128).get()
  return (res.data as Signups[]).slice().sort((a, b) => signupTime(a.createTime) - signupTime(b.createTime))
}

async function loadVirtualUsers() {
  const res = await db.collection('users').where({
    openid: db.RegExp({ regexp: '^virtual', options: '' })
  }).limit(100).get()
  return (res.data as Users[]).slice().sort((a, b) => {
    const diff = virtualNo(a.nickname) - virtualNo(b.nickname)
    return diff || String(a.openid).localeCompare(String(b.openid))
  })
}

async function addVirtual(eventId: string, event: Events, count: number) {
  const rows = await loadSignups(eventId)
  const room = event.maxPlayers > 0 ? event.maxPlayers - rows.length : count
  const n = Math.min(count, room)
  if (n < 1) return { success: false, error: '人数已满' }
  const taken = new Set(rows.map((row) => row.openid))
  const pool = await loadVirtualUsers()
  const chosen: Array<{ openid: string; nickname: string }> = pool
    .filter((user) => !taken.has(user.openid))
    .slice(0, n)
    .map((user) => ({ openid: user.openid, nickname: user.nickname || '球友' }))
  const openids = new Set(pool.map((user) => user.openid))
  let nextNo = pool.reduce((max, user) => Math.max(max, virtualNo(user.nickname)), 0)
  while (chosen.length < n) {
    nextNo += 1
    const openid = `virtual${nextNo}`
    if (openids.has(openid)) continue
    const nickname = `球友${nextNo}`
    const user: UsersInsert = {
      openid,
      nickname,
      avatar: '',
      userNo: 0,
      profileReady: true,
      score: 0,
      totalMatches: 0,
      winMatches: 0,
      loseMatches: 0,
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
    await db.collection('users').add({ data: user })
    openids.add(openid)
    chosen.push({ openid, nickname })
  }
  for (let i = 0; i < chosen.length; i += 1) {
    const person = chosen[i]
    const signup: Omit<Signups, '_id'> = {
      eventId,
      openid: person.openid,
      nickname: person.nickname,
      avatar: '',
      createTime: db.serverDate()
    }
    await db.collection('signups').doc(`${eventId}_${person.openid}`).set({ data: signup })
  }
  await db.collection('events').doc(eventId).update({
    data: { signupCount: db.command.inc(n), updateTime: db.serverDate() }
  })
  return { success: true, data: { count: n } }
}

function groupSizes(count: number) {
  if (count < 8) return null
  const groups = Math.ceil(count / 12)
  if (groups > Math.floor(count / 8)) return null
  const base = Math.floor(count / groups)
  const extra = count % groups
  const sizes: number[] = []
  for (let i = 0; i < groups; i += 1) sizes.push(i < extra ? base + 1 : base)
  return sizes
}

function groupStartError(count: number) {
  const need = count < 8 ? 8 - count : 16 - count
  if (need > 0) return `再加 ${need} 人才能开启`
  return '这人数分不开'
}

async function startEvent(eventId: string) {
  const rows = await loadSignups(eventId)
  const sizes = groupSizes(rows.length)
  if (!sizes) return { success: false, error: groupStartError(rows.length) }
  let index = 0
  for (let groupNo = 1; groupNo <= sizes.length; groupNo += 1) {
    const size = sizes[groupNo - 1]
    for (let groupSeq = 1; groupSeq <= size; groupSeq += 1) {
      const row = rows[index]
      index += 1
      await db.collection('signups').doc(`${eventId}_${row.openid}`).update({
        data: { groupNo, groupSeq }
      })
    }
  }
  await db.collection('events').doc(eventId).update({
    data: { started: true, status: 'ongoing', updateTime: db.serverDate() }
  })
  return { success: true, data: { groups: sizes.length } }
}

async function reportResult(eventId: string, openid: string, opponent: string, win: boolean) {
  if (opponent === openid) return { success: false, error: '不能和自己比赛' }
  const mine = await db.collection('signups').doc(`${eventId}_${openid}`).get()
  const other = await db.collection('signups').doc(`${eventId}_${opponent}`).get()
  const myRow = mine && mine.data as Signups | undefined
  const otherRow = other && other.data as Signups | undefined
  if (!myRow || !otherRow || !myRow.groupNo || myRow.groupNo !== otherRow.groupNo) {
    return { success: false, error: '不在同一组' }
  }

  const pair = pairKey(openid, opponent)
  const winner = win ? openid : opponent
  try {
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.collection('events').doc(eventId).get()
      const current = snap.data as Events | undefined
      if (!current || !current.started) throw new Error('比赛还没开始')
      const results = Array.isArray(current.results) ? current.results.slice() : []
      if (results.some((row) => row.a === pair.a && row.b === pair.b)) throw new Error('已经记过')
      results.push({ a: pair.a, b: pair.b, winner })
      await transaction.collection('events').doc(eventId).update({ data: { results } })
    })
  } catch (err) {
    const message = (err as Error).message || '记录失败'
    if (/已经记过|比赛还没开始/.test(message)) return { success: false, error: message }
    return { success: false, error: '记录失败' }
  }
  return { success: true, data: { winner } }
}

async function saveWinner(eventId: string, pair: { a: string; b: string }, winner: string, once: boolean) {
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.collection('events').doc(eventId).get()
    const current = snap.data as Events | undefined
    if (!current || !current.started) throw new Error('比赛还没开始')
    const results = Array.isArray(current.results) ? current.results.slice() : []
    const index = results.findIndex((row) => row.a === pair.a && row.b === pair.b)
    if (index >= 0) {
      if (once) throw new Error('已经记过')
      results[index] = { a: pair.a, b: pair.b, winner }
    } else results.push({ a: pair.a, b: pair.b, winner })
    await transaction.collection('events').doc(eventId).update({ data: { results } })
  })
}

async function setResult(eventId: string, left: string, right: string, winner: string, openid: string, owner: boolean) {
  if (left === right) return { success: false, error: '不能和自己比赛' }
  if (winner !== left && winner !== right) return { success: false, error: '请选择胜负' }
  const leftRow = await db.collection('signups').doc(`${eventId}_${left}`).get()
  const rightRow = await db.collection('signups').doc(`${eventId}_${right}`).get()
  const leftSignup = leftRow && leftRow.data as Signups | undefined
  const rightSignup = rightRow && rightRow.data as Signups | undefined
  if (!leftSignup || !rightSignup || !leftSignup.groupNo || leftSignup.groupNo !== rightSignup.groupNo) {
    return { success: false, error: '不在同一组' }
  }
  if (!owner) {
    const mine = await db.collection('signups').doc(`${eventId}_${openid}`).get()
    const myRow = mine && mine.data as Signups | undefined
    if (!myRow || !myRow.groupNo || myRow.groupNo !== leftSignup.groupNo) {
      return { success: false, error: '不在同一组' }
    }
  }
  try {
    await saveWinner(eventId, pairKey(left, right), winner, !owner)
  } catch (err) {
    const message = (err as Error).message || '记录失败'
    if (/已经记过|比赛还没开始/.test(message)) return { success: false, error: message }
    return { success: false, error: '记录失败' }
  }
  return { success: true, data: { winner } }
}

async function saveGroupNote(eventId: string, groupNo: number, note: string) {
  const rows = await loadSignups(eventId)
  if (!rows.some((row) => Number(row.groupNo) === groupNo)) {
    return { success: false, error: '没有这一组' }
  }
  const snap = await db.collection('events').doc(eventId).get()
  const current = snap.data as Events | undefined
  const notes = (Array.isArray(current && current.groupNotes) ? current.groupNotes : [])
    .filter((row) => Number(row.groupNo) !== groupNo)
  if (note) notes.push({ groupNo, note })
  notes.sort((a, b) => a.groupNo - b.groupNo)
  await db.collection('events').doc(eventId).update({
    data: { groupNotes: notes, updateTime: db.serverDate() }
  })
  return { success: true, data: { note } }
}

export const main = async (event: ScheduleEvent) => {
  const openid = cloud.getWXContext().OPENID
  if (!openid) return { success: false, error: '请先登录' }
  const id = String(event.id || '').trim()
  if (!id || id.length > 64) return { success: false, error: '没有找到这场比赛' }

  const snap = await db.collection('events').doc(id).get()
  const current = snap.data as Events | undefined
  if (!current) return { success: false, error: '没有找到这场比赛' }

  if (event.action === 'virtual' || event.action === 'start') {
    if (current.creatorOpenid !== openid) return { success: false, error: '只有发起人可以操作' }
    if (current.started) return { success: false, error: '比赛已开始' }
    if (event.action === 'virtual') {
      const count = Number.parseInt(String(event.count ?? ''), 10)
      if (!count || count < 1 || count > 30) return { success: false, error: '一次最多加 30 人' }
      return addVirtual(id, current, count)
    }
    return startEvent(id)
  }

  if (event.action === 'report') {
    if (!current.started) return { success: false, error: '比赛还没开始' }
    const opponent = String(event.opponentOpenid || '').trim()
    if (!opponent) return { success: false, error: '没有这个对手' }
    if (event.win !== true && event.win !== false) return { success: false, error: '请选择胜负' }
    return reportResult(id, openid, opponent, event.win)
  }

  if (event.action === 'set') {
    if (!current.started) return { success: false, error: '比赛还没开始' }
    const left = String(event.left || '').trim()
    const right = String(event.right || '').trim()
    const winner = String(event.winner || '').trim()
    if (!left || !right) return { success: false, error: '没有这个对手' }
    return setResult(id, left, right, winner, openid, current.creatorOpenid === openid)
  }

  if (event.action === 'note') {
    if (current.creatorOpenid !== openid) return { success: false, error: '只有发起人可以操作' }
    if (!current.started) return { success: false, error: '比赛还没开始' }
    const groupNo = Number(event.groupNo)
    if (!groupNo || groupNo < 1) return { success: false, error: '没有这一组' }
    return saveGroupNote(id, groupNo, String(event.note || '').trim().slice(0, 40))
  }

  return { success: false, error: '没有这个操作' }
}
