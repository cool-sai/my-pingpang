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
const AVATAR_BYTE_LIMIT = 350 * 1024;
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
async function withCoverUrls(items) {
    const urls = await signFileUrls(items.map((item) => String(item.cover || '')));
    return items.map((item) => {
        const fileID = String(item.cover || '');
        const coverUrl = urls.get(fileID) || (fileID.indexOf('https://') === 0 ? fileID : '');
        return { ...item, coverUrl };
    });
}
async function loadSignups(eventId) {
    try {
        const res = await db.collection('signups').where({ eventId }).limit(128).get();
        const rows = res.data
            .slice()
            .sort((a, b) => signupTime(a.createTime) - signupTime(b.createTime));
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
    catch (err) {
        return [];
    }
}
function cleanOpenid(value) {
    const text = String(value || '').trim();
    if (!text || text.length > 64 || /[/\s]/.test(text))
        return '';
    return text;
}
async function readAvatarFiles(eventId, openids) {
    const ids = Array.from(new Set(openids.map(cleanOpenid).filter(Boolean))).slice(0, 4);
    const files = [];
    for (let i = 0; i < ids.length; i += 1) {
        const openid = ids[i];
        try {
            const snap = await db.collection('signups').doc(`${eventId}_${openid}`).get();
            const row = snap && snap.data;
            const fileID = String(row && row.avatar || '');
            if (fileID.indexOf('cloud://') !== 0)
                continue;
            const file = await cloud.downloadFile({ fileID });
            const content = file && file.fileContent;
            if (!content)
                continue;
            const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
            if (!buf.length || buf.length > AVATAR_BYTE_LIMIT)
                continue;
            files.push({ openid, body: buf.toString('base64') });
        }
        catch (err) {
            console.error('读取头像文件失败', err);
        }
    }
    return files;
}
const main = async (event) => {
    const { status = 'all', id = '' } = event;
    try {
        const avatarOpenids = Array.isArray(event.avatarOpenids) ? event.avatarOpenids : [];
        if (id && avatarOpenids.length > 0) {
            return { success: true, data: await readAvatarFiles(String(id), avatarOpenids) };
        }
        if (id) {
            const one = await db.collection('events').doc(String(id)).get();
            if (!one.data) {
                return { success: false, error: '没有找到这场比赛' };
            }
            const signups = await loadSignups(String(id));
            // cover 保持库内 fileID；coverUrl 为临时 https，供非上传者展示
            const [mapped] = await withCoverUrls([mapEvent(one.data)]);
            return { success: true, data: [{ ...mapped, signups }] };
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
        // cover 保持库内 fileID；coverUrl 为临时 https，供非上传者展示
        const data = await withCoverUrls(res.data.map(mapEvent));
        return { success: true, data };
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
