const LEVEL_COLOR = {
  low: "#3f6e64",
  medium: "#b98a3d",
  high: "#b25c4d",
};

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "load-state" && sender.tab) {
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: msg.label || "" });
    chrome.action.setBadgeBackgroundColor({
      tabId: sender.tab.id,
      color: LEVEL_COLOR[msg.level] || "#62726c",
    });
  }

  if (msg.type === "log-session") {
    chrome.storage.local.get({ sessions: [] }, ({ sessions }) => {
      sessions.push(msg.session);
      // Keep the log bounded — this is a local MVP store, not a database.
      if (sessions.length > 200) sessions.shift();
      chrome.storage.local.set({ sessions });
    });
  }
});
