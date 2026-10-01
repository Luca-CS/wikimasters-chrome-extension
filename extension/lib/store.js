// Stockage de l'extension (chrome.storage.local), partagé par le content script et les pages.
// Clés : config (étiquettes, thèmes, réglages), scan (cartes lues), scanMeta (résumé du scan),
// wd (cache Wikidata, même format que cache/wikidata.json), done (cases cochées du rapport).
(function (root) {
  const WMT = (root.WMT = root.WMT || {});
  const area = () => chrome.storage.local;

  async function get(key, fallback = null) {
    const r = await area().get(key);
    return r[key] === undefined ? fallback : r[key];
  }

  const set = (key, value) => area().set({ [key]: value });
  const remove = (...keys) => area().remove(keys);

  /** Config complète ; initialisée avec defaults.js au premier lancement. */
  async function getConfig() {
    const dflt = WMT.defaults.config();
    let c = await get("config");
    if (!c) {
      c = dflt;
      await set("config", c);
    }
    return { ...c, settings: { ...dflt.settings, ...c.settings } };
  }

  function onChange(cb) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local") cb(changes);
    });
  }

  WMT.store = { get, set, remove, getConfig, saveConfig: (c) => set("config", c), onChange };
})(globalThis);
