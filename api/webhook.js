const line = require('@line/bot-sdk');
const admin = require('firebase-admin');

// 1. Firebase Admin 초기화
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            projectId: "facility-check-74a17",
            databaseURL: "https://facility-check-74a17-default-rtdb.firebaseio.com"
        });
    } catch (e) {
        console.error("Firebase 초기화 오류:", e);
    }
}

const db = admin.database();

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const events = req.body.events || [];

    try {
        for (const event of events) {
            if (event.type === 'message' && event.message.type === 'text') {
                const message = event.message;
                const source = event.source;

                // [케이스 A] 답장 메시지인 경우 -> 원본 요청을 '완료' 처리
                if (message.quotedMessageId) {
                    const quotedId = message.quotedMessageId;
                    
                    const snapshot = await db.ref('facility_requests')
                        .orderByChild('originalMessageId')
                        .equalTo(quotedId)
                        .once('value');

                    if (snapshot.exists()) {
                        const updates = {};
                        snapshot.forEach((child) => {
                            updates[`facility_requests/${child.key}/status`] = 'completed';
                            updates[`facility_requests/${child.key}/replyText`] = message.text;
                            updates[`facility_requests/${child.key}/completedAt`] = admin.database.ServerValue.TIMESTAMP;
                        });
                        await db.ref().update(updates);
                    }
                    continue;
                }

                // [케이스 B] 신규 메시지인 경우 -> DB에 바로 저장 (사용자 이름 조회 제거)
                const newRequestRef = db.ref('facility_requests').push();
                await newRequestRef.set({
                    originalMessageId: message.id,
                    text: message.text,
                    userId: source.userId || '',
                    status: 'pending',
                    timestamp: admin.database.ServerValue.TIMESTAMP
                });
            }
        }
        return res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('웹훅 실행 오류:', error);
        return res.status(500).send('Internal Server Error');
    }
};
