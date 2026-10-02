// Auto-test du service worker, copié dans une copie de l'extension (out/ext_selftest/pages/) :
// relevé de paquets → alarmes et badge, passage en compte Pro, stock plein, bouton de test.
(async () => {
  const out = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const alarms = async () => (await chrome.alarms.getAll())
    .map((a) => ({ name: a.name, inMin: Math.round((a.scheduledTime - Date.now()) / 6000) / 10, period: a.periodInMinutes || null }))
    .sort((a, b) => a.name.localeCompare(b.name));
  try {
    await chrome.storage.local.set({ packs: { count: 7, max: 10, at: Date.now(), nextMs: 4 * 60000 } });
    await sleep(2000);
    out.free = { alarms: await alarms(), badge: await chrome.action.getBadgeText({}) };
    const { config } = await chrome.storage.local.get("config");
    config.settings.accountType = "pro";
    config.settings.notifyEach = true;
    await chrome.storage.local.set({ config });
    await sleep(2000);
    out.pro = { alarms: await alarms(), badge: await chrome.action.getBadgeText({}) };
    await chrome.storage.local.set({ packs: { count: 10, max: 10, at: Date.now(), nextMs: null } });
    await sleep(1500);
    out.full = { alarms: await alarms(), badge: await chrome.action.getBadgeText({}) };
    out.testNotif = await chrome.runtime.sendMessage({ type: "testNotify" });
  } catch (e) {
    out.error = String((e && e.stack) || e);
  }
  const pre = document.createElement("pre");
  pre.id = "wmt-out";
  pre.textContent = JSON.stringify(out);
  document.body.replaceChildren(pre);
})();
