const line = require('@line/bot-sdk');
const admin = require('firebase-admin');

// Firebase Admin 안전한 초기화
if (!admin.apps.length) {
    const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID || "facility-check-74a17",
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY 
            ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
            : undefined,
    };

    // 서비스 계정 인증 정보가 충분치 않을 경우를 대비한 세이프티 로직
    if (serviceAccount.clientEmail && serviceAccount.privateKey) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: process.env.FIREBASE_DATABASE_URL || "https://facility-check-74a17-default-rtdb.firebaseio.com"
        });
    } else {
        // 환경 변수가 없을 때 기본 앱 인증 구조 사용
        admin.initializeApp({
            projectId: "facility-check-74a17",
            databaseURL: process.env.FIREBASE_DATABASE_URL || "https://facility-check-74a17-default-rtdb.firebaseio.com"
        });
    }
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
                    
                    const snapshot = await db.ref('facility_requests')
                        .orderByChild('originalMessageId')
                        .equalTo(quotedId)
                        .once('value');

                    if (snapshot.exists()) {
                        const updates = {};
                        snapshot.forEach((child) => {
                            updates[`facility_requests/${child.key}/status`] = 'completed';
                            updates[`facility_requests/${child.key}/replyText`] = message.text;
                        });
                        await db.ref().update(updates);
                        console.log(`[완료 처리 성공] 원본 메시지 ID: ${quotedId}`);
                    }
                    continue;
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

                const newRequestRef = db.ref('facility_requests').push();
                await newRequestRef.set({
                    originalMessageId: message.id,
                    text: message.text,
                    userName: userName,
                    userId: source.userId || '',
                    status: 'pending',
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
