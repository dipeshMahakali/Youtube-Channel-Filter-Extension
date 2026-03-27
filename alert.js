// alert.js
document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('close-btn');
  closeBtn.addEventListener('click', () => {
    window.close();
  });

  // Optional: Auto-focus the window when it opens
  window.focus();
});
