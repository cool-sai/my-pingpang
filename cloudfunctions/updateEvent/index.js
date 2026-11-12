"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const cloud = require('wx-server-sdk');
const reverseGeocode = require('./reverseGeocode');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
function isRealDateTime(value) {
    const [datePart, timePart] = value.split(' ');
    const [year, month, day] = datePart.split('-').map((part) => Number(part));
    const [hour, minute] = timePart.split(':').map((part) => Number(part));
    if (hour > 23 || minute > 59)
        return false;
    const date = new Date(year, month - 1, day, hour, minute);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
function readEventFields(input) {
    const cover = String(input.cover || '').trim();
    const name = String(input.name || '').trim();
    const startTime = String(input.startTime || '').trim();
    const location = String(input.location || '').trim();
    const locationAddress = String(input.locationAddress || '').trim();
    const latitude = Number(input.latitude);
    const longitude = Number(input.longitude);
    const description = String(input.description || '').trim();
    const format = String(input.format || '').trim();
    const status = String(input.status || '').trim();
    const maxPlayers = Number.parseInt(String(input.maxPlayers ?? '0'), 10);
    const formats = ['分段赛', '淘汰赛', '积分赛', '循环赛'];
    const statuses = ['upcoming', 'ongoing', 'finished'];
    if (cover && cover.indexOf('cloud://') !== 0) {
        return { error: '封面图无效，请重新选择' };
    }
    if (cover.length > 512)
        return { error: '封面图无效' };
    if (!name)
        return { error: '请填写比赛名称' };
    if (name.length > 30)
        return { error: '比赛名称最多 30 字' };
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(startTime) || !isRealDateTime(startTime)) {
        return { error: '请选择比赛时间' };
    }
    if (!location)
        return { error: '请在地图上选择地点' };
    if (location.length > 80)
        return { error: '地点名称最多 80 字' };
    if (locationAddress.length > 120)
        return { error: '详细地址最多 120 字' };
    if (!Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180) {
        return { error: '请在地图上选择地点' };
    }
    if (formats.indexOf(format) < 0)
        return { error: '请选择赛制' };
    if (statuses.indexOf(status) < 0)
        return { error: '请选择状态' };
    // finished 是否合法由 main 按库里现状判断：已结束的比赛状态保持不变，其它比赛不能绕过结算改成已结束
    if (!Number.isInteger(maxPlayers) || maxPlayers < 0 || maxPlayers > 128 || (maxPlayers !== 0 && maxPlayers < 2)) {
        return { error: '人数上限填 2 到 128，不限制就留空' };
    }
    if (description.length > 300)
        return { error: '说明最多 300 字' };
    return {
        value: {
            cover,
            name,
            startTime,
            location,
            locationAddress,
            latitude,
            longitude,
            description,
            format: format,
            status: status,
            maxPlayers,
        },
    };
}
const main = async (event) => {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    if (!openid) {
        return { success: false, error: '请先登录' };
    }
    const id = String(event.id || '').trim();
    if (!id || id.length > 64) {
        return { success: false, error: '没有找到这场比赛' };
    }
    const parsed = readEventFields(event);
    if (parsed.error || !parsed.value) {
        return { success: false, error: parsed.error || '请检查比赛信息' };
    }
    try {
        const current = await db.collection('events').doc(id).get();
        const currentEvent = current.data;
        if (!currentEvent) {
            return { success: false, error: '没有找到这场比赛' };
        }
        if (currentEvent.creatorOpenid !== openid) {
            return { success: false, error: '只能修改自己发起的比赛' };
        }
        if (currentEvent.deleting)
            return { success: false, error: '比赛正在删除，不能编辑' };
        const region = await reverseGeocode(parsed.value.latitude, parsed.value.longitude);
        // 地址解析期间比赛可能已经结束或进入删除，必须在最终写入的事务里重新判断。
        await db.runTransaction(async (transaction) => {
            const snap = await transaction.collection('events').doc(id).get();
            const latest = snap.data;
            if (!latest)
                throw new Error('没有找到这场比赛');
            if (latest.creatorOpenid !== openid)
                throw new Error('只能修改自己发起的比赛');
            if (latest.deleting)
                throw new Error('比赛正在删除，不能编辑');
            const finished = latest.status === 'finished' || !!latest.settled;
            if (!finished && parsed.value.status === 'finished') {
                throw new Error('比赛结束请在详情页点「结束比赛」');
            }
            const data = {
                ...parsed.value,
                province: region.province,
                city: region.city,
                updateTime: db.serverDate(),
            };
            if (finished) {
                data.status = latest.status;
                data.startTime = latest.startTime;
            }
            await transaction.collection('events').doc(id).update({ data });
        });
        return { success: true, data: { _id: id } };
    }
    catch (err) {
        const error = err;
        return { success: false, error: error.message };
    }
};
exports.main = main;
