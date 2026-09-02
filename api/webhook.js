export default async function handler(req, res) {
  if (req.method === 'POST') {
    const events = req.body.events || [];
    const firebaseUrl = 'https://facility-check-74a17-default-rtdb.firebaseio.com/facility_requests';

    for (let event of events) {

      // ─────────────────────────────────────────────
      // CASE 0 (신규): 메시지를 보내기 취소(unsend)한 경우 -> 해당 요청을 DB에서 삭제
      // 답장 매칭(quotedMessageId)과 똑같은 방식으로, 저장해둔 messageId로 원본 항목을 찾습니다.
      // ─────────────────────────────────────────────
      if (event.type === 'unsend') {
        const unsentMessageId = event.unsend.messageId;
        try {
          const response = await fetch(`${firebaseUrl}.json`);
          const data = await response.json();
          if (data) {
            const targetKey = Object.keys(data).find(
              key => data[key].messageId === unsentMessageId
            );
            if (targetKey) {
              await fetch(`${firebaseUrl}/${targetKey}.json`, {
                method: 'DELETE'
              });
              console.log(`취소된 메시지 삭제 완료: ${targetKey}`);
            }
          }
        } catch (error) {
          console.error('취소 메시지 삭제 중 오류 발생:', error);
        }
        continue; // unsend 이벤트는 아래 message 처리와 무관하므로 다음 이벤트로
      }

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
                messageId: messageId, // 답장 추적 및 취소 감지를 위해 LINE 메시지 ID 함께 저장
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
