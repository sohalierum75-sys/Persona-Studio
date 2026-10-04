// Toolbar clicks grant activeTab access; the UI retains its extension origin.
chrome.action.onClicked.addListener(async tab => {
  if (tab.id === undefined) return;
  try {
    if (!tab.url || !/^https?:\/\//i.test(tab.url)) throw new Error("Unsupported page");
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:["overlay.js"]});
    await chrome.action.setBadgeText({tabId:tab.id,text:""});
    await chrome.action.setTitle({tabId:tab.id,title:"Open Persona Studio floating panel"});
  } catch {
    await chrome.action.setBadgeText({tabId:tab.id,text:"!"}).catch(() => {});
    await chrome.action.setBadgeBackgroundColor({tabId:tab.id,color:"#c72c45"}).catch(() => {});
    await chrome.action.setTitle({tabId:tab.id,title:"Persona Studio cannot float on this page. Open a regular webpage and click again."}).catch(() => {});
  }
});
chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id === chrome.runtime.id && message?.type === "persona:open-studio") {
    void chrome.tabs.create({url:chrome.runtime.getURL("index.html")});
  }
});
