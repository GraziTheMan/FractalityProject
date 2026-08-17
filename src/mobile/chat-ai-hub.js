// src/mobile/chat-ai-hub.js
//
// Bridges the chat room to an AI participant.
//
// The previous version took an `openaiKey` argument and called
// https://api.openai.com directly from the browser. That cannot be made safe:
// any key shipped to the client is readable in devtools by every visitor, and
// billable against your account. It also imported `chatSocket` from
// chat-client.js, which did not export it.
//
// This version talks to a server-side proxy instead. The proxy holds the real
// credential and is the only thing that ever sees it. Set VITE_AI_PROXY_URL to
// its base URL; without it, the AI participant stays disabled.

import { chatSocket } from './chat-client.js';
import { deployConfig } from '../config/deploy.js';

/**
 * Wire an AI participant into the chat room.
 *
 * @param {object} [options]
 * @param {string} [options.model] model hint passed to the proxy
 * @param {string} [options.systemPrompt] persona for the AI participant
 * @returns {boolean} whether the bot was enabled
 */
export function initAIBot(options = {}) {
  const proxyUrl = deployConfig.aiProxyUrl;

  if (!proxyUrl) {
    console.info(
      '🤖 AI bot disabled: set VITE_AI_PROXY_URL to a server-side proxy. ' +
      'Provider keys must never be given to the browser.'
    );
    return false;
  }

  const {
    model = 'default',
    systemPrompt = 'You are a helpful bot editing nodes via chat.'
  } = options;

  chatSocket.on('message', async ({ text, sender }) => {
    // Don't respond to our own messages
    if (sender === 'AI') return;
    if (!text) return;

    try {
      const response = await fetch(`${proxyUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send credentials via cookie/session rather than a header the client
        // would have to hold
        credentials: 'include',
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
          ]
        })
      });

      if (!response.ok) {
        console.warn('🤖 AI proxy error:', response.status, await response.text());
        return;
      }

      const data = await response.json();
      const reply = data.reply ?? data.choices?.[0]?.message?.content;

      if (reply) {
        chatSocket.emit('message', { text: reply, sender: 'AI', timestamp: Date.now() });
      }
    } catch (error) {
      console.warn('🤖 AI proxy unreachable:', error.message);
    }
  });

  return true;
}
