export default async function handler(req, res) {
  if (req.method === 'POST') {
    const events = req.body.events || [];
    
    for (let event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userMessage = event.message.text;
        const userId = event.source.userId;
        
        console.log(`[라인 수신] 메시지: ${userMessage} / 사용자 ID: ${userId}`);
      }
    }
    return res.status(200).json({ status: 'success' });
  }
  
  res.status(200).send('LINE Webhook Server is running!');
}
