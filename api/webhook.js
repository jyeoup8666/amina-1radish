export default async function handler(req, res) {
  if (req.method === 'POST') {
    const events = req.body.events || [];

    for (let event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userMessage = event.message.text;
        const userId = event.source.userId;

        console.log(`수신 메시지: ${userMessage} (보낸 사람: ${userId})`);

        // Firebase Realtime Database 저장 로직 추가
        const firebaseUrl = 'https://facility-check-74a17-default-rtdb.firebaseio.com/facility_requests.json';
        
        try {
          await fetch(firebaseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: userMessage,
              userId: userId,
              timestamp: Date.now()
            })
          });
        } catch (error) {
          console.error('Firebase 저장 실패:', error);
        }
      }
    }
    return res.status(200).json({ message: 'OK' });
  }

  res.status(200).send('LINE Webhook Server is Running!');
}
