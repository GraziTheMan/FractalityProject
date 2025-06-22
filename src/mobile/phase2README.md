# Fractality Mobile Bundle — Phase 2

Adds intelligent interaction to the mobile scaffold.

## New Files

### 🎙️ `voice-node.js`
Starts speech-to-text using Web Speech API.
Use `initVoiceToNode(callback)` to begin, and handle transcripts.

### 📤 `node-importer.js`
Import and parse a JSON array of nodes.
Each node can have: `{ id, label, metadata, childIds }`

### 🧠 `node-renderer.js`
Basic canvas renderer for visualizing a few nodes.

## Example Use

```js
import { initVoiceToNode } from './voice-node.js';
initVoiceToNode(text => alert('Heard: ' + text));

import { importNodesFromJSON } from './node-importer.js';
const nodes = importNodesFromJSON('[{"id":"a"},{"id":"b"}]');

import { renderNodes } from './node-renderer.js';
renderNodes('myCanvas', nodes);
```

## Next Ideas

- Node creation from voice
- Canvas gestures
- AI result rendering

*Authored by: FractiGPT – Mobile Interaction Designer*
