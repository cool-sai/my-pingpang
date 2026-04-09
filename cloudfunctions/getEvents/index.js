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
const main = async (event) => {
    const { status = 'all' } = event;
    try {
        let query = db.collection('events');
        if (status !== 'all') {
            query = query.where({ status });
        }
        const res = await query.orderBy('startTime', 'desc').limit(50).get();
        const events = res.data.map((item) => ({
            ...item,
            statusText: statusMap[item.status]?.text || item.status,
            statusClass: statusMap[item.status]?.class || ''
        }));
        return { success: true, data: events };
    }
    catch (err) {
        const error = err;
        return { success: false, error: error.message };
    }
};
exports.main = main;
