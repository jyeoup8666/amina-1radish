export default async function handler(req, res) {
  if (req.method === 'POST') {
    const events = req.body.events || [];
    const firebaseUrl = 'https://facility-check-74a17-default-rtdb.firebaseio.com/facility_requests';

    for (let event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userMessage = event.message.text.trim();
        const messageId = event.message.id; // 현재 메시지 ID
        const quotedMessageId = event.message.quotedMessageId; // 답장 대상 원본 메시지 ID

        // CASE 1: 특정 메시지에 '답장'을 한 경우 -> 답장 대상 요청을 완료 처리
        if (quotedMessageId) {
          try {
            const response = await fetch(`${firebaseUrl}.json`);
            const data = await response.json();

            if (data) {
              // messageId가 답장 대상 ID와 일치하는 데이터 키(Key) 검색
              const targetKey = Object.keys(data).find(
                key => data[key].messageId === quotedMessageId
              );

              if (targetKey) {
                // 해당 요청의 상태를 completed로 변경
                await fetch(`${firebaseUrl}/${targetKey}.json`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    status: 'completed',
                    completedAt: Date.now(),
                    replyMessage: userMessage // 답장으로 남긴 메모도 같이 기록
                  })
                });
                console.log(`답장 대상 수리요청 완료 처리 완료: ${targetKey}`);
              }
            }
          } catch (error) {
            console.error('답장 완료 처리 중 오류 발생:', error);
          }
        } 
        // CASE 2: 신규 수리 요청 메시지인 경우 -> DB에 저장
        else {
          try {
            await fetch(`${firebaseUrl}.json`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messageId: messageId, // 답장 추적을 위해 LINE 메시지 ID 함께 저장
                text: userMessage,
                timestamp: Date.now(),
                status: 'pending'
              })
            });
          } catch (error) {
            console.error('Firebase 저장 실패:', error);
          }
        }
      }
    }
    return res.status(200).json({ message: 'OK' });
  }

  res.status(200).send('LINE Webhook Server is Running!');
}
