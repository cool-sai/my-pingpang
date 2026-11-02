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
// 与 common/signFileUrls.ts 保持一致：cloud:// → 临时 https；不管过期
const TEMP_BATCH = 50;
async function signFileUrls(fileIDs) {
    const cloudIDs = Array.from(new Set(fileIDs.filter((id) => id && id.indexOf('cloud://') === 0)));
    const urls = new Map();
    for (let i = 0; i < cloudIDs.length; i += TEMP_BATCH) {
        const batch = cloudIDs.slice(i, i + TEMP_BATCH);
        let list = [];
        try {
            const res = await cloud.getTempFileURL({ fileList: batch });
            list = (res && res.fileList) || [];
        }
        catch (err) {
            console.error('换取临时链接失败', err);
        }
        batch.forEach((fileID, index) => {
            const item = list[index];
            const url = String(item && item.tempFileURL || '');
            if (url.indexOf('https://') !== 0)
                return;
            if (item && item.status !== undefined && item.status !== 0 && String(item.status) !== '0')
                return;
            urls.set(fileID, url);
        });
    }
    return urls;
}
async function resolveTempUrl(value) {
    const fileID = String(value || '');
    if (!fileID)
        return '';
    if (fileID.indexOf('https://') === 0)
        return fileID;
    if (fileID.indexOf('cloud://') !== 0)
        return '';
    const urls = await signFileUrls([fileID]);
    return urls.get(fileID) || '';
}
async function withCoverUrl(item) {
    const fileID = String(item.cover || '');
    const coverUrl = fileID.indexOf('https://') === 0 ? fileID : await resolveTempUrl(fileID);
    return { ...item, coverUrl };
}
async function loadSignups(eventId) {
    const res = await db.collection('signups').where({ eventId }).limit(200).get();
    const rows = res.data.slice().sort((a, b) => signupTime(a.createTime) - signupTime(b.createTime));
    const urls = await signFileUrls(rows.map((row) => String(row.avatar || '')));
    return rows.map((row) => {
        const fileID = String(row.avatar || '');
        const avatar = urls.get(fileID) || (fileID.indexOf('https://') === 0 ? fileID : (fileID.indexOf('cloud://') === 0 ? '' : fileID));
        return {
            openid: row.openid,
            nickname: row.nickname || '球友',
            avatar
        };
    });
}
const main = async (event) => {
    const id = String(event.id || '').trim();
    if (!id || id.length > 64) {
        return { success: false, error: '没有找到这场比赛' };
    }
    try {
        const one = await db.collection('events').doc(id).get();
        if (!one.data) {
            return { success: false, error: '没有找到这场比赛', missing: true };
        }
        // cover 保持库内 fileID；coverUrl 为临时 https，供非上传者展示
        const mapped = await withCoverUrl(mapEvent(one.data));
        if (!event.withSignups) {
            return { success: true, data: mapped };
        }
        const signups = await loadSignups(id);
        return { success: true, data: { ...mapped, signups } };
    }
    catch (err) {
        return { success: false, error: '没有找到这场比赛', missing: true };
    }
};
exports.main = main;
