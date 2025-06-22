// 🤖 AI Protocol Executor (very basic sandbox)
export function runProtocolFromTextarea(textareaId) {
  const text = document.getElementById(textareaId).value;
  if (!text) return alert('Paste some JS/Markdown first.');

  try {
    if (text.startsWith('```js')) {
      const code = text.replace(/```js|```/g, '').trim();
      const fn = new Function(code);
      fn();
    } else {
      alert('Non-code content received:\n' + text);
    }
  } catch (e) {
    console.error('Execution failed:', e);
    alert('Error: ' + e.message);
  }
}
