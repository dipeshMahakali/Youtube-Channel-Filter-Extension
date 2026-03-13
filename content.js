// content.js
// This script runs on all youtube.com pages as defined in manifest.json

function init() {
  chrome.storage.local.get(['ytPlaylist', 'ytCurrentIndex'], (result) => {
    const playlist = result.ytPlaylist;
    const currentIndex = result.ytCurrentIndex;

    // Check if we have an active playlist
    if (!playlist || playlist.length === 0 || currentIndex === undefined) {
      return;
    }

    // Check if we are on a watch page
    if (!window.location.href.includes('/watch')) {
      return;
    }

    setupPlayback(playlist, currentIndex);
  });
}

function setupPlayback(playlist, currentIndex) {
  // It takes a moment for the YouTube video player to load
  const checkInterval = setInterval(() => {
    const video = document.querySelector('video.html5-main-video');
    if (video) {
      clearInterval(checkInterval);
      
      console.log('YouTube Play All: Attached to video player');
      
      // Auto-play might be blocked by browser policies, let's try to ensure it plays
      if (video.paused) {
        video.play().catch(e => console.log('Auto-play blocked, user interaction required.', e));
      }

      // Ensure we don't attach multiple listeners
      if (!video.hasAttribute('data-yt-play-all-attached')) {
        video.addEventListener('ended', onVideoEnded);
        video.setAttribute('data-yt-play-all-attached', 'true');
      }
    }
  }, 1000);
}

function onVideoEnded() {
  chrome.storage.local.get(['ytPlaylist', 'ytCurrentIndex'], (result) => {
    const playlist = result.ytPlaylist;
    let currentIndex = result.ytCurrentIndex;

    if (!playlist) return;

    currentIndex++;

    if (currentIndex < playlist.length) {
      // Save new index and navigate to next video
      chrome.storage.local.set({ ytCurrentIndex: currentIndex }, () => {
        console.log(`YouTube Play All: Playing next video (${currentIndex + 1} of ${playlist.length})`);
        window.location.href = playlist[currentIndex].url;
      });
    } else {
      console.log('YouTube Play All: Playlist finished.');
      // Keep state or clear it upon finish? Let's clear it since we are done.
      chrome.storage.local.remove(['ytPlaylist', 'ytCurrentIndex']);
    }
  });
}

// Run init on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// YouTube uses a Single Page Application (SPA) architecture (yt-navigate-finish)
// We need to listen to navigation events to re-initialize if the URL changes without a full page reload.
document.addEventListener('yt-navigate-finish', () => {
  init();
});
