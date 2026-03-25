// content.js
// This script runs on all youtube.com pages as defined in manifest.json

/**
 * Checks if the extension context is still valid.
 * This is crucial to prevent "Extension context invalidated" errors after reloads.
 */
function isContextValid() {
  return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
}

/**
 * Safe wrapper for chrome.storage.local.get
 */
function safeGetStorage(keys, callback) {
  if (!isContextValid()) return;
  chrome.storage.local.get(keys, (result) => {
    if (!isContextValid()) return;
    callback(result);
  });
}

function init() {
  console.log('YouTube Play All: Initializing...');
  safeGetStorage(['ytPlaylist', 'ytCurrentIndex'], (result) => {
    const playlist = result.ytPlaylist;
    const currentIndex = result.ytCurrentIndex;

    if (!playlist || playlist.length === 0 || currentIndex === undefined) {
      console.log('YouTube Play All: No active playlist found.');
      return;
    }

    const isWatch = window.location.href.includes('/watch');
    const isShorts = window.location.href.includes('/shorts/');
    
    if (!isWatch && !isShorts) {
      console.log('YouTube Play All: Not on a playback page.');
      return;
    }

    setupPlayback(playlist, currentIndex, isShorts);
  });
}

function getVideoElement() {
  const shortsVideo = document.querySelector('ytd-reel-video-renderer[is-active] video.video-stream');
  if (shortsVideo) return shortsVideo;
  return document.querySelector('video.html5-main-video');
}

let checkInterval = null;

function setupPlayback(playlist, currentIndex, isShorts) {
  // Clear any existing interval to prevent multiple monitors
  if (checkInterval) clearInterval(checkInterval);
  
  let attempts = 0;
  checkInterval = setInterval(() => {
    // CRITICAL: Check context validity at the very start of the interval
    if (!isContextValid()) {
      clearInterval(checkInterval);
      return;
    }

    attempts++;
    const video = getVideoElement();
    
    if (video) {
      clearInterval(checkInterval);
      console.log('YouTube Play All: Attached to video player');
      
      if (video.paused) {
        video.play().catch(e => console.log('YouTube Play All: Auto-play blocked.', e));
      }

      // We always re-initialize listeners on navigation to handle SPA element reuse
      // First, remove old listeners to avoid duplicates
      video.removeEventListener('ended', onVideoEnded);
      video.removeEventListener('timeupdate', checkShortsEnd);
      
      // Reset completion attribute for the new video
      video.removeAttribute('data-yt-play-all-completed');
      
      // Add the ended event listener
      video.addEventListener('ended', onVideoEnded);
      video.setAttribute('data-yt-play-all-attached', 'true');
      
      if (isShorts) {
        video.addEventListener('timeupdate', checkShortsEnd);
      }
      
      // Fallback timeout
      const duration = video.duration;
      const videoDuration = isFinite(duration) && duration > 0 ? duration : 60;
      
      setTimeout(() => {
        if (!isContextValid()) return;
        if (!video.hasAttribute('data-yt-play-all-completed')) {
          console.log('YouTube Play All: Fallback timeout reached.');
          onVideoEnded();
        }
      }, (videoDuration + 8) * 1000); // 8 second buffer for stability
    } else if (attempts > 30) {
      clearInterval(checkInterval);
      console.log('YouTube Play All: Video player not found.');
    }
  }, 1000);
}

function checkShortsEnd(event) {
  const video = event.target;
  if (video.duration > 0 && video.currentTime >= video.duration - 0.5) {
    if (!video.hasAttribute('data-yt-play-all-completed')) {
      video.removeEventListener('timeupdate', checkShortsEnd);
      console.log('YouTube Play All: Short reached end.');
      onVideoEnded();
    }
  }
}

function onVideoEnded() {
  if (!isContextValid()) return;

  const video = getVideoElement();
  if (video) {
    if (video.hasAttribute('data-yt-play-all-completed')) return; // Already triggered
    video.setAttribute('data-yt-play-all-completed', 'true');
  }

  safeGetStorage(['ytPlaylist', 'ytCurrentIndex'], (result) => {
    const playlist = result.ytPlaylist;
    let currentIndex = result.ytCurrentIndex;

    if (!playlist) return;

    currentIndex++;

    if (currentIndex < playlist.length) {
      chrome.storage.local.set({ ytCurrentIndex: currentIndex }, () => {
        if (!isContextValid()) return;
        console.log(`YouTube Play All: Moving to ${currentIndex + 1}/${playlist.length}`);
        window.location.href = playlist[currentIndex].url;
      });
    } else {
      console.log('YouTube Play All: Playlist complete.');
      chrome.storage.local.remove(['ytPlaylist', 'ytCurrentIndex']);
    }
  });
}

// Initial run
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Listen for YouTube's SPA navigation events
document.addEventListener('yt-navigate-finish', () => {
  if (isContextValid()) init();
});


