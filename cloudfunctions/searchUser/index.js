"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const main = async (event) => {
    const { nickname } = event;
    if (!nickname || nickname.length < 2) {
        return { success: false, error: '昵称至少2个字符' };
    }
    try {
        const res = await db.collection('users')
            .where({
            nickname: db.RegExp({
                regexp: nickname,
                options: 'i'
            })
        })
            .limit(10)
            .field({
            openid: true,
            nickname: true,
            avatar: true,
            score: true
        })
            .get();
        const data = res.data
            .filter((item) => String(item.openid || '').indexOf('virtual') !== 0);
        return { success: true, data };
    }
    catch (err) {
        const error = err;
        return { success: false, error: error.message };
    }
};
exports.main = main;
