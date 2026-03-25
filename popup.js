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

  function addVideo(url, title) {
    if (!url || seenUrls.has(url)) return;
    
    // Clean URL
    let cleanUrl = url;
    if (url.includes('/watch')) {
      const urlObj = new URL(url);
      const videoId = urlObj.searchParams.get('v');
      if (videoId) cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
    } else if (url.includes('/shorts/')) {
      cleanUrl = url.split('?')[0];
    }

    if (seenUrls.has(cleanUrl)) return;
    seenUrls.add(cleanUrl);
    videos.push({ url: cleanUrl, title: title || 'Untitled Video' });
  }

  // 1. Gather regular videos with diverse selectors
  const selectors = [
    'a#video-title-link',
    'a.yt-simple-endpoint.ytd-grid-video-renderer',
    'a.yt-simple-endpoint[href*="/watch"]',
    'ytd-grid-video-renderer a#video-title',
    'ytd-rich-grid-media a#video-title-link',
    'ytd-video-renderer a#video-title'
  ];

  document.querySelectorAll(selectors.join(', ')).forEach(el => {
    addVideo(el.href, el.textContent.trim());
  });

  // 2. Gather YouTube Shorts
  const shortsSelectors = [
    'a[href*="/shorts/"]',
    'ytd-reel-item-renderer a',
    'ytd-rich-item-renderer a[href*="/shorts/"]'
  ];

  document.querySelectorAll(shortsSelectors.join(', ')).forEach(el => {
    if (el.href && el.href.includes('/shorts/')) {
      let title = el.textContent.trim();
      if (!title) {
        const parent = el.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-reel-item-renderer');
        const titleEl = parent ? parent.querySelector('#video-title, [role="link"], h3') : null;
        title = titleEl ? titleEl.textContent.trim() : 'Untitled Short';
      }
      addVideo(el.href, title);
    }
  });

  console.log(`YouTube Play All: Gathered ${videos.length} items.`);
  return videos;
}

