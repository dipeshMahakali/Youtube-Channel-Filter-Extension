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
    try {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: gatherVideos
      }, (results) => {
        if (chrome.runtime.lastError) {
          setStatus('Error interacting with page: ' + chrome.runtime.lastError.message, 'error');
          console.error(chrome.runtime.lastError);
          return;
        }
        
        if (!results || !results[0]) {
          setStatus('Could not interact with the page.', 'error');
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
    } catch (err) {
      setStatus('Failed to gather videos.', 'error');
      console.error(err);
    }
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

  function isScheduled(rendererEl) {
    if (!rendererEl) return false;
    
    // 1. Check innerText for keywords anywhere in the renderer (most robust)
    const allText = rendererEl.innerText.toLowerCase();
    if (
      allText.includes('upcoming') || 
      allText.includes('premieres') || 
      allText.includes('scheduled') ||
      allText.includes('waiting')
    ) return true;

    // 2. Reliable overlay badges and specific modern elements
    if (rendererEl.querySelector('ytd-thumbnail-overlay-time-status-renderer[overlay-style="UPCOMING"]')) return true;
    if (rendererEl.querySelector('badge-shape')) {
      const badgeText = rendererEl.querySelector('badge-shape').textContent.toLowerCase();
      if (badgeText.includes('upcoming') || badgeText.includes('premieres')) return true;
    }
    
    // 3. Fallback: Specific badges/spans
    const textSelectors = [
      '.ytd-badge-supported-renderer',
      'ytd-badge-supported-renderer',
      '#metadata-line span',
      '.ytd-video-meta-block span',
      '#badges span',
      '#status-block span'
    ];
    
    for (const selector of textSelectors) {
      const elements = rendererEl.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.textContent.trim().toLowerCase();
        if (text.includes('scheduled') || text.includes('premieres') || text.includes('upcoming')) return true;
      }
    }
    
    return false;
  }

  function isWatched(rendererEl) {
    if (!rendererEl) return false;
    const progressOverlay = rendererEl.querySelector('ytd-thumbnail-overlay-resume-playback-renderer');
    if (progressOverlay) {
      const progressDiv = progressOverlay.querySelector('div#progress');
      if (progressDiv && progressDiv.style.width && parseFloat(progressDiv.style.width) > 0) return true;
    }
    const progressEl = rendererEl.querySelector('div#progress');
    if (progressEl && progressEl.style.width && parseFloat(progressEl.style.width) > 0) return true;
    return false;
  }

  function cleanTitle(title) {
    if (!title) return '';
    // 1. Remove duration patterns like "12:34" or "1:02:30"
    let cleaned = title.replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, '');
    // 2. Remove duration text like "9 minutes, 58 seconds" or "1 hour"
    cleaned = cleaned.replace(/\d+\s*(minutes|seconds|hour|hours|min|sec)[^,.]*/gi, '');
    // 3. Remove metadata suffixes common in aria-labels
    cleaned = cleaned.replace(/by\s+.*$/i, ''); // Remove "by ChannelName"
    cleaned = cleaned.replace(/\d+\s+views.*$/i, ''); // Remove views and upload date
    
    return cleaned.trim() || title.trim();
  }

  const RENDERER_SELECTOR = [
    'ytd-rich-item-renderer', 'ytd-grid-video-renderer', 'ytd-video-renderer',
    'ytd-rich-grid-media', 'ytd-compact-video-renderer', 'ytd-reel-item-renderer',
    'ytd-playlist-video-renderer'
  ].join(', ');

  const renderers = document.querySelectorAll(RENDERER_SELECTOR);
  
  renderers.forEach(renderer => {
    if (isScheduled(renderer)) return;

    const titleAnchor = renderer.querySelector('#video-title, #video-title-link, a.ytd-video-renderer#video-title');
    const anyAnchor = renderer.querySelector('a[href*="/watch"], a[href*="/shorts/"]');
    const anchor = titleAnchor || anyAnchor;

    if (!anchor || !anchor.href) return;

    let url = anchor.href;
    let cleanUrl = '';

    if (url.includes('/watch')) {
      const urlObj = new URL(url, window.location.origin);
      const videoId = urlObj.searchParams.get('v');
      if (videoId) cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
    } else if (url.includes('/shorts/')) {
      const parts = url.split('/shorts/');
      if (parts[1]) {
        const shortId = parts[1].split('?')[0].split('/')[0];
        cleanUrl = `https://www.youtube.com/shorts/${shortId}`;
      }
    }

    if (!cleanUrl || seenUrls.has(cleanUrl)) return;
    seenUrls.add(cleanUrl);

    // Prefer specific title attributes and inner content
    let title = '';
    if (titleAnchor) {
      // innerText of yt-formatted-string is usually the cleanest
      const formattedTitle = titleAnchor.querySelector('yt-formatted-string');
      title = (formattedTitle ? formattedTitle.innerText : '') || titleAnchor.title || titleAnchor.innerText;
    }
    if (!title && anyAnchor) {
      title = anyAnchor.title || anyAnchor.innerText;
    }

    videos.push({
      url: cleanUrl,
      title: cleanTitle(title) || 'Untitled Video',
      watched: isWatched(renderer)
    });
  });

  const unwatched = videos.filter(v => !v.watched);
  const watchedList = videos.filter(v => v.watched);
  const result = unwatched.length > 0 ? unwatched : watchedList;

  console.log(`YouTube Play All: Gathered ${videos.length} items. Using ${result.length}.`);
  return result;
}

