document.addEventListener('DOMContentLoaded', () => {
  const btnGather = document.getElementById('btn-gather');
  const btnClear = document.getElementById('btn-clear');
  const statusEl = document.getElementById('status');
  const playlistInfo = document.getElementById('playlist-info');
  const videoCountEl = document.getElementById('video-count');
  const videoListEl = document.getElementById('video-list');

  // Load state on open
  chrome.storage.local.get(['ytPlaylist', 'ytCurrentIndex'], (result) => {
    if (result.ytPlaylist && result.ytPlaylist.length > 0) {
      showPlaylist(result.ytPlaylist, result.ytCurrentIndex || 0);
      btnGather.style.display = 'none';
      btnClear.style.display = 'block';
    } else {
      btnGather.style.display = 'block';
      btnClear.style.display = 'none';
      playlistInfo.classList.add('hidden');
    }
  });

  function setStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = 'status ' + type;
  }

  function showPlaylist(playlist, currentIndex) {
    videoCountEl.textContent = playlist.length;
    videoListEl.innerHTML = '';
    playlist.forEach((video, index) => {
      const div = document.createElement('div');
      div.className = 'video-item';
      if (index === currentIndex) div.classList.add('active');
      div.textContent = `${index + 1}. ${video.title}`;
      videoListEl.appendChild(div);
    });
    playlistInfo.classList.remove('hidden');
    setStatus(`Playing: ${currentIndex + 1} of ${playlist.length}`, 'success');
  }

  btnGather.addEventListener('click', async () => {
    setStatus('Gathering videos...', 'info');
    
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('youtube.com')) {
      setStatus('Please navigate to a YouTube page.', 'error');
      return;
    }

    // Execute script to gather videos on the tab
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: gatherVideos
    }, (results) => {
      if (chrome.runtime.lastError) {
        setStatus('Error interacting with page. Try reloading.', 'error');
        console.error(chrome.runtime.lastError);
        return;
      }
      
      const payload = results[0].result;
      if (!payload || payload.length === 0) {
        setStatus('No videos found. Be sure you are on a Videos tab and scroll down to load more.', 'error');
        return;
      }

      // Save to storage
      chrome.storage.local.set({
        ytPlaylist: payload,
        ytCurrentIndex: 0
      }, () => {
        showPlaylist(payload, 0);
        btnGather.style.display = 'none';
        btnClear.style.display = 'block';
        
        // Navigate to the first video
        setStatus('Starting playback...', 'success');
        chrome.tabs.update(tab.id, { url: payload[0].url });
      });
    });
  });

  btnClear.addEventListener('click', () => {
    chrome.storage.local.remove(['ytPlaylist', 'ytCurrentIndex'], () => {
      setStatus('Playlist cleared.', 'info');
      btnGather.style.display = 'block';
      btnClear.style.display = 'none';
      playlistInfo.classList.add('hidden');
    });
  });
});

// This function runs in the context of the YouTube page
function gatherVideos() {
  const videos = [];
  const seenUrls = new Set();

  // 1. Gather regular videos
  const videoSelectors = 'a#video-title-link, a.yt-simple-endpoint.ytd-grid-video-renderer, a.yt-simple-endpoint[href*="/watch"]';
  document.querySelectorAll(videoSelectors).forEach(el => {
    const url = el.href;
    const title = el.textContent.trim();
    if (url && url.includes('/watch') && title && !seenUrls.has(url)) {
      seenUrls.add(url);
      videos.push({ url, title });
    }
  });

  // 2. Gather YouTube Shorts - they're in different containers
  // Look for all anchor tags that contain /shorts/ in href
  document.querySelectorAll('a[href*="/shorts/"]').forEach(el => {
    const url = el.href;
    // Extract clean shorts URL (sometimes it has extra params)
    const cleanUrl = url.split('?')[0];
    let title = el.textContent.trim();
    
    // If no direct text, try to find it from parent elements
    if (!title) {
      const parent = el.closest('ytd-rich-item-renderer, ytd-video-renderer, [role="listitem"]');
      if (parent) {
        const titleEl = parent.querySelector('[role="link"]');
        title = titleEl ? titleEl.textContent.trim() : 'Untitled Short';
      } else {
        title = 'Untitled Short';
      }
    }
    
    if (cleanUrl && cleanUrl.includes('/shorts/') && !seenUrls.has(cleanUrl)) {
      seenUrls.add(cleanUrl);
      videos.push({ url: cleanUrl, title });
    }
  });

  // 3. Additional fallback: check for shorts in rich item renderers
  document.querySelectorAll('ytd-rich-item-renderer').forEach(item => {
    const link = item.querySelector('a[href*="/shorts/"]');
    if (link) {
      const url = link.href.split('?')[0];
      let title = link.textContent.trim();
      if (!title) {
        const titleEl = item.querySelector('span[aria-label*="video"]') || item.querySelector('[aria-label]');
        title = titleEl ? titleEl.getAttribute('aria-label') || titleEl.textContent.trim() : 'Untitled Short';
      }
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        videos.push({ url, title });
      }
    }
  });

  return videos;
}
