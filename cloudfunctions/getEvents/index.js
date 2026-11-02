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
const main = async (event) => {
    const { status = 'all', id = '' } = event;
    try {
        if (id) {
            const one = await db.collection('events').doc(String(id)).get();
            if (!one.data) {
                return { success: false, error: '没有找到这场比赛' };
            }
            return { success: true, data: [mapEvent(one.data)] };
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
