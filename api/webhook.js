const line = require('@line/bot-sdk');
const admin = require('firebase-admin');

// Firebase Admin 초기화 (중복 실행 방지)
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
    // POST 요청만 허용
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const events = req.body.events || [];

    try {
        for (const event of events) {
            if (event.type === 'message' && event.message.type === 'text') {
                const message = event.message;
                const source = event.source;

                // 1. 답장(Reply) 메시지 필터링
                // 누군가의 메시지에 '답장' 기능으로 보낸 메시지는 quotedMessageId가 존재함
                if (message.quotedMessageId) {
                    console.log(`[답장 스킵] 원본ID: ${message.quotedMessageId} / 내용: ${message.text}`);
                    continue; // DB에 저장하지 않고 다음 이벤트로 넘어감
                }

                // 2. 단톡방/1:1 대화 요청자 이름(displayName) 조회
                let userName = '알 수 없음';
                try {
                    if (source.type === 'group' && source.groupId && source.userId) {
                        // 단톡방 멤버 프로필 조회
                        const profile = await lineClient.getGroupMemberProfile(source.groupId, source.userId);
                        userName = profile.displayName;
                    } else if (source.type === 'room' && source.roomId && source.userId) {
                        // 일반 대화방 멤버 프로필 조회
                        const profile = await lineClient.getRoomMemberProfile(source.roomId, source.userId);
                        userName = profile.displayName;
                    } else if (source.userId) {
                        // 1:1 대화 프로필 조회
                        const profile = await lineClient.getProfile(source.userId);
                        userName = profile.displayName;
                    }
                } catch (err) {
                    console.error('라인 프로필 조회 실패:', err);
                }

                // 3. 신규 수리/점검 요청만 Realtime Database에 저장
                const newRequestRef = db.ref('facility_requests').push();
                await newRequestRef.set({
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
