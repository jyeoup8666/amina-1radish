const line = require('@line/bot-sdk');
const admin = require('firebase-admin');

// Firebase Admin SDK 초기화
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
}

const lineClient = new line.Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET
});

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(200).send('OK');

    const events = req.body.events || [];

    for (let event of events) {
        if (event.type === 'message' && event.message.type === 'text') {
            const userId = event.source.userId;
            const groupId = event.source.groupId;
            const text = event.message.text;
            const timestamp = event.timestamp;
            const msgId = event.message.id;

            // 1. 라인 프로필 이름(최민원 팀장 등) 가져오기
            let userName = '알 수 없음';
            try {
                if (groupId) {
                    const profile = await lineClient.getGroupMemberProfile(groupId, userId);
                    userName = profile.displayName;
                } else {
                    const profile = await lineClient.getProfile(userId);
                    userName = profile.displayName;
                }
            } catch (err) {
                console.error("라인 프로필 조회 실패:", err);
            }

            const db = admin.database();

            // 2. 답장(Quote Reply) 인지 확인
            const quotedMessageId = event.message.quotedMessageId;

            if (quotedMessageId) {
                // 답장인 경우: 대상 메시지의 현재 상태 조회
                const targetRef = db.ref(`facility_requests/${quotedMessageId}`);
                const snapshot = await targetRef.once('value');
                const targetData = snapshot.val();

                // 💡 [핵심] 대상 메시지가 존재하고, 아직 완료 처리 안 된 'pending' 건일 때만 완료로 전환!
                if (targetData && targetData.status === 'pending') {
                    await targetRef.update({
                        status: 'completed',           // 완료 상태로 변경
                        replyUser: userName,          // 답변자 이름
                        replyUserId: userId,
                        replyText: text,              // 답변 내용
                        replyTimestamp: timestamp      // 답변 시간
                    });
                } else {
                    // 대상 데이터가 없거나 이미 'completed' 상태라면 (즉, 답장에 답장한 경우) 무시합니다.
                    console.log("이미 완료된 요청에 대한 답장이거나 대상을 찾을 수 없어 무시합니다.");
                }
            } else {
                // 일반 메시지인 경우: 신규 수리/점검 요청 등록
                await db.ref(`facility_requests/${msgId}`).set({
                    userId: userId,
                    userName: userName,
                    text: text,
                    timestamp: timestamp,
                    status: 'pending'
                });
            }
        }
    }

    return res.status(200).json({ status: 'success' });
}
