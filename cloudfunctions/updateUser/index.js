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
const REGION_LIMIT = 30;
function readRegion(provinceValue, cityValue) {
    const province = String(provinceValue || '').trim();
    const city = String(cityValue || '').trim();
    if (province.length > REGION_LIMIT || city.length > REGION_LIMIT) {
        return { error: '省市名称过长' };
    }
    if ((province && !city) || (!province && city)) {
        return { error: '请选择省市' };
    }
    return { province, city };
}
const main = async (event) => {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    if (event.action === 'region') {
        const region = readRegion(event.province, event.city);
        if (region.error) {
            return { success: false, error: region.error };
        }
        try {
            const current = await db.collection('users').where({ openid }).limit(1).get();
            if (!current.data.length) {
                return { success: false, error: '请先登录' };
            }
            const patch = {
                province: region.province,
                city: region.city,
                updateTime: db.serverDate()
            };
            await db.collection('users').where({ openid }).update({ data: patch });
            const saved = await db.collection('users').where({ openid }).limit(1).get();
            return { success: true, data: saved.data[0] };
        }
        catch (err) {
            const error = err;
            return { success: false, error: error.message || '保存失败' };
        }
    }
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
        const patch = {
            nickname: nicknameResult.nickname,
            avatar: avatarResult.avatar,
            profileReady: true,
            updateTime: db.serverDate()
        };
        await db.collection('users').where({ openid }).update({
            data: patch
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
