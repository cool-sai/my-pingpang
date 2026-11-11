"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database({ throwOnNotFound: false });
function withStatusText(item) {
    return {
        ...item,
        statusText: item.status === 'pending' ? '待确认' : '已结束'
    };
}
const main = async (event) => {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const id = String(event.id || '').trim();
    const { status = 'all' } = event;
    try {
        if (id) {
            if (id.length > 128)
                return { success: false, error: '没有找到这场对阵' };
            const snap = await db.collection('matches').doc(id).get();
            const row = snap && snap.data;
            if (!row)
                return { success: true, data: [], missing: true };
            return { success: true, data: [withStatusText({ ...row, _id: row._id || id })] };
        }
        let query = db.collection('matches').where(db.command.or([
            { player1Openid: openid },
            { player2Openid: openid }
        ]));
        if (status !== 'all') {
            query = query.where({ status });
        }
        const res = await query.orderBy('createTime', 'desc').limit(50).get();
        const matches = res.data.map(withStatusText);
        return { success: true, data: matches };
    }
    catch (err) {
        const error = err;
        return { success: false, error: error.message };
    }
};
exports.main = main;
