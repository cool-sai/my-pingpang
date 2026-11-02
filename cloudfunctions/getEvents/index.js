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
const AVATAR_TTL_SEC = 86400;
const AVATAR_FALLBACK_SEC = 10 * 60;
const AVATAR_SKEW_MS = 5 * 60 * 1000;
const AVATAR_BYTE_LIMIT = 350 * 1024;
function secondsOf(raw) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0)
        return AVATAR_FALLBACK_SEC;
    const seconds = value > AVATAR_TTL_SEC * 2 ? Math.round(value / 1000) : Math.round(value);
    if (seconds <= 0)
        return AVATAR_FALLBACK_SEC;
    return Math.min(seconds, AVATAR_TTL_SEC);
}
function readTemp(item) {
    if (!item)
        return null;
    const url = String(item.tempFileURL || '');
    if (url.indexOf('https://') !== 0)
        return null;
    if (item.status !== undefined && item.status !== 0 && String(item.status) !== '0')
        return null;
    return { url, maxAge: secondsOf(item.maxAge) };
}
function avatarStillValid(row, now) {
    const url = String(row.avatarUrl || '');
    const maxAge = Number(row.avatarMaxAge);
    const expire = Number(row.avatarExpire) || 0;
    if (url.indexOf('https://') !== 0 || !Number.isFinite(maxAge) || maxAge <= 0)
        return false;
    const skew = Math.min(AVATAR_SKEW_MS, (maxAge * 1000) / 2);
    return expire > now + skew;
}
async function requestTemp(fileList) {
    try {
        const res = await cloud.getTempFileURL({ fileList });
        return ((res && res.fileList) || []);
    }
    catch (err) {
        console.error('换取头像链接失败', err);
        return [];
    }
}
async function signAvatars(fileIDs) {
    const cloudIDs = Array.from(new Set(fileIDs.filter((fileID) => fileID.indexOf('cloud://') === 0)));
    const urls = new Map();
    for (let i = 0; i < cloudIDs.length; i += 50) {
        const batch = cloudIDs.slice(i, i + 50);
        let list = await requestTemp(batch.map((fileID) => ({ fileID, maxAge: AVATAR_TTL_SEC })));
        const gotUrl = list.some((item) => item && String(item.tempFileURL || '').indexOf('https://') === 0);
        if (!gotUrl)
            list = await requestTemp(batch);
        batch.forEach((fileID, index) => {
            const signed = readTemp(list[index]);
            if (signed)
                urls.set(fileID, signed);
        });
    }
    return urls;
}
async function loadSignups(eventId) {
    try {
        const res = await db.collection('signups').where({ eventId }).limit(128).get();
        const rows = res.data
            .slice()
            .sort((a, b) => signupTime(a.createTime) - signupTime(b.createTime));
        const now = Date.now();
        const stale = rows.filter((row) => {
            const fileID = String(row.avatar || '');
            return fileID.indexOf('cloud://') === 0 && !avatarStillValid(row, now);
        });
        const urls = await signAvatars(stale.map((row) => String(row.avatar || '')));
        await Promise.all(stale.map(async (row) => {
            const fileID = String(row.avatar || '');
            const signed = urls.get(fileID);
            if (!signed || !row._id)
                return;
            try {
                await db.collection('signups').doc(row._id).update({
                    data: {
                        avatarUrl: signed.url,
                        avatarExpire: now + signed.maxAge * 1000,
                        avatarMaxAge: signed.maxAge
                    }
                });
            }
            catch (err) {
                console.error('保存头像链接失败', err);
            }
        }));
        return rows.map((row) => {
            const fileID = String(row.avatar || '');
            const saved = avatarStillValid(row, now) ? String(row.avatarUrl || '') : '';
            const fresh = urls.get(fileID);
            const avatarMaxAge = fresh ? fresh.maxAge : (saved ? Number(row.avatarMaxAge) || 0 : 0);
            const avatarExpire = fresh ? now + fresh.maxAge * 1000 : (saved ? Number(row.avatarExpire) || 0 : 0);
            return {
                openid: row.openid,
                nickname: row.nickname || '球友',
                avatar: saved || (fresh && fresh.url) || (fileID.indexOf('cloud://') === 0 ? '' : fileID),
                avatarMaxAge,
                avatarExpire,
                avatarFrom: fresh ? 'signed' : (saved ? 'cache' : 'none')
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
