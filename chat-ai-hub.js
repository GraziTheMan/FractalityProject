import { chatSocket } from './chat-client.js';

export async function initAIBot(openaiKey) {
  chatSocket.on('message', async ({ text, sender }) => {
    if (sender === 'AI') return;
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type':'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a helpful bot editing nodes via chat.' },
          { role: 'user', content: text }
        ]
      })
    });
    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content;
    if (reply) chatSocket.emit('message', { text: reply, sender: 'AI', timestamp: Date.now() });
  });
}
