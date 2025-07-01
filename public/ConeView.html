<!-- Cone of Complexity: Mini HUD Prototype --><!DOCTYPE html><html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cone of Complexity (Mini HUD)</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: #0d0d0d;
      font-family: sans-serif;
    }#cone-container {
  position: fixed;
  bottom: 1rem;
  left: 1rem;
  width: 200px;
  height: 300px;
  background: rgba(20, 20, 20, 0.85);
  border: 1px solid #444;
  border-radius: 12px;
  overflow: hidden;
  z-index: 1000;
}

canvas {
  display: block;
}

.node-label {
  position: absolute;
  padding: 2px 6px;
  background: #222;
  color: #eee;
  font-size: 12px;
  border-radius: 4px;
  white-space: nowrap;
}

  </style>
</head>
<body>
  <div id="cone-container">
    <canvas id="coneCanvas"></canvas>
  </div>  <script>
    const canvas = document.getElementById('coneCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    const coneHeight = canvas.height;
    const maxWidth = canvas.width * 0.9;
    const centerX = canvas.width / 2;
    const nodeLevels = 6; // levels in the cone

    const nodesPerLevel = [1, 2, 3, 5, 8, 13];

    function drawCone() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let level = 0; level < nodeLevels; level++) {
        const y = (coneHeight / nodeLevels) * level + 30;
        const nodes = nodesPerLevel[level];
        const radius = (maxWidth / 2) * (level + 1) / nodeLevels;

        for (let i = 0; i < nodes; i++) {
          const angle = (Math.PI * 2 / nodes) * i;
          const x = centerX + radius * Math.cos(angle);
          const nodeText = `Node ${level}.${i}`;

          // draw node label
          ctx.fillStyle = '#eee';
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, 2 * Math.PI);
          ctx.fill();

          ctx.font = '11px sans-serif';
          ctx.fillStyle = '#ccc';
          ctx.fillText(nodeText, x + 6, y - 6);
        }
      }
    }

    drawCone();
  </script></body>
</html>