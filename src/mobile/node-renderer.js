// 🧠 Basic Node Renderer
export function renderNodes(canvasId, nodes) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  nodes.forEach((node, i) => {
    const x = 50 + (i * 80);
    const y = canvas.height / 2;
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 200, 255, 0.8)';
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.fillText(node.label || node.id || 'Node', x - 20, y + 5);
  });
}
