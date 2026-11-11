import type { Events, Matches, Signups, Users } from '../common/types'

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database({ throwOnNotFound: false })
const _ = db.command

interface GetUserProfileEvent {
  openid?: string
}

interface PlayerView {
  openid: string
  nickname: string
  avatar: string
  score: number
}

interface MatchView {
  key: string
  _id?: string
  left: PlayerView
  right: PlayerView
  winner: 'win' | 'lose' | 'draw'
  scoreChange: number
  showScore: boolean
  showChange: boolean
  date: string
  createTime: number
  matchType: string
  eventId: string
  eventName: string
}

const TEMP_BATCH = 50
const MATCH_PAGE = 100
const MATCH_MAX = 500
const IN_LIMIT = 10
const CHART_LIMIT = 40

function isVirtual(openid: string) {
  return String(openid || '').indexOf('virtual') === 0
}

// 与 cloudfunctions/common/admin.ts 保持一致。common 不随函数上传，故在此内联。
const SUPER_ADMIN_OPENID = 'oNw7Y5E0Wkbx_ZqHgLNOAntmTp3g'

function isSuperAdmin(openid: string) {
  return String(openid || '') === SUPER_ADMIN_OPENID
}

function toTime(value: unknown) {
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

function formatDate(value: unknown) {
  const ms = toTime(value)
  if (!ms) return ''
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(ms))
  const year = parts.find((item) => item.type === 'year')?.value || ''
  const month = parts.find((item) => item.type === 'month')?.value || ''
  const day = parts.find((item) => item.type === 'day')?.value || ''
  return year && month && day ? `${year}/${month}/${day}` : ''
}

// 与 common/signFileUrls.ts 保持一致：cloud:// → 临时 https；不管过期
async function signFileUrls(fileIDs: string[]) {
  const cloudIDs = Array.from(new Set(fileIDs.filter((id) => id && id.indexOf('cloud://') === 0)))
  const urls = new Map<string, string>()
  for (let i = 0; i < cloudIDs.length; i += TEMP_BATCH) {
    const batch = cloudIDs.slice(i, i + TEMP_BATCH)
    let list: Array<{ tempFileURL?: string; status?: number | string }> = []
    try {
      const res = await cloud.getTempFileURL({ fileList: batch })
      list = (res && res.fileList) || []
    } catch (err) {
      console.error('换取临时链接失败', err)
    }
    batch.forEach((fileID, index) => {
      const item = list[index]
      const url = String(item && item.tempFileURL || '')
      if (url.indexOf('https://') !== 0) return
      if (item && item.status !== undefined && item.status !== 0 && String(item.status) !== '0') return
      urls.set(fileID, url)
    })
  }
  return urls
}

function resolveAvatar(fileID: string, urls: Map<string, string>) {
  const id = String(fileID || '')
  if (!id) return ''
  if (id.indexOf('https://') === 0) return id
  return urls.get(id) || (id.indexOf('cloud://') === 0 ? '' : id)
}

async function loadUser(openid: string) {
  const res = await db.collection('users').where({ openid }).limit(1).get()
  const row = (res.data as Users[])[0]
  return row || null
}

async function loadMatches(openid: string) {
  const all: Matches[] = []
  for (let skip = 0; skip < MATCH_MAX; skip += MATCH_PAGE) {
    const res = await db.collection('matches').where(_.or([
      { player1Openid: openid },
      { player2Openid: openid }
    ])).orderBy('createTime', 'desc').skip(skip).limit(MATCH_PAGE).get()
    const rows = (res.data || []) as Matches[]
    all.push(...rows)
    if (rows.length < MATCH_PAGE) break
    const changed = all.filter((item) => {
      const change = item.player1Openid === openid
        ? Number(item.scoreChange && item.scoreChange.player1) || 0
        : Number(item.scoreChange && item.scoreChange.player2) || 0
      return change !== 0
    }).length
    if (changed >= CHART_LIMIT && all.length >= MATCH_PAGE) break
  }
  return all
}

async function loadSignups(openid: string) {
  const all: Signups[] = []
  for (let skip = 0; skip < MATCH_MAX; skip += 100) {
    const res = await db.collection('signups').where({ openid }).skip(skip).limit(100).get()
    const rows = (res.data || []) as Signups[]
    all.push(...rows)
    if (rows.length < 100) break
  }
  return all
}

async function loadEvents(ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  const out: Events[] = []
  for (let i = 0; i < unique.length; i += 20) {
    const chunk = unique.slice(i, i + 20)
    const snaps = await Promise.all(chunk.map((id) => db.collection('events').doc(id).get()))
    snaps.forEach((snap) => {
      if (snap && snap.data) out.push(snap.data as Events)
    })
  }
  return out
}

async function loadUsersByOpenids(ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  const map = new Map<string, Users>()
  for (let i = 0; i < unique.length; i += IN_LIMIT) {
    const chunk = unique.slice(i, i + IN_LIMIT)
    const res = await db.collection('users').where({ openid: _.in(chunk) }).limit(IN_LIMIT).get()
    ;((res.data || []) as Users[]).forEach((row) => {
      map.set(row.openid, row)
    })
  }
  return map
}

function pairToken(eventId: string, left: string, right: string) {
  const a = left < right ? left : right
  const b = left < right ? right : left
  return `${eventId}_${a}_${b}`
}

function viewFromMatch(item: Matches, openid: string, eventName: string): MatchView {
  const isLeft = item.player1Openid === openid
  const self = isLeft ? item.player1 : item.player2
  const other = isLeft ? item.player2 : item.player1
  const change = isLeft
    ? Number(item.scoreChange && item.scoreChange.player1) || 0
    : Number(item.scoreChange && item.scoreChange.player2) || 0
  let winner: 'win' | 'lose' | 'draw' = 'draw'
  if (item.winner === 'draw') winner = 'draw'
  else if ((item.winner === 'player1' && isLeft) || (item.winner === 'player2' && !isLeft)) winner = 'win'
  else winner = 'lose'
  const eventId = String(item.eventId || '')
  const isEvent = item.matchType === 'event' || !!eventId
  return {
    key: item._id || pairToken(eventId, item.player1Openid, item.player2Openid),
    _id: item._id,
    left: {
      openid: self && self.openid || openid,
      nickname: (self && self.nickname) || '球友',
      avatar: (self && self.avatar) || '',
      score: Number(self && self.score) || 0
    },
    right: {
      openid: (other && other.openid) || '',
      nickname: (other && other.nickname) || '球友',
      avatar: (other && other.avatar) || '',
      score: Number(other && other.score) || 0
    },
    winner,
    scoreChange: change,
    showScore: !isEvent,
    showChange: !isEvent,
    date: formatDate(item.createTime),
    createTime: toTime(item.createTime),
    matchType: isEvent ? 'event' : (item.matchType || 'friendly'),
    eventId,
    eventName
  }
}

export const main = async (event: GetUserProfileEvent) => {
  const openid = String(event && event.openid || '').trim()
  if (!openid || openid.length > 128) {
    return { success: false, error: '没有这个用户' }
  }

  try {
    const callerOpenid = String((cloud.getWXContext() || {}).OPENID || '')
    const user = await loadUser(openid)
    if (!user || user.cancelled) {
      return { success: true, data: { cancelled: true } }
    }

    const virtual = isVirtual(openid)
    const [matchRows, signups, rankRes] = await Promise.all([
      loadMatches(openid),
      loadSignups(openid),
      db.collection('users').where({ score: _.gt(user.score) }).count().catch(() => null)
    ])

    const eventIds = Array.from(new Set(signups.map((row) => String(row.eventId || '')).filter(Boolean)))
    matchRows.forEach((item) => {
      if (item.eventId) eventIds.push(String(item.eventId))
    })
    const events = await loadEvents(Array.from(new Set(eventIds)))
    const eventMap = new Map(events.map((item) => [String(item._id), item]))

    const matches: MatchView[] = matchRows.map((item) => {
      const ev = item.eventId ? eventMap.get(String(item.eventId)) : undefined
      return viewFromMatch(item, openid, ev && ev.name ? ev.name : '')
    })

    const seen = new Set(
      matches
        .filter((item) => item.eventId)
        .map((item) => pairToken(item.eventId, item.left.openid, item.right.openid))
    )

    const pending: Array<{ event: Events; opponent: string; winner: string; time: number }> = []
    events.forEach((ev) => {
      const results = Array.isArray(ev.results) ? ev.results : []
      results.forEach((row) => {
        const a = String(row.a || '')
        const b = String(row.b || '')
        if (!a || !b || (a !== openid && b !== openid)) return
        const token = pairToken(String(ev._id), a, b)
        if (seen.has(token)) return
        seen.add(token)
        pending.push({
          event: ev,
          opponent: a === openid ? b : a,
          winner: String(row.winner || ''),
          time: toTime(ev.startTime) || toTime(ev.updateTime) || toTime(ev.createTime)
        })
      })
    })

    const people = await loadUsersByOpenids([
      openid,
      ...pending.map((item) => item.opponent)
    ])
    pending.forEach((item) => {
      const self = people.get(openid)
      const other = people.get(item.opponent)
      let winner: 'win' | 'lose' | 'draw' = 'draw'
      if (item.winner === openid) winner = 'win'
      else if (item.winner) winner = 'lose'
      matches.push({
        key: pairToken(String(item.event._id), openid, item.opponent),
        left: {
          openid,
          nickname: (self && self.nickname) || user.nickname || '球友',
          avatar: (self && self.avatar) || user.avatar || '',
          score: 0
        },
        right: {
          openid: item.opponent,
          nickname: (other && other.nickname) || '球友',
          avatar: (other && other.avatar) || '',
          score: 0
        },
        winner,
        scoreChange: 0,
        showScore: false,
        showChange: false,
        date: formatDate(item.time),
        createTime: item.time,
        matchType: 'event',
        eventId: String(item.event._id),
        eventName: item.event.name || ''
      })
    })

    matches.sort((a, b) => b.createTime - a.createTime || a.key.localeCompare(b.key))

    const changed = matches
      .filter((item) => Number(item.scoreChange) !== 0)
      .slice()
      .sort((a, b) => a.createTime - b.createTime || a.key.localeCompare(b.key))
    const recent = changed.slice(-CHART_LIMIT)
    let cursor = Number(user.score) || 0
    cursor -= recent.reduce((sum, item) => sum + (Number(item.scoreChange) || 0), 0)
    const chart = recent.map((item) => {
      cursor += Number(item.scoreChange) || 0
      return { score: cursor, change: Number(item.scoreChange) || 0, date: item.date }
    })

    const fileIDs = [
      user.avatar,
      ...matches.map((item) => item.left.avatar),
      ...matches.map((item) => item.right.avatar)
    ]
    const urls = await signFileUrls(fileIDs)
    matches.forEach((item) => {
      item.left.avatar = resolveAvatar(item.left.avatar, urls)
      item.right.avatar = resolveAvatar(item.right.avatar, urls)
    })

    const totalMatches = Number(user.totalMatches) || 0
    const winMatches = Number(user.winMatches) || 0
    const loseMatches = Number(user.loseMatches) || 0
    const profile: Record<string, unknown> = {
      openid: user.openid,
      nickname: user.nickname || '球友',
      avatar: resolveAvatar(user.avatar, urls),
      score: Number(user.score) || 0,
      totalMatches,
      winMatches,
      loseMatches,
      winRate: totalMatches > 0 ? Math.round((winMatches / totalMatches) * 100) : 0
    }
    if (rankRes && typeof rankRes.total === 'number') {
      profile.rank = rankRes.total + 1
    }
    if (virtual) {
      const ownerOpenid = String(user.ownerOpenid || '').trim()
      profile.isAdmin = isSuperAdmin(callerOpenid)
      profile.isOwner = !!(callerOpenid && (ownerOpenid === callerOpenid || !ownerOpenid))
    }

    return {
      success: true,
      data: {
        user: profile,
        matches: matches.map((item) => {
          const row: Record<string, unknown> = { ...item }
          if (!item._id) delete row._id
          return row
        }),
        chart
      }
    }
  } catch (err) {
    console.error('读取个人主页失败', err)
    return { success: false, error: '加载失败' }
  }
}
