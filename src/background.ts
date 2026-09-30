// ============================================================
// Persona Studio — Service Worker (Manifest V3 background)
// ============================================================
// Opens the side panel when the extension action is clicked.
// NOTE: chrome.storage.local is used for persistent data — 
//       do NOT rely on service-worker memory between wake cycles.

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id !== undefined) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});
