const line = require('@line/bot-sdk');
const admin = require('firebase-admin');

// LINE SDK 클라이언트 설정
const lineClient = new line.Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET
});

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(200).send('OK');

    const events = req.body.events;

    for (let event of events) {
        if (event.type === 'message' && event.message.type === 'text') {
            const userId = event.source.userId;
            const groupId = event.source.groupId;
            const text = event.message.text;
            const timestamp = event.timestamp;
            
            // 1. 답장(Quote Reply) 인지 확인
            const replyToId = event.message.quotedMessageId || null;
            const status = replyToId ? 'completed' : 'pending';

            // 2. LINE 사용자 프로필(이름) 가져오기
            let userName = '알 수 없음';
            try {
                if (groupId) {
                    const profile = await lineClient.getGroupMemberProfile(groupId, userId);
                    userName = profile.displayName; // 예: "최민원 (시설팀장)"
                } else {
                    const profile = await lineClient.getProfile(userId);
                    userName = profile.displayName;
                }
            } catch (err) {
                console.error("라인 프로필 조회 실패:", err);
            }

            // 3. Firebase Realtime Database에 저장
            const db = admin.database();
            await db.ref(`facility_requests/${event.message.id}`).set({
                userId: userId,
                userName: userName, // 사용자 실제 이름 저장
                text: text,
                timestamp: timestamp,
                status: status,     // 'pending' 또는 'completed'
                replyTo: replytoId
            });
        }
    }

    return res.status(200).json({ status: 'success' });
}
