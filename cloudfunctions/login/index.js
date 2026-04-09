"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const cloud = require('wx-server-sdk');
cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});
const db = cloud.database();
const INITIAL_SCORE = 1000;
const main = async (event) => {
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
        const newUser = {
            openid,
            nickname: event.userInfo?.nickName || '乒乓球爱好者',
            avatar: event.userInfo?.avatarUrl || '',
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
        const error = err;
        return {
            success: false,
            error: error.message
        };
    }
};
exports.main = main;
