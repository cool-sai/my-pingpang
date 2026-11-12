"use strict";
/**
 * 涟漪积分法：纯计算，不碰数据库。
 * 规则见 docs/涟漪积分法-约战结算方案.md。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DAMP_FROM = exports.STABLE_SCORE = exports.K_STABLE = exports.K_GROWTH = exports.K_NEWBIE = exports.NEWBIE_GAMES = exports.INITIAL_SCORE = void 0;
exports.expectedScore = expectedScore;
exports.kFactor = kFactor;
exports.dampFactor = dampFactor;
exports.allocateRounded = allocateRounded;
exports.settleGames = settleGames;
exports.replay = replay;
exports.planSettlement = planSettlement;
exports.INITIAL_SCORE = 1000;
/** 累计局数低于此值算新手定级期 */
exports.NEWBIE_GAMES = 10;
exports.K_NEWBIE = 40;
exports.K_GROWTH = 24;
exports.K_STABLE = 16;
exports.STABLE_SCORE = 1300;
/** 场内局数超过此值开始阻尼 */
exports.DAMP_FROM = 4;
function expectedScore(own, other) {
    return 1 / (1 + Math.pow(10, (other - own) / 400));
}
function kFactor(state) {
    if (state.matches < exports.NEWBIE_GAMES)
        return exports.K_NEWBIE;
    return state.score >= exports.STABLE_SCORE ? exports.K_STABLE : exports.K_GROWTH;
}
function dampFactor(games) {
    return games > exports.DAMP_FROM ? Math.sqrt(exports.DAMP_FROM / games) : 1;
}
/**
 * 把一个人本场各局的小数加减分取整：总和 = round(合计)，
 * 再用最大余数法分摊回每一局，保证「每局之和 = 本场净变化」。
 */
function allocateRounded(values) {
    const net = Math.round(values.reduce((sum, v) => sum + v, 0));
    const ints = values.map((v) => Math.round(v));
    let diff = net - ints.reduce((sum, v) => sum + v, 0);
    if (diff !== 0) {
        const order = values
            .map((v, index) => ({ index, residual: v - ints[index] }))
            .sort((x, y) => (diff > 0 ? y.residual - x.residual : x.residual - y.residual) || x.index - y.index);
        for (let i = 0; diff !== 0 && order.length > 0; i = (i + 1) % order.length) {
            const step = diff > 0 ? 1 : -1;
            ints[order[i].index] += step;
            diff -= step;
        }
    }
    return { net, ints };
}
function sortGames(games) {
    return games
        .map((g) => (g.a < g.b ? g : { a: g.b, b: g.a, winner: g.winner }))
        .sort((x, y) => (x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : x.b > y.b ? 1 : 0));
}
/** 单场结算。snapshot 是进入本场时的状态，场内所有局共用，不滚分。 */
function settleGames(games, snapshot) {
    const sorted = sortGames(games);
    const raw = new Map();
    const push = (openid, game, side, value) => {
        const list = raw.get(openid) || [];
        list.push({ game, side, value });
        raw.set(openid, list);
    };
    sorted.forEach((g, index) => {
        const sa = snapshot(g.a);
        const sb = snapshot(g.b);
        const one = (own, other, won) => {
            let k = kFactor(own);
            // 新手保护盾：老球友输给定级期新号，扣分减半
            if (!won && own.matches >= exports.NEWBIE_GAMES && other.matches < exports.NEWBIE_GAMES)
                k *= 0.5;
            return k * ((won ? 1 : 0) - expectedScore(own.score, other.score));
        };
        push(g.a, index, 'player1', one(sa, sb, g.winner === g.a));
        push(g.b, index, 'player2', one(sb, sa, g.winner === g.b));
    });
    const results = sorted.map((g) => {
        const sa = snapshot(g.a);
        const sb = snapshot(g.b);
        return {
            a: g.a,
            b: g.b,
            winner: g.winner,
            preScore: { player1: sa.score, player2: sb.score },
            preMatches: { player1: sa.matches, player2: sb.matches },
            scoreChange: { player1: 0, player2: 0 }
        };
    });
    const players = new Map();
    raw.forEach((list, openid) => {
        const damp = dampFactor(list.length);
        const { net, ints } = allocateRounded(list.map((item) => item.value * damp));
        list.forEach((item, i) => {
            results[item.game].scoreChange[item.side] = ints[i];
        });
        const wins = list.filter((item) => {
            const g = sorted[item.game];
            return g.winner === openid;
        }).length;
        players.set(openid, { net, games: list.length, wins });
    });
    return { games: results, players };
}
/**
 * 按时间轴从早到晚顺推。start 是每人在队列起点的状态，缺省为新人（1000 分、0 局）。
 */
function replay(queue, start) {
    const ordered = queue
        .slice()
        .sort((x, y) => (x.startTime < y.startTime ? -1 : x.startTime > y.startTime ? 1 : x.eventId < y.eventId ? -1 : x.eventId > y.eventId ? 1 : 0));
    const running = new Map();
    const read = (openid) => {
        let state = running.get(openid);
        if (!state) {
            const from = start.get(openid);
            state = from ? { score: from.score, matches: from.matches } : { score: exports.INITIAL_SCORE, matches: 0 };
            running.set(openid, state);
        }
        return state;
    };
    const events = new Map();
    ordered.forEach((ev) => {
        const snap = new Map();
        ev.games.forEach((g) => {
            ;
            [g.a, g.b].forEach((openid) => {
                if (!snap.has(openid)) {
                    const s = read(openid);
                    snap.set(openid, { score: s.score, matches: s.matches });
                }
            });
        });
        const outcome = settleGames(ev.games, (openid) => snap.get(openid));
        events.set(ev.eventId, outcome);
        outcome.players.forEach((value, openid) => {
            const state = read(openid);
            state.score += value.net;
            state.matches += value.games;
        });
    });
    return { events, final: running };
}
function sameResult(x, y) {
    return (x.winner === y.winner &&
        x.scoreChange.player1 === y.scoreChange.player1 &&
        x.scoreChange.player2 === y.scoreChange.player2 &&
        x.preScore.player1 === y.preScore.player1 &&
        x.preScore.player2 === y.preScore.player2 &&
        x.preMatches.player1 === y.preMatches.player1 &&
        x.preMatches.player2 === y.preMatches.player2);
}
function storedOf(ev, a, b) {
    const key = a < b ? [a, b] : [b, a];
    return (ev.stored || []).find((row) => row.a === key[0] && row.b === key[1]);
}
function orderOf(queue) {
    return queue
        .slice()
        .sort((x, y) => (x.startTime < y.startTime ? -1 : x.startTime > y.startTime ? 1 : x.eventId < y.eventId ? -1 : x.eventId > y.eventId ? 1 : 0));
}
/**
 * 结算计划：queue 含目标场（stored 为空）和 startTime 不早于目标场的所有已结算场。
 * users 是这些人当前的库内状态，用于没有任何已结算快照的人。
 */
function planSettlement(targetId, queue, users) {
    const ordered = orderOf(queue);
    const start = new Map();
    const everyone = new Set();
    ordered.forEach((ev) => {
        ev.games.forEach((g) => {
            everyone.add(g.a);
            everyone.add(g.b);
        });
    });
    everyone.forEach((openid) => {
        // 该人在队列里最早的已结算场，其赛前快照就是他在目标场开赛前夕的真实状态
        for (const ev of ordered) {
            if (!ev.stored)
                continue;
            const row = (ev.stored || []).find((r) => r.a === openid || r.b === openid);
            if (!row)
                continue;
            const left = row.a === openid;
            start.set(openid, {
                score: left ? row.preScore.player1 : row.preScore.player2,
                matches: left ? row.preMatches.player1 : row.preMatches.player2
            });
            return;
        }
        const now = users.get(openid);
        if (now)
            start.set(openid, { score: now.score, matches: now.matches });
    });
    const result = replay(ordered, start);
    const matchWrites = [];
    const delta = new Map();
    const bump = (openid, value) => delta.set(openid, (delta.get(openid) || 0) + value);
    ordered.forEach((ev) => {
        const outcome = result.events.get(ev.eventId);
        outcome.games.forEach((game) => {
            const old = ev.stored ? storedOf(ev, game.a, game.b) : undefined;
            bump(game.a, game.scoreChange.player1);
            bump(game.b, game.scoreChange.player2);
            if (old) {
                bump(game.a, -old.scoreChange.player1);
                bump(game.b, -old.scoreChange.player2);
            }
            const isTarget = ev.eventId === targetId;
            if (isTarget || !old || !sameResult(old, game)) {
                matchWrites.push({ eventId: ev.eventId, a: game.a, b: game.b, result: game });
            }
        });
    });
    const target = result.events.get(targetId);
    const userChanges = [];
    everyone.forEach((openid) => {
        const inTarget = target.players.get(openid);
        const scoreDelta = delta.get(openid) || 0;
        if (!inTarget && scoreDelta === 0)
            return;
        userChanges.push({
            openid,
            scoreDelta,
            games: inTarget ? inTarget.games : 0,
            wins: inTarget ? inTarget.wins : 0
        });
    });
    userChanges.sort((x, y) => (x.openid < y.openid ? -1 : 1));
    return { matchWrites, userChanges };
}
