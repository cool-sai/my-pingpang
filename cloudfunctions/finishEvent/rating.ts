/**
 * 涟漪积分法：纯计算，不碰数据库。
 * 规则见 docs/涟漪积分法-约战结算方案.md。
 */

export const INITIAL_SCORE = 1000
/** 累计局数低于此值算新手定级期 */
export const NEWBIE_GAMES = 10
export const K_NEWBIE = 40
export const K_GROWTH = 24
export const K_STABLE = 16
export const STABLE_SCORE = 1300
/** 场内局数超过此值开始阻尼 */
export const DAMP_FROM = 4

export interface PlayerState {
  score: number
  matches: number
}

/** a、b 是按字典序排好的两个 openid；winner 是其中一个 */
export interface Game {
  a: string
  b: string
  winner: string
}

export interface GameResult {
  a: string
  b: string
  winner: string
  preScore: { player1: number; player2: number }
  preMatches: { player1: number; player2: number }
  scoreChange: { player1: number; player2: number }
}

export interface EventGames {
  eventId: string
  /** YYYY-MM-DD HH:mm，字符串可直接排序 */
  startTime: string
  games: Game[]
}

export interface EventOutcome {
  games: GameResult[]
  /** 每人本场净变化与局数 */
  players: Map<string, { net: number; games: number; wins: number }>
}

export function expectedScore(own: number, other: number) {
  return 1 / (1 + Math.pow(10, (other - own) / 400))
}

export function kFactor(state: PlayerState) {
  if (state.matches < NEWBIE_GAMES) return K_NEWBIE
  return state.score >= STABLE_SCORE ? K_STABLE : K_GROWTH
}

export function dampFactor(games: number) {
  return games > DAMP_FROM ? Math.sqrt(DAMP_FROM / games) : 1
}

/**
 * 把一个人本场各局的小数加减分取整：总和 = round(合计)，
 * 再用最大余数法分摊回每一局，保证「每局之和 = 本场净变化」。
 */
export function allocateRounded(values: number[]) {
  const net = Math.round(values.reduce((sum, v) => sum + v, 0))
  const ints = values.map((v) => Math.round(v))
  let diff = net - ints.reduce((sum, v) => sum + v, 0)
  if (diff !== 0) {
    const order = values
      .map((v, index) => ({ index, residual: v - ints[index] }))
      .sort((x, y) => (diff > 0 ? y.residual - x.residual : x.residual - y.residual) || x.index - y.index)
    for (let i = 0; diff !== 0 && order.length > 0; i = (i + 1) % order.length) {
      const step = diff > 0 ? 1 : -1
      ints[order[i].index] += step
      diff -= step
    }
  }
  return { net, ints }
}

function sortGames(games: Game[]) {
  return games
    .map((g) => (g.a < g.b ? g : { a: g.b, b: g.a, winner: g.winner }))
    .sort((x, y) => (x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : x.b > y.b ? 1 : 0))
}

/** 单场结算。snapshot 是进入本场时的状态，场内所有局共用，不滚分。 */
export function settleGames(games: Game[], snapshot: (openid: string) => PlayerState): EventOutcome {
  const sorted = sortGames(games)
  const raw = new Map<string, Array<{ game: number; side: 'player1' | 'player2'; value: number }>>()
  const push = (openid: string, game: number, side: 'player1' | 'player2', value: number) => {
    const list = raw.get(openid) || []
    list.push({ game, side, value })
    raw.set(openid, list)
  }

  sorted.forEach((g, index) => {
    const sa = snapshot(g.a)
    const sb = snapshot(g.b)
    const one = (own: PlayerState, other: PlayerState, won: boolean) => {
      let k = kFactor(own)
      // 新手保护盾：老球友输给定级期新号，扣分减半
      if (!won && own.matches >= NEWBIE_GAMES && other.matches < NEWBIE_GAMES) k *= 0.5
      return k * ((won ? 1 : 0) - expectedScore(own.score, other.score))
    }
    push(g.a, index, 'player1', one(sa, sb, g.winner === g.a))
    push(g.b, index, 'player2', one(sb, sa, g.winner === g.b))
  })

  const results: GameResult[] = sorted.map((g) => {
    const sa = snapshot(g.a)
    const sb = snapshot(g.b)
    return {
      a: g.a,
      b: g.b,
      winner: g.winner,
      preScore: { player1: sa.score, player2: sb.score },
      preMatches: { player1: sa.matches, player2: sb.matches },
      scoreChange: { player1: 0, player2: 0 }
    }
  })

  const players = new Map<string, { net: number; games: number; wins: number }>()
  raw.forEach((list, openid) => {
    const damp = dampFactor(list.length)
    const { net, ints } = allocateRounded(list.map((item) => item.value * damp))
    list.forEach((item, i) => {
      results[item.game].scoreChange[item.side] = ints[i]
    })
    const wins = list.filter((item) => {
      const g = sorted[item.game]
      return g.winner === openid
    }).length
    players.set(openid, { net, games: list.length, wins })
  })
  return { games: results, players }
}

export interface ReplayResult {
  events: Map<string, EventOutcome>
  /** 重放结束后每人的状态（仅含参与过队列的人） */
  final: Map<string, PlayerState>
}

/**
 * 按时间轴从早到晚顺推。start 是每人在队列起点的状态，缺省为新人（1000 分、0 局）。
 */
export function replay(queue: EventGames[], start: Map<string, PlayerState>): ReplayResult {
  const ordered = queue
    .slice()
    .sort((x, y) => (x.startTime < y.startTime ? -1 : x.startTime > y.startTime ? 1 : x.eventId < y.eventId ? -1 : x.eventId > y.eventId ? 1 : 0))
  const running = new Map<string, PlayerState>()
  const read = (openid: string): PlayerState => {
    let state = running.get(openid)
    if (!state) {
      const from = start.get(openid)
      state = from ? { score: from.score, matches: from.matches } : { score: INITIAL_SCORE, matches: 0 }
      running.set(openid, state)
    }
    return state
  }
  const events = new Map<string, EventOutcome>()
  ordered.forEach((ev) => {
    const snap = new Map<string, PlayerState>()
    ev.games.forEach((g) => {
      ;[g.a, g.b].forEach((openid) => {
        if (!snap.has(openid)) {
          const s = read(openid)
          snap.set(openid, { score: s.score, matches: s.matches })
        }
      })
    })
    const outcome = settleGames(ev.games, (openid) => snap.get(openid) as PlayerState)
    events.set(ev.eventId, outcome)
    outcome.players.forEach((value, openid) => {
      const state = read(openid)
      state.score += value.net
      state.matches += value.games
    })
  })
  return { events, final: running }
}

/** 队列里的一场比赛。已结算的比赛带着库里现有的逐局结果（含赛前快照） */
export interface QueueEvent extends EventGames {
  stored?: GameResult[]
}

export interface MatchWrite {
  eventId: string
  a: string
  b: string
  result: GameResult
}

export interface UserChange {
  openid: string
  /** 积分增量（含补结算对后续场次的涟漪修正） */
  scoreDelta: number
  /** 仅目标场新增 */
  games: number
  wins: number
}

export interface Plan {
  matchWrites: MatchWrite[]
  userChanges: UserChange[]
}

function sameResult(x: GameResult, y: GameResult) {
  return (
    x.winner === y.winner &&
    x.scoreChange.player1 === y.scoreChange.player1 &&
    x.scoreChange.player2 === y.scoreChange.player2 &&
    x.preScore.player1 === y.preScore.player1 &&
    x.preScore.player2 === y.preScore.player2 &&
    x.preMatches.player1 === y.preMatches.player1 &&
    x.preMatches.player2 === y.preMatches.player2
  )
}

function storedOf(ev: QueueEvent, a: string, b: string) {
  const key = a < b ? [a, b] : [b, a]
  return (ev.stored || []).find((row) => row.a === key[0] && row.b === key[1])
}

function orderOf(queue: QueueEvent[]) {
  return queue
    .slice()
    .sort((x, y) => (x.startTime < y.startTime ? -1 : x.startTime > y.startTime ? 1 : x.eventId < y.eventId ? -1 : x.eventId > y.eventId ? 1 : 0))
}

/**
 * 结算计划：queue 含目标场（stored 为空）和 startTime 不早于目标场的所有已结算场。
 * users 是这些人当前的库内状态，用于没有任何已结算快照的人。
 */
export function planSettlement(targetId: string, queue: QueueEvent[], users: Map<string, PlayerState>): Plan {
  const ordered = orderOf(queue)
  const start = new Map<string, PlayerState>()
  const everyone = new Set<string>()
  ordered.forEach((ev) => {
    ev.games.forEach((g) => {
      everyone.add(g.a)
      everyone.add(g.b)
    })
  })
  everyone.forEach((openid) => {
    // 该人在队列里最早的已结算场，其赛前快照就是他在目标场开赛前夕的真实状态
    for (const ev of ordered) {
      if (!ev.stored) continue
      const row = (ev.stored || []).find((r) => r.a === openid || r.b === openid)
      if (!row) continue
      const left = row.a === openid
      start.set(openid, {
        score: left ? row.preScore.player1 : row.preScore.player2,
        matches: left ? row.preMatches.player1 : row.preMatches.player2
      })
      return
    }
    const now = users.get(openid)
    if (now) start.set(openid, { score: now.score, matches: now.matches })
  })

  const result = replay(ordered, start)

  const matchWrites: MatchWrite[] = []
  const delta = new Map<string, number>()
  const bump = (openid: string, value: number) => delta.set(openid, (delta.get(openid) || 0) + value)

  ordered.forEach((ev) => {
    const outcome = result.events.get(ev.eventId) as EventOutcome
    outcome.games.forEach((game) => {
      const old = ev.stored ? storedOf(ev, game.a, game.b) : undefined
      bump(game.a, game.scoreChange.player1)
      bump(game.b, game.scoreChange.player2)
      if (old) {
        bump(game.a, -old.scoreChange.player1)
        bump(game.b, -old.scoreChange.player2)
      }
      const isTarget = ev.eventId === targetId
      if (isTarget || !old || !sameResult(old, game)) {
        matchWrites.push({ eventId: ev.eventId, a: game.a, b: game.b, result: game })
      }
    })
  })

  const target = result.events.get(targetId) as EventOutcome
  const userChanges: UserChange[] = []
  everyone.forEach((openid) => {
    const inTarget = target.players.get(openid)
    const scoreDelta = delta.get(openid) || 0
    if (!inTarget && scoreDelta === 0) return
    userChanges.push({
      openid,
      scoreDelta,
      games: inTarget ? inTarget.games : 0,
      wins: inTarget ? inTarget.wins : 0
    })
  })
  userChanges.sort((x, y) => (x.openid < y.openid ? -1 : 1))
  return { matchWrites, userChanges }
}
