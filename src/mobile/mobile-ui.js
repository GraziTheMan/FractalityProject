document.getElementById('toggleDrawer').addEventListener('click', () => {
  const drawer = document.getElementById('drawer');
  drawer.classList.toggle('open');
});

document.getElementById('submitAiInput').addEventListener('click', () => {
  const text = document.getElementById('aiInput').value.trim();
  if (!text) return;
  console.log('[Fractality Mobile] AI Input:', text);
  alert('AI input received:\n' + text);
});
