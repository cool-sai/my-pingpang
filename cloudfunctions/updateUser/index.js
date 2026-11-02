"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const cloud = require('wx-server-sdk');
cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});
const db = cloud.database();
const NICKNAME_LIMIT = 20;
function readNickname(value) {
    const nickname = String(value || '').trim();
    if (!nickname)
        return { error: '请填写昵称' };
    if (nickname.length > NICKNAME_LIMIT)
        return { error: `昵称最多 ${NICKNAME_LIMIT} 字` };
    return { nickname };
}
function readAvatar(value) {
    const avatar = String(value || '').trim();
    if (!avatar)
        return { avatar: '' };
    if (avatar.indexOf('cloud://') === 0 || avatar.indexOf('https://') === 0) {
        return { avatar };
    }
    return { error: '头像无效' };
}
const main = async (event) => {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const nicknameResult = readNickname(event.nickname);
    if (nicknameResult.error) {
        return { success: false, error: nicknameResult.error };
    }
    const avatarResult = readAvatar(event.avatar);
    if (avatarResult.error) {
        return { success: false, error: avatarResult.error };
    }
    try {
        const current = await db.collection('users').where({ openid }).limit(1).get();
        if (!current.data.length) {
            return { success: false, error: '请先登录' };
        }
        await db.collection('users').where({ openid }).update({
            data: {
                nickname: nicknameResult.nickname,
                avatar: avatarResult.avatar,
                profileReady: true,
                updateTime: db.serverDate()
            }
        });
        const saved = await db.collection('users').where({ openid }).limit(1).get();
        return {
            success: true,
            data: saved.data[0]
        };
    }
    catch (err) {
        const error = err;
        return {
            success: false,
            error: error.message || '保存失败'
        };
    }
};
exports.main = main;
