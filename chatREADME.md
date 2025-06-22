# Phase 6 – Chat + AI Integration Bundle

## Modules

### chat-client.js
Connects to a Socket.IO server and emits/receives chat messages. Uses `window.dispatchEvent` for decoupled UI logic.

### chat-ui.js
Simple mobile-friendly chat interface with input and message display. Hooks into `chat-client.js`.

### chat-ai-hub.js
Listens to all chat messages. If not from 'AI', sends them to OpenAI and emits the response back into chat.

### graph-chat-sync.js
Parses chat commands like `/update node root label="New Title"` and updates the node using the editor.

## Integration

In your `mobile.html`, add:

```html
<script type="module">
  import './chat-client.js';
  import { initChatUI } from './chat-ui.js';
  import { initAIBot } from './chat-ai-hub.js';
  import './graph-chat-sync.js';

  initChatUI('chatContainer');
  initAIBot('YOUR_OPENAI_API_KEY');
</script>
```

Replace `YOUR_CHAT_SERVER_URL` with your Socket.IO backend.
