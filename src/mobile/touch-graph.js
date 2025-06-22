// 🌌 Interactive Graph Touch UI
export function initTouchCanvas(canvasId, nodes) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');

  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;
  let dragStart = null;

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    nodes.forEach(node => {
      const x = node.x || 100 + Math.random() * 200;
      const y = node.y || 100 + Math.random() * 300;
      node._x = x;
      node._y = y;
      ctx.beginPath();
      ctx.arc(x, y, 25, 0, Math.PI * 2);
      ctx.fillStyle = 'deepskyblue';
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.fillText(node.label || node.id, x - 20, y + 4);
    });

    ctx.restore();
  }

  function onDown(e) {
    dragging = true;
    dragStart = [e.touches?.[0]?.clientX || e.clientX, e.touches?.[0]?.clientY || e.clientY];
  }

  function onMove(e) {
    if (!dragging) return;
    const x = e.touches?.[0]?.clientX || e.clientX;
    const y = e.touches?.[0]?.clientY || e.clientY;
    offsetX += x - dragStart[0];
    offsetY += y - dragStart[1];
    dragStart = [x, y];
    render();
  }

  function onUp() {
    dragging = false;
  }

  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseup', onUp);
  canvas.addEventListener('touchstart', onDown);
  canvas.addEventListener('touchmove', onMove);
  canvas.addEventListener('touchend', onUp);

  // Initial render
  render();
}
