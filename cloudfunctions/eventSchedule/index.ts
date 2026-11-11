import type { Events, MatchesInsert, Signups, Users, UsersInsert } from '../common/types'

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
}

function isVirtual(openid: string) {
  return openid.indexOf('virtual') === 0
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

function nextScore(mine: number, other: number, actual: number) {
  const expected = 1 / (1 + Math.pow(10, (other - mine) / 400))
  const k = mine < 1500 ? 32 : 16
  return Math.round(mine + k * (actual - expected))
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

async function startEvent(eventId: string) {
  const rows = await loadSignups(eventId)
  if (rows.length < 2) return { success: false, error: '至少两个人报名' }
  for (let i = 0; i < rows.length; i += 1) {
    await db.collection('signups').doc(`${eventId}_${rows[i].openid}`).update({
      data: { groupNo: Math.floor(i / 10) + 1, groupSeq: (i % 10) + 1 }
    })
  }
  await db.collection('events').doc(eventId).update({
    data: { started: true, status: 'ongoing', updateTime: db.serverDate() }
  })
  return { success: true, data: { groups: Math.ceil(rows.length / 10) } }
}

async function reportResult(eventId: string, event: Events, openid: string, opponent: string, win: boolean) {
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
  if (isVirtual(openid) || isVirtual(opponent)) return { success: true, data: { winner } }

  const [player1Res, player2Res] = await Promise.all([
    db.collection('users').where({ openid }).limit(1).get(),
    db.collection('users').where({ openid: opponent }).limit(1).get()
  ])
  const player1 = player1Res.data[0] as Users | undefined
  const player2 = player2Res.data[0] as Users | undefined
  if (!player1 || !player2) return { success: false, error: '胜负已记下，积分更新失败' }

  const p1Wins = winner === openid
  const p1Next = nextScore(player1.score, player2.score, p1Wins ? 1 : 0)
  const p2Next = nextScore(player2.score, player1.score, p1Wins ? 0 : 1)
  const match: MatchesInsert = {
    eventId,
    player1Openid: openid,
    player2Openid: opponent,
    player1: { openid, nickname: player1.nickname, avatar: player1.avatar, score: p1Wins ? 1 : 0 },
    player2: { openid: opponent, nickname: player2.nickname, avatar: player2.avatar, score: p1Wins ? 0 : 1 },
    scoreChange: { player1: p1Next - player1.score, player2: p2Next - player2.score },
    winner: p1Wins ? 'player1' : 'player2',
    matchType: 'event',
    location: event.location || '',
    status: 'completed',
    createTime: db.serverDate()
  }
  const p1Data: Record<string, unknown> = {
    score: p1Next,
    totalMatches: db.command.inc(1),
    updateTime: db.serverDate()
  }
  const p2Data: Record<string, unknown> = {
    score: p2Next,
    totalMatches: db.command.inc(1),
    updateTime: db.serverDate()
  }
  if (p1Wins) {
    p1Data.winMatches = db.command.inc(1)
    p2Data.loseMatches = db.command.inc(1)
  } else {
    p1Data.loseMatches = db.command.inc(1)
    p2Data.winMatches = db.command.inc(1)
  }
  try {
    await db.collection('matches').add({ data: match })
    await Promise.all([
      db.collection('users').where({ openid }).update({ data: p1Data }),
      db.collection('users').where({ openid: opponent }).update({ data: p2Data })
    ])
  } catch (err) {
    console.error('更新积分失败', err)
    return { success: false, error: '胜负已记下，积分更新失败' }
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
    return reportResult(id, current, openid, opponent, event.win)
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
