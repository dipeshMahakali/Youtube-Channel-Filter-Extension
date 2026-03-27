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
  const unwatched = [];
  const watched   = [];
  const seenUrls  = new Set();

  /**
   * Returns true when the renderer is a scheduled / upcoming video that has
   * not been published yet and therefore cannot be played.
   *
   * YouTube signals this in two reliable ways:
   *  1. An overlay badge with overlay-style="UPCOMING" on the thumbnail.
   *  2. A metadata-line span whose text starts with "Scheduled", "Premieres",
   *     or "Upcoming" (YouTube uses all three depending on locale / feature).
   */
  function isScheduled(rendererEl) {
    if (!rendererEl) return false;

    // Signal 1 – overlay badge (most reliable, locale-independent)
    if (rendererEl.querySelector(
      'ytd-thumbnail-overlay-time-status-renderer[overlay-style="UPCOMING"]'
    )) return true;

    // Signal 2 – metadata text (catches edge cases & localised strings)
    const metaSpans = rendererEl.querySelectorAll('#metadata-line span, .ytd-video-meta-block span');
    for (const span of metaSpans) {
      const text = span.textContent.trim().toLowerCase();
      if (
        text.startsWith('scheduled') ||
        text.startsWith('premieres') ||
        text.startsWith('upcoming')
      ) return true;
    }

    return false;
  }

  /**
   * Returns true when a video renderer element has a meaningful watch-progress
   * bar (YouTube's red #progress div inside a#thumbnail).
   * "Meaningful" means the element exists AND has a non-zero CSS width.
   */
  function isWatched(rendererEl) {
    if (!rendererEl) return false;

    // Walk into the thumbnail anchor, then look for the progress div
    const thumbnail = rendererEl.querySelector('a#thumbnail, ytd-thumbnail a#thumbnail');
    const progressEl = thumbnail
      ? thumbnail.querySelector('div#progress')
      : rendererEl.querySelector('div#progress');          // fallback

    if (!progressEl) return false;

    // YouTube sets width as an inline style, e.g. style="width: 73%;"
    const widthStyle = progressEl.style.width || '';
    const widthValue = parseFloat(widthStyle);             // NaN when empty / "0%"
    return !isNaN(widthValue) && widthValue > 0;
  }

  /**
   * Cleans a raw href and pushes it into the correct bucket.
   * Scheduled videos are silently skipped.
   * @param {string}       url      – raw href from the anchor element
   * @param {string}       title    – video title text
   * @param {Element|null} renderer – the nearest ytd-*-renderer ancestor (may be null)
   */
  function addVideo(url, title, renderer) {
    if (!url || seenUrls.has(url)) return;

    // Skip scheduled / upcoming videos — they cannot be played
    if (isScheduled(renderer)) {
      console.log(`YouTube Play All: Skipping scheduled video – "${title}"`);
      return;
    }

    // Normalise URL so duplicates are caught regardless of extra params
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

    const entry = { url: cleanUrl, title: title || 'Untitled Video' };

    if (isWatched(renderer)) {
      watched.push(entry);
    } else {
      unwatched.push(entry);
    }
  }

  // ── 1. Regular videos ──────────────────────────────────────────────────────
  const RENDERER_SELECTOR =
    'ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer, ' +
    'ytd-rich-grid-media, ytd-compact-video-renderer';

  const titleSelectors = [
    'a#video-title-link',
    'a.yt-simple-endpoint.ytd-grid-video-renderer',
    'a.yt-simple-endpoint[href*="/watch"]',
    'ytd-grid-video-renderer a#video-title',
    'ytd-rich-grid-media a#video-title-link',
    'ytd-video-renderer a#video-title'
  ];

  document.querySelectorAll(titleSelectors.join(', ')).forEach(el => {
    const renderer = el.closest(RENDERER_SELECTOR) || null;
    addVideo(el.href, el.textContent.trim(), renderer);
  });

  // ── 2. YouTube Shorts ──────────────────────────────────────────────────────
  const shortsSelectors = [
    'a[href*="/shorts/"]',
    'ytd-reel-item-renderer a',
    'ytd-rich-item-renderer a[href*="/shorts/"]'
  ];

  document.querySelectorAll(shortsSelectors.join(', ')).forEach(el => {
    if (!el.href || !el.href.includes('/shorts/')) return;

    let title = el.textContent.trim();
    if (!title) {
      const parent = el.closest(
        'ytd-rich-item-renderer, ytd-video-renderer, ytd-reel-item-renderer'
      );
      const titleEl = parent
        ? parent.querySelector('#video-title, [role="link"], h3')
        : null;
      title = titleEl ? titleEl.textContent.trim() : 'Untitled Short';
    }

    const renderer = el.closest(RENDERER_SELECTOR) || null;
    addVideo(el.href, title, renderer);
  });

  // ── 3. Build result ────────────────────────────────────────────────────────
  // Prefer unwatched videos. Only fall back to watched videos when there are
  // literally zero unwatched ones left on the page.
  const result = unwatched.length > 0 ? unwatched : watched;

  console.log(
    `YouTube Play All: Gathered ${result.length} items ` +
    `(${unwatched.length} unwatched, ${watched.length} watched). ` +
    (unwatched.length === 0 ? 'Falling back to watched videos.' : 'Returning unwatched only.')
  );
  return result;
}

