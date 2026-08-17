// src/mobile/chat-ui.js
// Chat view for the mobile module switcher.
//
// This file previously imported `initChatUI` from itself — the snippet was
// pasted here as well as into mobile-ui.js, so the import resolved to the same
// module and the name was never defined anywhere. initChatUI actually lives in
// chat-client.js.

import { initChatUI } from './chat-client.js';

/**
 * Render the chat view into the mobile module container.
 * @param {HTMLElement} [container] reserved for parity with the other
 *   render* functions in mobile-ui.js; initChatUI resolves the element itself.
 */
export function renderChatView(container) {
  initChatUI('moduleContainer');
}

export { initChatUI };
