import type { Events, Matches, Users } from '../common/types'
import { INITIAL_SCORE, planSettlement } from './rating'
import type { Game, GameResult, MatchWrite, PlayerState, QueueEvent } from './rating'

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database({ throwOnNotFound: false })
const _ = db.command

const LOCK_ID = 'settlement_lock'
const JOURNAL_ID = 'settlement_journal'
/** 必须大于云函数超时（config.json 里是 60 秒） */
const LOCK_TTL = 90 * 1000
const DRAIN_BUDGET_MS = 45 * 1000
const WAIT_LOCK_MS = 3000
const POLL_MS = 350
const WINDOW_MS = 14 * 24 * 3600 * 1000
const PAGE = 100
const CHUNK = 10

// 与 cloudfunctions/common/admin.ts 保持一致。common 不随函数上传，故在此内联。
const SUPER_ADMIN_OPENID = 'oNw7Y5E0Wkbx_ZqHgLNOAntmTp3g'

function isSuperAdmin(openid: string) {
  return String(openid || '') === SUPER_ADMIN_OPENID
}

interface FinishEvent {
  id?: string
  action?: 'finish' | 'drain' | 'adminList' | 'adminReplay' | 'adminUnlock'
  Type?: string
  TriggerName?: string
}

interface JournalMatch {
  id: string
  create: boolean
  patch: Record<string, unknown>
  /** create 时用的完整文档（不含 createTime，应用时补） */
  doc?: Record<string, unknown>
}

interface JournalUser {
  _id: string
  score: number
  totalMatches: number
  winMatches: number
  loseMatches: number
}

interface Journal {
  eventId: string
  matches: JournalMatch[]
  users: JournalUser[]
  archived: boolean
}

function startMillis(startTime: string) {
  const matched = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(String(startTime || ''))
  if (!matched) return 0
  const ms = Date.parse(`${matched[1]}T${matched[2]}:00+08:00`)
  return Number.isNaN(ms) ? 0 : ms
}

function matchId(eventId: string, a: string, b: string) {
  return `${eventId}_${a}_${b}`
}

function gamesOf(ev: Events): Game[] {
  const rows = Array.isArray(ev.results) ? ev.results : []
  const out: Game[] = []
  const seen = new Set<string>()
  rows.forEach((row) => {
    const a = String(row.a || '')
    const b = String(row.b || '')
    const winner = String(row.winner || '')
    if (!a || !b || a === b || (winner !== a && winner !== b)) return
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ a: a < b ? a : b, b: a < b ? b : a, winner })
  })
  return out
}

async function pagedAll<T>(build: (skip: number) => Promise<{ data: T[] }>) {
  const all: T[] = []
  for (let skip = 0; skip < 5000; skip += PAGE) {
    const res = await build(skip)
    const rows = (res.data || []) as T[]
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}

async function runChunks<T>(items: T[], work: (item: T) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += CHUNK) {
    await Promise.all(items.slice(i, i + CHUNK).map(work))
  }
}

/* ── 全局结算锁 ── */

async function ensureCounterDoc(id: string, init: Record<string, unknown>) {
  const snap = await db.collection('counters').doc(id).get().catch(() => null)
  if (snap && snap.data) return
  try {
    await db.collection('counters').add({ data: { _id: id, ...init } })
  } catch (err) {
    try {
      await db.createCollection('counters')
    } catch (e) {
      // 已存在
    }
    try {
      await db.collection('counters').add({ data: { _id: id, ...init } })
    } catch (e) {
      // 并发创建，忽略
    }
  }
}

async function acquireLock(eventId: string) {
  await ensureCounterDoc(LOCK_ID, { locked: false, lockedAt: 0, token: '', eventId: '' })
  const now = Date.now()
  const token = `${now}_${Math.random().toString(36).slice(2, 10)}`
  const res = await db
    .collection('counters')
    .where(_.or([{ _id: LOCK_ID, locked: false }, { _id: LOCK_ID, lockedAt: _.lt(now - LOCK_TTL) }]))
    .update({ data: { locked: true, lockedAt: now, token, eventId } })
  const updated = res && res.stats ? Number(res.stats.updated) : 0
  return updated === 1 ? token : ''
}

async function releaseLock(token: string) {
  try {
    await db
      .collection('counters')
      .where({ _id: LOCK_ID, token })
      .update({ data: { locked: false, token: '', lockedAt: 0 } })
  } catch (err) {
    console.error('释放结算锁失败', err)
  }
}

/* ── 写入日志：先落日志，再逐步应用。应用是幂等的，中断后下一次抢到锁会先补完 ── */

async function applyJournal(journal: Journal) {
  await runChunks(journal.matches, async (item) => {
    if (item.create && item.doc) {
      await db.collection('matches').doc(item.id).set({ data: { ...item.doc, ...item.patch, createTime: db.serverDate() } })
      return
    }
    const res = await db.collection('matches').doc(item.id).update({ data: item.patch })
    if (res && res.stats && Number(res.stats.updated) === 0 && item.doc) {
      await db.collection('matches').doc(item.id).set({ data: { ...item.doc, ...item.patch, createTime: db.serverDate() } })
    }
  })
  await runChunks(journal.users, async (item) => {
    await db.collection('users').doc(item._id).update({
      data: {
        score: item.score,
        totalMatches: item.totalMatches,
        winMatches: item.winMatches,
        loseMatches: item.loseMatches,
        updateTime: db.serverDate()
      }
    })
  })
  const patch: Record<string, unknown> = {
    status: 'finished',
    settled: true,
    settledAt: db.serverDate(),
    updateTime: db.serverDate()
  }
  if (journal.archived) patch.archived = true
  await db.collection('events').doc(journal.eventId).update({ data: patch })
}

async function replayPendingJournal() {
  // db 已设 throwOnNotFound: false：文档不存在会正常返回 data: null；
  // 若这里抛错说明数据库/网络异常，绝不能吞掉，必须中止本轮留给下次重试，避免覆盖未完成清单
  const snap = await db.collection('counters').doc(JOURNAL_ID).get()
  const row = snap && snap.data
  if (!row || !row.eventId) return
  await applyJournal(row as Journal)
  await db.collection('counters').doc(JOURNAL_ID).remove()
}

async function commitJournal(journal: Journal) {
  await db.collection('counters').doc(JOURNAL_ID).set({ data: journal })
  await applyJournal(journal)
  await db.collection('counters').doc(JOURNAL_ID).remove()
}

/* ── 读数据 ── */

async function loadSettledEvents(startTime: string) {
  const rows = await pagedAll<Events & { archived?: boolean }>((skip) =>
    db.collection('events').where({ settled: true, startTime: _.gte(startTime) }).skip(skip).limit(PAGE).get()
  )
  return rows.filter((row) => !row.archived)
}

async function loadMatches(eventId: string) {
  return pagedAll<Matches & { settled?: boolean }>((skip) =>
    db.collection('matches').where({ eventId }).skip(skip).limit(PAGE).get()
  )
}

async function loadUsers(openids: string[]) {
  const map = new Map<string, Users>()
  const unique = Array.from(new Set(openids))
  for (let i = 0; i < unique.length; i += 20) {
    const chunk = unique.slice(i, i + 20)
    const res = await db.collection('users').where({ openid: _.in(chunk) }).limit(20).get()
    ;((res.data || []) as Users[]).forEach((row) => map.set(row.openid, row))
  }
  return map
}

function storedFrom(rows: Array<Matches & { preScore?: any; preMatches?: any }>): GameResult[] {
  const out: GameResult[] = []
  rows.forEach((row) => {
    const pre = row.preScore
    const cnt = row.preMatches
    if (!pre || !cnt) return
    const winner = row.winner === 'player1' ? row.player1Openid : row.player2Openid
    out.push({
      a: row.player1Openid,
      b: row.player2Openid,
      winner,
      preScore: { player1: Number(pre.player1) || 0, player2: Number(pre.player2) || 0 },
      preMatches: { player1: Number(cnt.player1) || 0, player2: Number(cnt.player2) || 0 },
      scoreChange: {
        player1: Number(row.scoreChange && row.scoreChange.player1) || 0,
        player2: Number(row.scoreChange && row.scoreChange.player2) || 0
      }
    })
  })
  return out
}

function userScore(user: Users) {
  const raw = user.score as unknown
  if (raw === null || raw === undefined || raw === '') return INITIAL_SCORE
  const n = Number(raw)
  if (!Number.isFinite(n)) return INITIAL_SCORE
  // 兼容早期未打过任何比赛的虚拟球友初始分误写成 0 的旧数据；真打到 0 分或负分按实值算
  if (n === 0 && !(Number(user.totalMatches) > 0)) return INITIAL_SCORE
  return n
}

function userState(user: Users): PlayerState {
  return { score: userScore(user), matches: Number(user.totalMatches) || 0 }
}

function matchPatch(write: MatchWrite, matchTime: number) {
  const r = write.result
  return {
    winner: r.winner === r.a ? 'player1' : 'player2',
    scoreChange: r.scoreChange,
    preScore: r.preScore,
    preMatches: r.preMatches,
    settled: true,
    matchTime
  }
}

/* ── 主流程：先关盘入队，再由抢到锁的工人依次排空队列 ── */

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function markFinished(eventId: string, openid: string) {
  return db.runTransaction(async (transaction: any) => {
    const snap = await transaction.collection('events').doc(eventId).get()
    const current = snap.data as (Events & { settled?: boolean; archived?: boolean }) | undefined
    if (!current) throw new Error('没有找到这场比赛')
    if (current.creatorOpenid !== openid && !isSuperAdmin(openid)) {
      throw new Error('只有发起人可以操作')
    }
    if (current.deleting) throw new Error('比赛正在删除，不能结束')
    if (!current.started) throw new Error('比赛还没开始')
    if (current.settled) return { already: true, archived: !!current.archived, justClosed: false }
    if (current.status !== 'finished') {
      await transaction.collection('events').doc(eventId).update({
        data: { status: 'finished', finishedAt: db.serverDate(), updateTime: db.serverDate() }
      })
      return { already: false, archived: false, justClosed: true }
    }
    return { already: false, archived: false, justClosed: false }
  })
}

async function loadPendingQueue() {
  const rows = await pagedAll<Events & { settled?: boolean }>((skip) =>
    db.collection('events').where({ started: true, status: 'finished', settled: _.neq(true) }).skip(skip).limit(PAGE).get()
  )
  return rows
    .filter((row) => !row.settled)
    .sort((a, b) => {
      const ta = String(a.startTime || '')
      const tb = String(b.startTime || '')
      if (ta !== tb) return ta < tb ? -1 : 1
      return a._id < b._id ? -1 : a._id > b._id ? 1 : 0
    })
}

async function readEventState(eventId: string) {
  const snap = await db.collection('events').doc(eventId).get()
  const row = snap && (snap.data as (Events & { settled?: boolean; archived?: boolean }) | undefined)
  return {
    settled: !!(row && row.settled),
    archived: !!(row && row.archived)
  }
}

function isOverdue(ev: Events, now = Date.now()) {
  const t0 = startMillis(ev.startTime)
  if (!t0) return true
  // 以发起人点结束比赛的时刻（finishedAt）为准，避免排队等待误判超期
  const endAt = toMillis(ev.finishedAt) || now
  return endAt - t0 > WINDOW_MS
}

async function settleOne(eventId: string) {
  const snap = await db.collection('events').doc(eventId).get()
  const target = snap && (snap.data as (Events & { settled?: boolean; archived?: boolean }) | undefined)
  if (!target) return null
  if (target.settled) return { already: true, archived: !!target.archived }

  const targetGames = gamesOf(target)
  const t0 = startMillis(target.startTime)
  const overdue = isOverdue(target)

  const existingDocs = new Set<string>()
  const targetRows = await loadMatches(eventId)
  targetRows.forEach((row) => existingDocs.add(row._id))

  // 超过 14 天：只归档战绩，不动积分
  if (overdue) {
    const matches: JournalMatch[] = targetGames.map((game) => {
      const id = matchId(eventId, game.a, game.b)
      return {
        id,
        create: !existingDocs.has(id),
        patch: {
          winner: game.winner === game.a ? 'player1' : 'player2',
          scoreChange: { player1: 0, player2: 0 },
          settled: true,
          archived: true,
          matchTime: t0 || 0
        },
        doc: baseDoc(eventId, game, new Map())
      }
    })
    await commitJournal({ eventId, matches, users: [], archived: true })
    return { archived: true }
  }

  const settledEvents = await loadSettledEvents(target.startTime)
  const queue: QueueEvent[] = [{ eventId, startTime: target.startTime, games: targetGames }]
  for (const ev of settledEvents) {
    if (ev._id === eventId) continue
    const rows = await loadMatches(ev._id)
    rows.forEach((row) => existingDocs.add(row._id))
    queue.push({ eventId: ev._id, startTime: ev.startTime, games: gamesOf(ev), stored: storedFrom(rows) })
  }

  const openids = new Set<string>()
  queue.forEach((ev) => ev.games.forEach((g) => (openids.add(g.a), openids.add(g.b))))
  const users = await loadUsers(Array.from(openids))
  const lookup = new Map<string, PlayerState>()
  users.forEach((user, openid) => lookup.set(openid, userState(user)))

  const plan = planSettlement(eventId, queue, lookup)

  const startOf = new Map<string, number>(settledEvents.map((ev) => [ev._id, startMillis(ev.startTime)]))
  startOf.set(eventId, t0)
  const matches: JournalMatch[] = plan.matchWrites.map((write) => {
    const id = matchId(write.eventId, write.result.a, write.result.b)
    const game: Game = { a: write.result.a, b: write.result.b, winner: write.result.winner }
    return {
      id,
      create: !existingDocs.has(id),
      patch: matchPatch(write, startOf.get(write.eventId) || 0),
      doc: baseDoc(write.eventId, game, users)
    }
  })

  const journalUsers: JournalUser[] = []
  plan.userChanges.forEach((change) => {
    const user = users.get(change.openid)
    if (!user) return
    journalUsers.push({
      _id: user._id,
      score: userScore(user) + change.scoreDelta,
      totalMatches: (Number(user.totalMatches) || 0) + change.games,
      winMatches: (Number(user.winMatches) || 0) + change.wins,
      loseMatches: (Number(user.loseMatches) || 0) + (change.games - change.wins)
    })
  })

  await commitJournal({ eventId, matches, users: journalUsers, archived: false })
  return {
    archived: false,
    games: targetGames.length,
    changedGames: matches.length,
    changedUsers: journalUsers.length
  }
}

async function drainQueue(targetId: string) {
  const startedAt = Date.now()
  const waitUntil = startedAt + WAIT_LOCK_MS
  let targetResult: Record<string, unknown> | null = null

  while (Date.now() - startedAt < DRAIN_BUDGET_MS) {
    const token = await acquireLock(targetId)
    if (token) {
      try {
        await replayPendingJournal()
        while (Date.now() - startedAt < DRAIN_BUDGET_MS) {
          const pending = await loadPendingQueue()
          if (!pending.length) break
          const item = pending[0]
          const res = await settleOne(item._id)
          if (item._id === targetId && res) targetResult = res
        }
      } finally {
        await releaseLock(token)
      }

      if (targetResult) return targetResult
      const state = await readEventState(targetId)
      if (state.settled) return { archived: state.archived }

      // 释放锁前那一瞬间可能有别人新入队，复查一次，没东西就退出
      const more = await loadPendingQueue()
      if (!more.length) return { queued: true }
      continue
    }

    const state = await readEventState(targetId)
    if (state.settled) return { archived: state.archived }
    if (Date.now() >= waitUntil) return { queued: true }
    await sleep(POLL_MS)
  }

  const state = await readEventState(targetId)
  if (state.settled) return { archived: state.archived }
  return { queued: true }
}

function baseDoc(eventId: string, game: Game, users: Map<string, Users>) {
  const snap = (openid: string) => {
    const user = users.get(openid)
    return { openid, nickname: (user && user.nickname) || '球友', avatar: (user && user.avatar) || '', score: 0 }
  }
  return {
    player1Openid: game.a,
    player2Openid: game.b,
    player1: snap(game.a),
    player2: snap(game.b),
    matchType: 'event',
    eventId,
    status: 'completed'
  }
}

function toMillis(value: unknown) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof value === 'object') {
    const raw = (value as { $date?: unknown }).$date
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
    if (raw) {
      const parsed = Date.parse(String(raw))
      if (!Number.isNaN(parsed)) return parsed
    }
  }
  const parsed = Date.parse(String(value || ''))
  return Number.isNaN(parsed) ? 0 : parsed
}

async function adminList() {
  const [lockSnap, journalSnap, eventRows] = await Promise.all([
    db.collection('counters').doc(LOCK_ID).get().catch(() => null),
    db.collection('counters').doc(JOURNAL_ID).get().catch(() => null),
    pagedAll<Events & { settled?: boolean; settledAt?: unknown; archived?: boolean }>((skip) =>
      db.collection('events').where({ started: true }).skip(skip).limit(PAGE).get()
    )
  ])

  const now = Date.now()
  const lockDoc = (lockSnap && lockSnap.data) || {}
  const locked = !!lockDoc.locked
  const lockedAt = Number(lockDoc.lockedAt) || 0
  const lock = {
    locked,
    lockedAt,
    expired: locked && lockedAt > 0 && now - lockedAt > LOCK_TTL,
    eventId: String(lockDoc.eventId || '')
  }

  const journalDoc = journalSnap && journalSnap.data as Partial<Journal> | undefined
  const journal = journalDoc && journalDoc.eventId
    ? {
        eventId: String(journalDoc.eventId),
        matchesCount: Array.isArray(journalDoc.matches) ? journalDoc.matches.length : 0,
        usersCount: Array.isArray(journalDoc.users) ? journalDoc.users.length : 0,
        archived: !!journalDoc.archived
      }
    : null

  const events = eventRows
    .slice()
    .sort((a, b) => {
      const ta = String(a.startTime || '')
      const tb = String(b.startTime || '')
      if (ta !== tb) return tb < ta ? -1 : 1
      return String(b._id).localeCompare(String(a._id))
    })
    .map((ev) => {
      return {
        _id: ev._id,
        name: ev.name || '未命名比赛',
        startTime: ev.startTime || '',
        creatorName: ev.creatorName || '',
        status: ev.status || 'ongoing',
        settled: !!ev.settled,
        archived: !!ev.archived,
        settledAt: toMillis(ev.settledAt),
        gameCount: gamesOf(ev).length,
        overdue: isOverdue(ev, now)
      }
    })

  return { success: true, data: { lock, journal, events } }
}

async function adminReplay() {
  const token = await acquireLock('admin_replay')
  if (!token) return { success: false, error: '当前有结算锁未释放，请先检查或强制解锁' }
  try {
    const snap = await db.collection('counters').doc(JOURNAL_ID).get()
    const row = snap && snap.data
    if (!row || !row.eventId) return { success: true, data: { empty: true } }
    await applyJournal(row as Journal)
    await db.collection('counters').doc(JOURNAL_ID).remove()
    return { success: true, data: { replayed: true, eventId: String(row.eventId) } }
  } catch (err) {
    console.error('补完日志失败', err)
    return { success: false, error: '补完失败，请稍后再试' }
  } finally {
    await releaseLock(token)
  }
}

async function adminUnlock() {
  await ensureCounterDoc(LOCK_ID, { locked: false, lockedAt: 0, token: '', eventId: '' })
  await db.collection('counters').doc(LOCK_ID).update({
    data: { locked: false, token: '', lockedAt: 0, eventId: '' }
  })
  return { success: true }
}

/** 定时巡检 / 后台排空：没任务时只读不写锁，有任务才抢锁依次排空 */
async function drainBackground() {
  try {
    const [journalSnap, pendingSnap] = await Promise.all([
      db.collection('counters').doc(JOURNAL_ID).get(),
      db.collection('events').where({ started: true, status: 'finished', settled: _.neq(true) }).limit(1).get()
    ])
    const hasJournal = !!(journalSnap && journalSnap.data && journalSnap.data.eventId)
    const hasPending = Array.isArray(pendingSnap && pendingSnap.data) && pendingSnap.data.length > 0
    if (!hasJournal && !hasPending) {
      return { success: true, data: { idle: true } }
    }
  } catch (err) {
    console.error('定时巡检读取队列失败', err)
    return { success: false, error: '定时巡检读取失败' }
  }

  const token = await acquireLock('timer_drain')
  if (!token) return { success: true, data: { busy: true } }

  const startedAt = Date.now()
  let settledCount = 0
  try {
    await replayPendingJournal()
    while (Date.now() - startedAt < DRAIN_BUDGET_MS) {
      const pending = await loadPendingQueue()
      if (!pending.length) break
      await settleOne(pending[0]._id)
      settledCount += 1
    }
    return { success: true, data: { settledCount } }
  } catch (err) {
    console.error('定时巡检结算失败', err)
    return { success: false, error: '定时巡检结算失败' }
  } finally {
    await releaseLock(token)
  }
}

export const main = async (event: FinishEvent) => {
  const ctx = cloud.getWXContext() || {}
  const openid = String(ctx.OPENID || '')
  const isTimer = (event && event.Type === 'Timer') || String(ctx.SOURCE || '') === 'wx_trigger'
  const action = (event && event.action) || (isTimer ? 'drain' : 'finish')

  if (action === 'drain') {
    // 定时触发器没有 OPENID；如果是客户端手动调 drain 则要求超级管理员
    if (!isTimer && !isSuperAdmin(openid)) {
      return { success: false, error: openid ? '无权限' : '请先登录' }
    }
    return drainBackground()
  }

  if (!openid) return { success: false, error: '请先登录' }

  if (action === 'adminList' || action === 'adminReplay' || action === 'adminUnlock') {
    if (!isSuperAdmin(openid)) return { success: false, error: '无权限' }
    if (action === 'adminList') return adminList()
    if (action === 'adminReplay') return adminReplay()
    return adminUnlock()
  }

  const id = String((event && event.id) || '').trim()
  if (!id || id.length > 64) return { success: false, error: '没有找到这场比赛' }

  let closed: { already: boolean; archived: boolean; justClosed: boolean }
  try {
    closed = await markFinished(id, openid)
  } catch (err) {
    const message = (err as Error).message || ''
    if (/只有发起人|没有找到|还没开始|比赛正在删除/.test(message)) return { success: false, error: message }
    console.error('结束比赛失败', err)
    return { success: false, error: '结束失败，请稍后再试' }
  }
  if (closed.already) return { success: true, data: { already: true, archived: closed.archived } }

  try {
    const data = await drainQueue(id)
    return { success: true, data }
  } catch (err) {
    console.error('队列结算失败', err)
    // 发起人刚点完结束时已入队，不报错打扰用户；管理员重算时返回失败便于感知
    if (closed.justClosed) return { success: true, data: { queued: true } }
    return { success: false, error: '结算失败，请检查日志或重试' }
  }
}
