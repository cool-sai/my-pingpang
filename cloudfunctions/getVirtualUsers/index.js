"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database({ throwOnNotFound: false });
// 与 cloudfunctions/common/admin.ts 保持一致。common 不随函数上传，故在此内联。
const SUPER_ADMIN_OPENID = 'oNw7Y5E0Wkbx_ZqHgLNOAntmTp3g';
function isSuperAdmin(openid) {
    return String(openid || '') === SUPER_ADMIN_OPENID;
}
function isVirtual(openid) {
    return String(openid || '').indexOf('virtual') === 0;
}
const TEMP_BATCH = 50;
// 与 common/signFileUrls.ts 保持一致：cloud:// → 临时 https；不管过期
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
function resolveAvatar(fileID, urls) {
    const id = String(fileID || '');
    if (!id)
        return '';
    if (id.indexOf('https://') === 0)
        return id;
    return urls.get(id) || (id.indexOf('cloud://') === 0 ? '' : id);
}
function virtualNo(nickname) {
    const matched = /^球友(\d+)$/.exec(String(nickname || ''));
    return matched ? Number(matched[1]) : 0;
}
function virtualOpenidNo(openid) {
    const matched = /^virtual(\d+)$/.exec(String(openid || ''));
    return matched ? Number(matched[1]) : 0;
}
function isUnowned(user) {
    return !String(user.ownerOpenid || '').trim();
}
function inMyVirtualPool(user, ownerOpenid) {
    const owner = String(user.ownerOpenid || '').trim();
    return !owner || owner === ownerOpenid;
}
async function requireLogin() {
    const openid = String((cloud.getWXContext() && cloud.getWXContext().OPENID) || '');
    if (!openid)
        return { error: '请先登录' };
    const res = await db.collection('users').where({ openid }).limit(1).get();
    if (!res.data.length)
        return { error: '请先登录' };
    return { openid, user: res.data[0] };
}
async function loadVirtualUsers() {
    const all = [];
    const query = { openid: db.RegExp({ regexp: '^virtual', options: '' }) };
    for (let skip = 0; skip < 1000; skip += 100) {
        const res = await db.collection('users').where(query).skip(skip).limit(100).get();
        const rows = (res.data || []);
        all.push(...rows);
        if (rows.length < 100)
            break;
    }
    return all.slice().sort((a, b) => {
        const diff = virtualNo(a.nickname) - virtualNo(b.nickname);
        return diff || String(a.openid).localeCompare(String(b.openid));
    });
}
async function loadUser(openid) {
    const res = await db.collection('users').where({ openid }).limit(1).get();
    return (res.data || [])[0] || null;
}
function nextVirtualIdentity(existing) {
    const openids = new Set(existing.map((user) => String(user.openid)));
    let nextNo = existing.reduce((max, user) => Math.max(max, virtualNo(user.nickname), virtualOpenidNo(user.openid)), 0);
    let openid = '';
    do {
        nextNo += 1;
        openid = `virtual${nextNo}`;
    } while (openids.has(openid));
    return { openid, nickname: `球友${nextNo}` };
}
const main = async () => {
    try {
        const auth = await requireLogin();
        if (auth.error)
            return { success: false, error: auth.error };
        const admin = isSuperAdmin(auth.openid);
        const all = await loadVirtualUsers();
        const list = admin ? all : all.filter((user) => inMyVirtualPool(user, auth.openid));
        const urls = await signFileUrls(list.map((user) => user.avatar || ''));
        return {
            success: true,
            data: {
                isAdmin: admin,
                users: list.map((user) => ({
                    openid: user.openid,
                    nickname: user.nickname || '球友',
                    avatar: resolveAvatar(user.avatar, urls),
                    ownerOpenid: String(user.ownerOpenid || '')
                }))
            }
        };
    }
    catch (err) {
        console.error('读取虚拟球友失败', err);
        return { success: false, error: '加载失败' };
    }
};
exports.main = main;
