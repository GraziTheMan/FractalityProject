
export function setupMirrorToggle(radialMenuInstance) {
  const toggleBtn = document.getElementById('mirror-toggle');
  toggleBtn.addEventListener('click', () => {
    const isLeft = toggleBtn.classList.toggle('active');
    document.body.classList.toggle('left-handed', isLeft);
    radialMenuInstance.setHandedness(isLeft);
  });
}
