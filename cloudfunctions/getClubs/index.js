"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const main = async (event) => {
    const { sortBy = 'score' } = event;
    try {
        const orderField = sortBy === 'members' ? 'memberCount' : 'totalScore';
        const res = await db.collection('clubs')
            .orderBy(orderField, 'desc')
            .limit(50)
            .get();
        return { success: true, data: res.data };
    }
    catch (err) {
        const error = err;
        return { success: false, error: error.message };
    }
};
exports.main = main;
