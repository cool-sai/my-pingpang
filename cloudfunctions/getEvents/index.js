"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const statusMap = {
    upcoming: { text: '报名中', class: 'upcoming' },
    ongoing: { text: '进行中', class: 'ongoing' },
    finished: { text: '已结束', class: 'finished' }
};
function mapEvent(item) {
    return {
        ...item,
        statusText: statusMap[item.status]?.text || item.status,
        statusClass: statusMap[item.status]?.class || ''
    };
}
function signupTime(value) {
    if (value instanceof Date)
        return value.getTime();
    if (value && typeof value === 'object' && '$date' in value) {
        const raw = value.$date;
        const parsed = typeof raw === 'number' ? raw : Date.parse(String(raw || ''));
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    const parsed = Date.parse(String(value || ''));
    return Number.isNaN(parsed) ? 0 : parsed;
}
async function readableAvatars(fileIDs) {
    const cloudIDs = Array.from(new Set(fileIDs.filter((fileID) => fileID.indexOf('cloud://') === 0)));
    const urls = new Map();
    for (let i = 0; i < cloudIDs.length; i += 50) {
        const fileList = cloudIDs.slice(i, i + 50).map((fileID) => ({ fileID, maxAge: 60 * 60 }));
        try {
            const res = await cloud.getTempFileURL({ fileList });
            const list = (res && res.fileList) || [];
            list.forEach((item) => {
                if (item && item.fileID && item.tempFileURL && item.status === 0) {
                    urls.set(item.fileID, item.tempFileURL);
                }
            });
        }
        catch (err) {
            console.error('换取头像链接失败', err);
        }
    }
    return urls;
}
async function loadSignups(eventId) {
    try {
        const res = await db.collection('signups').where({ eventId }).limit(128).get();
        const rows = res.data
            .slice()
            .sort((a, b) => signupTime(a.createTime) - signupTime(b.createTime));
        const urls = await readableAvatars(rows.map((item) => String(item.avatar || '')));
        return rows.map((item) => {
            const fileID = String(item.avatar || '');
            return {
                openid: item.openid,
                nickname: item.nickname || '球友',
                avatar: urls.get(fileID) || (fileID.indexOf('cloud://') === 0 ? '' : fileID)
            };
        });
    }
    catch (err) {
        return [];
    }
}
const main = async (event) => {
    const { status = 'all', id = '' } = event;
    try {
        if (id) {
            const one = await db.collection('events').doc(String(id)).get();
            if (!one.data) {
                return { success: false, error: '没有找到这场比赛' };
            }
            const signups = await loadSignups(String(id));
            return { success: true, data: [{ ...mapEvent(one.data), signups }] };
        }
        const province = String(event.province || '').trim();
        const city = String(event.city || '').trim();
        const where = {};
        if (status !== 'all')
            where.status = status;
        if (province)
            where.province = province;
        if (city)
            where.city = city;
        let query = db.collection('events');
        if (Object.keys(where).length > 0) {
            query = query.where(where);
        }
        const res = await query.orderBy('startTime', 'desc').limit(50).get();
        return { success: true, data: res.data.map(mapEvent) };
    }
    catch (err) {
        const error = err;
        if (id) {
            return { success: false, error: '没有找到这场比赛' };
        }
        return { success: false, error: error.message };
    }
};
exports.main = main;
