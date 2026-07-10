// MV3 service worker. Ping-or-inject: try messaging the content script in
// the clicked tab; if there's no receiver (never injected, or the page
// navigated), inject the bundle, which activates itself on load. No
// injected-tab bookkeeping — the DOM and the message channel are the state,
// so this survives service-worker suspension.

const TOGGLE_MESSAGE = 'ql-toggle';

async function toggleInTab(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: TOGGLE_MESSAGE });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });
    } catch (err) {
      // chrome://, the Web Store, PDFs — pages we're not allowed into.
      console.debug('quotelink: cannot run here', err);
    }
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) void toggleInTab(tab.id);
});
