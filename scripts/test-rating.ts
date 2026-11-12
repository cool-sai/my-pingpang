import assert from 'node:assert/strict'
import {
  allocateRounded,
  planSettlement,
  replay,
  settleGames,
  type EventGames,
  type GameResult,
  type PlayerState,
  type QueueEvent
} from '../cloudfunctions/finishEvent/rating'

function roundRobin(eventId: string, startTime: string, players: string[], winnerOf: (a: string, b: string) => string): EventGames {
  const games = []
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const a = players[i] < players[j] ? players[i] : players[j]
      const b = players[i] < players[j] ? players[j] : players[i]
      games.push({ a, b, winner: winnerOf(a, b) })
    }
  }
  return { eventId, startTime, games }
}

// ── 1. 取整分摊：每局之和 = 本场净变化 ──
{
  const values = [0.4, 0.4, 0.4, -7.6, 0.45, 0.3, 0.3, 0.3]
  const { net, ints } = allocateRounded(values)
  assert.equal(ints.reduce((s, v) => s + v, 0), net)
  assert.equal(net, Math.round(values.reduce((s, v) => s + v, 0)))
  values.forEach((v, i) => assert.ok(Math.abs(ints[i] - v) < 1.0001))
}

// ── 2. 单场基础数值 ──
{
  const one = settleGames([{ a: 'x', b: 'y', winner: 'x' }], () => ({ score: 1000, matches: 0 }))
  assert.deepEqual(one.games[0].scoreChange, { player1: 20, player2: -20 }, '新手同分 ±20')
  const grown = settleGames([{ a: 'x', b: 'y', winner: 'x' }], () => ({ score: 1000, matches: 20 }))
  assert.deepEqual(grown.games[0].scoreChange, { player1: 12, player2: -12 }, '成长期同分 ±12')
  const stable = settleGames([{ a: 'x', b: 'y', winner: 'x' }], () => ({ score: 1400, matches: 20 }))
  assert.deepEqual(stable.games[0].scoreChange, { player1: 8, player2: -8 }, '稳定期同分 ±8')
  // 新手保护盾：老球友 y 输给新号 x，y 的扣分减半
  const shield = settleGames([{ a: 'x', b: 'y', winner: 'x' }], (o) => (o === 'x' ? { score: 1000, matches: 0 } : { score: 1000, matches: 30 }))
  assert.deepEqual(shield.games[0].scoreChange, { player1: 20, player2: -6 })
}

// ── 3. 补结算顺序无关 + 与从头重放一致 ──
{
  const names = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']
  const pick = (seed: number) => (a: string, b: string) => ((a.charCodeAt(1) * 7 + b.charCodeAt(1) * 3 + seed) % 5 < 3 ? a : b)
  const evs: EventGames[] = [
    roundRobin('e1', '2026-11-02 14:00', names, pick(1)),
    roundRobin('e2', '2026-11-04 14:00', names.slice(2).concat('p9', 'p10'), pick(2)),
    roundRobin('e3', '2026-11-06 19:30', names.slice(0, 7), pick(3)),
    roundRobin('e4', '2026-11-06 09:00', names.slice(1).concat('p9'), pick(4))
  ]
  const expected = replay(evs, new Map()).final

  const orders = [
    ['e1', 'e2', 'e3', 'e4'],
    ['e4', 'e3', 'e2', 'e1'],
    ['e3', 'e1', 'e4', 'e2'],
    ['e2', 'e4', 'e1', 'e3']
  ]
  orders.forEach((order) => {
    const users = new Map<string, PlayerState>()
    const stored = new Map<string, GameResult[]>()
    const settled: string[] = []
    order.forEach((targetId) => {
      const target = evs.find((e) => e.eventId === targetId) as EventGames
      const queue: QueueEvent[] = [{ ...target }]
      settled.forEach((id) => {
        const ev = evs.find((e) => e.eventId === id) as EventGames
        if (ev.startTime >= target.startTime) queue.push({ ...ev, stored: stored.get(id) })
      })
      const lookup = new Map<string, PlayerState>()
      queue.forEach((q) => q.games.forEach((g) => [g.a, g.b].forEach((o) => lookup.set(o, users.get(o) || { score: 1000, matches: 0 }))))
      const plan = planSettlement(targetId, queue, lookup)
      plan.matchWrites.forEach((w) => {
        const list = (stored.get(w.eventId) || []).filter((r) => !(r.a === w.a && r.b === w.b))
        list.push(w.result)
        stored.set(w.eventId, list)
      })
      plan.userChanges.forEach((c) => {
        const now = users.get(c.openid) || { score: 1000, matches: 0 }
        users.set(c.openid, { score: now.score + c.scoreDelta, matches: now.matches + c.games })
      })
      settled.push(targetId)
    })
    expected.forEach((state, openid) => {
      assert.deepEqual(users.get(openid), state, `${order.join('>')} ${openid}`)
    })
  })
}

// ── 4. 涟漪规模：补结算最早一场，后续各场改动的局数 ──
{
  const names = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']
  const win = (a: string, b: string) => ((a.charCodeAt(1) + b.charCodeAt(1)) % 3 === 0 ? b : a)
  const evs = ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-08', '2026-11-10'].map((d, i) =>
    roundRobin(`e${i + 1}`, `${d} 14:00`, names, win)
  )
  const full = replay(evs.slice(1), new Map())
  const stored = new Map<string, GameResult[]>()
  full.events.forEach((outcome, id) => stored.set(id, outcome.games))
  const queue: QueueEvent[] = [{ ...evs[0] }, ...evs.slice(1).map((e) => ({ ...e, stored: stored.get(e.eventId) }))]
  const plan = planSettlement('e1', queue, new Map())
  const perEvent = new Map<string, number>()
  plan.matchWrites.forEach((w) => perEvent.set(w.eventId, (perEvent.get(w.eventId) || 0) + 1))
  console.log('补结算最早一场，各场写入局数：', Object.fromEntries(perEvent), '（每场共', evs[0].games.length, '局）')
}

console.log('rating tests ok')
