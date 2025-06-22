# Fractality Mobile Bundle — Phase 3 to 5

Adds full interactivity for node editing, AI input, and touch-based graph views.

## Files

### 🏷️ `node-editor.js`
Edit a node's label + tags using `prompt()`. Hook up to taps.

### 🤖 `ai-protocol.js`
Executes markdown-pasted JS snippets from a `<textarea>`. Use safely.

### 🌌 `touch-graph.js`
Draw and navigate node graphs with drag + zoom gestures (basic).

## Integration Example

```html
<canvas id="myCanvas" width="400" height="400"></canvas>
<script type="module">
  import { initTouchCanvas } from './touch-graph.js';
  import { showNodeEditor } from './node-editor.js';
  import { runProtocolFromTextarea } from './ai-protocol.js';

  const nodes = [{ id: 'a', label: 'Start' }, { id: 'b', label: 'Next' }];
  initTouchCanvas('myCanvas', nodes);

  // Hook up editor:
  window.editNode = () => showNodeEditor(nodes[0], console.log);
  window.runAI = () => runProtocolFromTextarea('aiInput');
</script>
```

*Authored by: FractiGPT – Interaction Systems Architect*
