// background.js
// Handles global (browser-level) notifications for the YouTube Play All extension.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PLAYLIST_ENDED') {
    // 1. Show system notification (standard)
    chrome.notifications.create('yt-play-all-ended', {
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'YouTube Play All',
      message: 'The playlist has ended!',
      priority: 2,
      requireInteraction: true
    });

    // 2. Open a global popup window (guaranteed visibility across all tabs)
    chrome.windows.create({
      url: 'alert.html',
      type: 'popup',
      width: 450,
      height: 400,
      focused: true,
      top: 100,
      left: 100
    });
  }
});

// Optional: Handle notification click to bring the YouTube tab to front
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId === 'yt-play-all-ended') {
    // We could try to find the tab that sent the message and focus it
    chrome.tabs.query({ url: "*://*.youtube.com/*" }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { active: true });
        chrome.windows.update(tabs[0].windowId, { focused: true });
      }
    });
  }
});
