"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const cloud = require('wx-server-sdk');
cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});
const db = cloud.database({
    throwOnNotFound: false
});
const INITIAL_SCORE = 1000;
const COUNTER_ID = 'userSeq';
function errorText(err) {
    const error = err;
    return String(error?.errMsg || error?.message || '登录失败');
}
async function ensureCounter() {
    try {
        await db.createCollection('counters');
    }
    catch (err) {
        // 集合已经有了
    }
    const ref = db.collection('counters').doc(COUNTER_ID);
    const snap = await ref.get();
    const counter = snap.data;
    if (counter && Number.isFinite(Number(counter.n)))
        return;
    try {
        const initial = { n: 0 };
        await ref.set({ data: initial });
    }
    catch (err) {
        const again = await ref.get();
        if (!again.data)
            throw err;
    }
}
async function allocateUserNo() {
    await ensureCounter();
    return db.runTransaction(async (transaction) => {
        const ref = transaction.collection('counters').doc(COUNTER_ID);
        const snap = await ref.get();
        const counter = snap.data;
        const current = Number(counter && counter.n);
        if (!Number.isFinite(current) || current < 0) {
            throw new Error('序号计数损坏');
        }
        const next = current + 1;
        const nextCounter = { n: next };
        await ref.update({ data: nextCounter });
        return next;
    });
}
const main = async () => {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    try {
        const userResult = await db.collection('users').where({
            openid
        }).get();
        if (userResult.data.length > 0) {
            return {
                success: true,
                data: userResult.data[0]
            };
        }
        const userNo = await allocateUserNo();
        const newUser = {
            openid,
            nickname: `用户${userNo}`,
            avatar: '',
            userNo,
            profileReady: false,
            score: INITIAL_SCORE,
            totalMatches: 0,
            winMatches: 0,
            loseMatches: 0,
            createTime: db.serverDate(),
            updateTime: db.serverDate()
        };
        await db.collection('users').add({
            data: newUser
        });
        return {
            success: true,
            data: newUser
        };
    }
    catch (err) {
        return {
            success: false,
            error: errorText(err)
        };
    }
};
exports.main = main;
