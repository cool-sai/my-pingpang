"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const main = async (event) => {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const { filter = 'all' } = event;
    try {
        let query = db.collection('users').orderBy('score', 'desc');
        if (filter === 'club') {
            query = query.orderBy('score', 'desc');
        }
        const res = await query.limit(100).get();
        const list = res.data
            .filter((item) => item.cancelled !== true)
            .map((item, index) => ({
            ...item,
            rank: index + 1
        }));
        const myRank = list.find((item) => item.openid === openid) || null;
        return { success: true, data: { list, myRank } };
    }
    catch (err) {
        const error = err;
        return { success: false, error: error.message };
    }
};
exports.main = main;
