import { Client } from '@line/bot-sdk';
import admin from 'firebase-admin';

// Firebase Admin 초기화 (기존 DB 설정 적용)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        databaseURL: "https://facility-check-74a17-default-rtdb.firebaseio.com"
    });
}

const db = admin.database();

// LINE SDK 클라이언트 설정
const lineConfig = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new Client(lineConfig);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const events = req.body.events || [];

    try {
        for (const event of events) {
            if (event.type === 'message' && event.message.type === 'text') {
                const message = event.message;
                const source = event.source;

                // 1. 요청자 이름(displayName) 가져오기
                let userName = '알 수 없음';
                try {
                    if (source.type === 'group' && source.groupId && source.userId) {
                        // 단톡방 멤버 프로필 조회
                        const profile = await lineClient.getGroupMemberProfile(source.groupId, source.userId);
                        userName = profile.displayName;
                    } else if (source.type === 'room' && source.roomId && source.userId) {
                        // 룸 멤버 프로필 조회
                        const profile = await lineClient.getRoomMemberProfile(source.roomId, source.userId);
                        userName = profile.displayName;
                    } else if (source.userId) {
                        // 1:1 대화 프로필 조회
                        const profile = await lineClient.getProfile(source.userId);
                        userName = profile.displayName;
                    }
                } catch (err) {
                    console.error('프로필 조회 실패:', err);
                }

                // 2. 답장(Reply) 메시지 여부 확인
                const quotedMessageId = message.quotedMessageId;

                if (quotedMessageId) {
                    // 👉 [답장인 경우] 신규 등록하지 않고 로그 기록 또는 기존 건 상태 변경 처리
                    console.log(`답장 메시지 수신: ${message.text} (원본 ID: ${quotedMessageId})`);
                    
                    // 필요 시 답장이 올 경우 완료 처리할 로직 작성 가능
                } else {
                    // 👉 [일반 메시지인 경우] 신규 수리 요청으로 Realtime Database에 저장
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
        }
        return res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('웹훅 처리 중 에러:', error);
        return res.status(500).end();
    }
}
