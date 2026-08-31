const line = require('@line/bot-sdk');
const admin = require('firebase-admin');

// Firebase Admin 초기화
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL || "https://facility-check-74a17-default-rtdb.firebaseio.com"
    });
}

const db = admin.database();

// LINE SDK 클라이언트 생성
const lineConfig = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new line.Client(lineConfig);

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

                // ----------------------------------------------------
                // [케이스 A] 답장 메시지인 경우 -> 원본 요청을 '완료' 처리
                // ----------------------------------------------------
                if (message.quotedMessageId) {
                    const quotedId = message.quotedMessageId;
                    
                    // DB에서 quotedMessageId와 일치하는 originalMessageId 검색
                    const snapshot = await db.ref('facility_requests')
                        .orderByChild('originalMessageId')
                        .equalTo(quotedId)
                        .once('value');

                    if (snapshot.exists()) {
                        const updates = {};
                        snapshot.forEach((child) => {
                            // 상태를 completed로 변경하고 답변 내용 기록
                            updates[`facility_requests/${child.key}/status`] = 'completed';
                            updates[`facility_requests/${child.key}/replyText`] = message.text;
                        });
                        await db.ref().update(updates);
                        console.log(`[완료 처리 성공] 원본 메시지 ID: ${quotedId}`);
                    } else {
                        console.log(`[완료 처리 실패] 원본 메시지 ID(${quotedId})를 DB에서 찾을 수 없음`);
                    }
                    continue; // 답장 자체는 대기 목록에 새로 등록하지 않고 다음 이벤트로 진행
                }

                // ----------------------------------------------------
                // [케이스 B] 신규 메시지인 경우 -> '대기중' 요청으로 DB 추가
                // ----------------------------------------------------
                let userName = '알 수 없음';
                try {
                    if (source.type === 'group' && source.groupId && source.userId) {
                        const profile = await lineClient.getGroupMemberProfile(source.groupId, source.userId);
                        userName = profile.displayName;
                    } else if (source.type === 'room' && source.roomId && source.userId) {
                        const profile = await lineClient.getRoomMemberProfile(source.roomId, source.userId);
                        userName = profile.displayName;
                    } else if (source.userId) {
                        const profile = await lineClient.getProfile(source.userId);
                        userName = profile.displayName;
                    }
                } catch (err) {
                    console.error('라인 프로필 조회 실패:', err.message);
                }

                // DB에 저장 (훗날 답장이 달렸을 때 찾을 수 있도록 originalMessageId도 함께 저장)
                const newRequestRef = db.ref('facility_requests').push();
                await newRequestRef.set({
                    originalMessageId: message.id, // 라인 메시지 고유 ID
                    text: message.text,
                    userName: userName,
                    userId: source.userId || '',
                    status: 'pending',             // 대기 중 상태
                    timestamp: admin.database.ServerValue.TIMESTAMP
                });
            }
        }
        return res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('웹훅 처리 중 오류 발생:', error);
        return res.status(500).send('Internal Server Error');
    }
};
