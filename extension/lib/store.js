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

  /** Empreinte des motifs d'une règle (pour savoir si elle a été modifiée à la main). */
  function fingerprint(r) {
    let x = 5381;
    for (const ch of JSON.stringify([r.keywords || [], r.titleKeywords || []])) x = ((x * 33) ^ ch.codePointAt(0)) >>> 0;
    return x.toString(36);
  }

  // Empreintes des règles par défaut de la config v2.
  const V2_RULES = {
    "Cinéma/Séries/Acteurs": "gh16rl", "Royauté": "1h3i2w", "Musique": "22pxsi", "Mythologie": "1yo22y2",
    "Maths": "1oie4fy", "Automobile": "y31nfd", "Roumanie": "1ymf52p", "Ski": "ynyf73",
  };

  /**
   * v3 : nouvelles règles par défaut (une règle jamais modifiée est remplacée, une règle modifiée
   * garde tes motifs et reçoit les nouveaux), étiquette Shiny, plus d'e-mail de rappel.
   */
  function toV3(c, dflt) {
    const byName = new Map(dflt.rules.map((r) => [r.name, r]));
    const merge = (mine = [], theirs = []) => [...mine, ...theirs.filter((p) => !mine.includes(p))];
    let rules = c.rules.map((r) => {
      const d = byName.get(r.name);
      if (!d || d.shiny) return r;
      if (V2_RULES[r.name] === fingerprint(r)) return { ...r, keywords: d.keywords, titleKeywords: d.titleKeywords };
      return { ...r, keywords: merge(r.keywords, d.keywords), titleKeywords: merge(r.titleKeywords, d.titleKeywords) };
    });
    const shiny = dflt.rules.find((r) => r.shiny);
    if (shiny && !rules.some((r) => r.shiny)) {
      const same = rules.findIndex((r) => r.name === shiny.name);
      if (same >= 0) rules[same] = { ...rules[same], shiny: true };
      else rules = [...rules, shiny];
    }
    const { emailFull, ntfyToken, ntfyTopic, ...settings } = c.settings || {};
    return { ...c, version: 3, rules, settings };
  }

  /**
   * v4 : nouvelles étiquettes par défaut (Finance, Physique, Substances), ajoutées juste avant
   * l'étiquette shiny si ta config ne les a pas déjà. Seulement elles : une étiquette par défaut
   * que tu as supprimée ne revient pas, et tes étiquettes existantes ne bougent pas.
   */
  const NEW_IN_V4 = ["Finance", "Physique", "Substances"];

  function toV4(c, dflt) {
    const names = new Set(c.rules.map((r) => r.name));
    const missing = dflt.rules.filter((r) => NEW_IN_V4.includes(r.name) && !names.has(r.name));
    const rules = [...c.rules];
    const at = rules.findIndex((r) => r.shiny);
    rules.splice(at < 0 ? rules.length : at, 0, ...missing);
    return { ...c, version: 4, rules };
  }

  /** Config complète ; initialisée avec defaults.js au premier lancement, puis migrée. */
  async function getConfig() {
    const dflt = WMT.defaults.config();
    let c = await get("config");
    if (!c) {
      c = dflt;
      await set("config", c);
    }
    if ((c.version || 1) < 2) {
      // v2 : défilement beaucoup plus rapide (0,2 s par carte au lieu de 1,5 s par défaut).
      const s = { ...c.settings };
      if (s.revealDelay === undefined || s.revealDelay === 1500) s.revealDelay = dflt.settings.revealDelay;
      c = { ...c, version: 2, settings: s };
      await set("config", c);
    }
    if (c.version < 3) {
      c = toV3(c, dflt);
      await set("config", c);
    }
    if (c.version < 4) {
      c = toV4(c, dflt);
      await set("config", c);
    }
    return { ...c, settings: { ...dflt.settings, ...c.settings } };
  }

  function onChange(cb) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local") cb(changes);
    });
  }

  WMT.store = { get, set, remove, getConfig, saveConfig: (c) => set("config", c), onChange, fingerprint };
})(globalThis);
