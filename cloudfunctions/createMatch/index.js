"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const K_FACTOR = 32;
const K_FACTOR_PRO = 16;
const getExpectedScore = (playerScore, opponentScore) => {
    return 1 / (1 + Math.pow(10, (opponentScore - playerScore) / 400));
};
const getKFactor = (score) => {
    return score < 1500 ? K_FACTOR : K_FACTOR_PRO;
};
const calculateNewScore = (playerScore, opponentScore, actualScore) => {
    const expected = getExpectedScore(playerScore, opponentScore);
    const k = getKFactor(playerScore);
    return Math.round(playerScore + k * (actualScore - expected));
};
const main = async (event) => {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const { opponentOpenid, player1Score, player2Score, location, matchType = 'friendly' } = event;
    if (!opponentOpenid || player1Score === undefined || player2Score === undefined) {
        return { success: false, error: '参数不完整' };
    }
    if (player1Score < 0 || player2Score < 0) {
        return { success: false, error: '比分不能为负数' };
    }
    if (openid === opponentOpenid) {
        return { success: false, error: '不能和自己比赛' };
    }
    if (String(opponentOpenid).indexOf('virtual') === 0) {
        return { success: false, error: '不能和虚拟球友记分' };
    }
    try {
        const [player1Res, player2Res] = await Promise.all([
            db.collection('users').where({ openid }).get(),
            db.collection('users').where({ openid: opponentOpenid }).get()
        ]);
        if (!player1Res.data.length || !player2Res.data.length) {
            return { success: false, error: '用户不存在' };
        }
        const player1 = player1Res.data[0];
        const player2 = player2Res.data[0];
        const p1Wins = player1Score > player2Score;
        const p2Wins = player2Score > player1Score;
        const isDraw = player1Score === player2Score;
        let p1ScoreChange = 0;
        let p2ScoreChange = 0;
        let newP1Score = player1.score;
        let newP2Score = player2.score;
        if (!isDraw) {
            if (p1Wins) {
                p1ScoreChange = calculateNewScore(player1.score, player2.score, 1) - player1.score;
                p2ScoreChange = calculateNewScore(player2.score, player1.score, 0) - player2.score;
            }
            else {
                p1ScoreChange = calculateNewScore(player1.score, player2.score, 0) - player1.score;
                p2ScoreChange = calculateNewScore(player2.score, player1.score, 1) - player2.score;
            }
            newP1Score = player1.score + p1ScoreChange;
            newP2Score = player2.score + p2ScoreChange;
        }
        const winner = p1Wins ? 'player1' : p2Wins ? 'player2' : 'draw';
        const match = {
            player1Openid: openid,
            player2Openid: opponentOpenid,
            player1: {
                openid,
                nickname: player1.nickname,
                avatar: player1.avatar,
                score: player1Score
            },
            player2: {
                openid: opponentOpenid,
                nickname: player2.nickname,
                avatar: player2.avatar,
                score: player2Score
            },
            scoreChange: {
                player1: p1ScoreChange,
                player2: p2ScoreChange
            },
            winner,
            matchType,
            location,
            status: 'completed',
            createTime: db.serverDate()
        };
        const matchRes = await db.collection('matches').add({ data: match });
        // 注意：输家/平局时不能写 winMatches: 0，否则会把历史胜负场重置成 0
        const p1Data = {
            score: newP1Score,
            totalMatches: db.command.inc(1),
            updateTime: db.serverDate()
        };
        const p2Data = {
            score: newP2Score,
            totalMatches: db.command.inc(1),
            updateTime: db.serverDate()
        };
        if (p1Wins) {
            p1Data.winMatches = db.command.inc(1);
            p2Data.loseMatches = db.command.inc(1);
        }
        else if (p2Wins) {
            p1Data.loseMatches = db.command.inc(1);
            p2Data.winMatches = db.command.inc(1);
        }
        await Promise.all([
            db.collection('users').where({ openid }).update({ data: p1Data }),
            db.collection('users').where({ openid: opponentOpenid }).update({ data: p2Data })
        ]);
        return {
            success: true,
            data: {
                matchId: matchRes._id,
                winner,
                scoreChange: { player1: p1ScoreChange, player2: p2ScoreChange },
                newScores: { player1: newP1Score, player2: newP2Score }
            }
        };
    }
    catch (err) {
        const error = err;
        return { success: false, error: error.message };
    }
};
exports.main = main;
