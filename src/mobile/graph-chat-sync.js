import { showNodeEditor } from './node-editor.js';
import { nodeGraph } from './init.js';

window.addEventListener('chat:message', e => {
  const { text } = e.detail;
  if (!text.startsWith('/update node ')) return;

  const [, , id, ...rest] = text.split(' ');
  const node = nodeGraph.nodes.get(id);
  if (!node) return;

  const args = rest.join(' ');
  const matches = /label="([^"]+)"/.exec(args);
  if (matches) node.label = matches[1];

  showNodeEditor(node, updated => {
    console.log('Node updated:', updated);
  });
});
