// content.js
// This script runs on all youtube.com pages as defined in manifest.json

function isContextValid() {
  return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
}

function init() {
  if (!isContextValid()) return;

  chrome.storage.local.get(['ytPlaylist', 'ytCurrentIndex'], (result) => {
    if (!isContextValid()) return;
    
    const playlist = result.ytPlaylist;
    const currentIndex = result.ytCurrentIndex;

    // Check if we have an active playlist
    if (!playlist || playlist.length === 0 || currentIndex === undefined) {
      return;
    }

    // Check if we are on a playback page (Watch or Shorts)
    const isWatch = window.location.href.includes('/watch');
    const isShorts = window.location.href.includes('/shorts/');
    
    if (!isWatch && !isShorts) {
      return;
    }

    setupPlayback(playlist, currentIndex, isShorts);
  });
}

function getVideoElement() {
  // Shorts-specific active video element
  const shortsVideo = document.querySelector('ytd-reel-video-renderer[is-active] video.video-stream');
  if (shortsVideo) return shortsVideo;
  
  // Regular YouTube video element
  return document.querySelector('video.html5-main-video');
}

function setupPlayback(playlist, currentIndex, isShorts) {
  // It takes a moment for the YouTube video player to load
  let attempts = 0;
  const checkInterval = setInterval(() => {
    attempts++;
    const video = getVideoElement();
    
    if (video) {
      clearInterval(checkInterval);
      
      console.log('YouTube Play All: Attached to video player');
      
      // Auto-play might be blocked by browser policies, let's try to ensure it plays
      if (video.paused) {
        video.play().catch(e => console.log('Auto-play blocked, user interaction required.', e));
      }

      // Ensure we don't attach multiple listeners
      if (!video.hasAttribute('data-yt-play-all-attached')) {
        // Remove previous listener if exists
        video.removeEventListener('ended', onVideoEnded);
        
        // Add the ended event listener
        video.addEventListener('ended', onVideoEnded);
        video.setAttribute('data-yt-play-all-attached', 'true');
        
        // Safety: If it's a Short, it might loop instead of firing 'ended'
        if (isShorts) {
          const checkShortsEnd = () => {
             // Close to end (within 0.5s or 1% of duration)
             if (video.duration > 0 && video.currentTime >= video.duration - 0.5) {
                video.removeEventListener('timeupdate', checkShortsEnd);
                if (!video.hasAttribute('data-yt-play-all-completed')) {
                   console.log('YouTube Play All: Short reached end, moving to next...');
                   onVideoEnded();
                }
             }
          };
          video.addEventListener('timeupdate', checkShortsEnd);
        }
        
        // Fallback: If video doesn't trigger 'ended' event after timeout, manually trigger next
        const duration = video.duration;
        const videoDuration = isFinite(duration) && duration > 0 ? duration : 60; // Default 60 seconds if duration unknown
        
        setTimeout(() => {
          if (!isContextValid()) return;
          if (!video.hasAttribute('data-yt-play-all-completed')) {
            console.log('YouTube Play All: Video timeout reached, moving to next...');
            video.setAttribute('data-yt-play-all-completed', 'true');
            onVideoEnded();
          }
        }, (videoDuration + 5) * 1000); // Add 5 second buffer
      }
    } else if (attempts > 30) {
      // Stop after 30 seconds of searching
      clearInterval(checkInterval);
      console.log('YouTube Play All: Could not find video element after 30 attempts.');
    }
  }, 1000);
}

function onVideoEnded() {
  if (!isContextValid()) return;

  // Mark current video as completed to prevent double-triggering
  const video = getVideoElement();
  if (video) {
    video.setAttribute('data-yt-play-all-completed', 'true');
  }

  chrome.storage.local.get(['ytPlaylist', 'ytCurrentIndex'], (result) => {
    if (!isContextValid()) return;
    
    const playlist = result.ytPlaylist;
    let currentIndex = result.ytCurrentIndex;

    if (!playlist) return;

    currentIndex++;

    if (currentIndex < playlist.length) {
      // Save new index and navigate to next video
      chrome.storage.local.set({ ytCurrentIndex: currentIndex }, () => {
        if (!isContextValid()) return;
        console.log(`YouTube Play All: Playing next video (${currentIndex + 1} of ${playlist.length})`);
        window.location.href = playlist[currentIndex].url;
      });
    } else {
      console.log('YouTube Play All: Playlist finished.');
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

// YouTube SPA navigation events
document.addEventListener('yt-navigate-finish', () => {
  init();
});

