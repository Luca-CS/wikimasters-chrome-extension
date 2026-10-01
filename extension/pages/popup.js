// Popup de l'icône : état de la dernière analyse et raccourcis.
const COLLECTION = "https://www.wiki-masters.com/collection";
const byId = (id) => document.getElementById(id);
const fmtDate = (t) => new Date(t).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

(async () => {
  const meta = await WMT.store.get("scanMeta");
  byId("info").textContent = meta
    ? `Dernière analyse : ${fmtDate(meta.at)} · ${meta.n} cartes`
    : "Pas encore d'analyse : ouvre ta collection pour la lancer.";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const onCollection = !!tab && /^https:\/\/(www\.)?wiki-masters\.com\/collection\/?([?#].*)?$/.test(tab.url || "");
  const main = byId("main");
  main.textContent = onCollection ? "Afficher le panneau" : "Ouvrir ma collection";
  main.addEventListener("click", async () => {
    if (onCollection) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "panel" });
      } catch {
        await chrome.tabs.reload(tab.id); // page ouverte avant l'installation de l'extension
      }
    } else {
      await chrome.tabs.create({ url: COLLECTION });
    }
    window.close();
  });
  byId("report").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("pages/report.html") });
    window.close();
  });
  byId("options").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
})();
