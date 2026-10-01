// Service worker : ouvre le rapport ou la config à la demande du content script
// (les content scripts n'ont pas accès à chrome.tabs).
const REPORT = chrome.runtime.getURL("pages/report.html");

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "open") openPage(msg.page, msg.run, sender.tab);
});

async function openPage(page, run, fromTab) {
  if (page === "options") return chrome.runtime.openOptionsPage();
  const url = REPORT + (run ? "?run=1" : "");
  try {
    // Réutilise l'onglet du rapport s'il est déjà ouvert.
    const contexts = await chrome.runtime.getContexts({ contextTypes: ["TAB"] });
    const open = contexts.find((c) => c.documentUrl && c.documentUrl.startsWith(REPORT) && c.tabId >= 0);
    if (open) {
      await chrome.tabs.update(open.tabId, { active: true, url });
      if (open.windowId >= 0) await chrome.windows.update(open.windowId, { focused: true });
      return;
    }
  } catch {
    /* getContexts indisponible : on ouvre un nouvel onglet */
  }
  await chrome.tabs.create({ url, index: fromTab ? fromTab.index + 1 : undefined, openerTabId: fromTab ? fromTab.id : undefined });
}
