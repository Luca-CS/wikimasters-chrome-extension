// Service worker :
// - ouvre le rapport ou la config à la demande du content script (pas d'accès à chrome.tabs là-bas) ;
// - rappels de paquets : à partir du dernier relevé fait sur la page Paquets, affiche le nombre
//   estimé de paquets sur l'icône et envoie une notification quand le stock est plein ;
// - collecte du marché en lecture seule, si tu l'as activée dans la config (voir lib/market.js).
importScripts("lib/defaults.js", "lib/store.js", "lib/packs.js", "lib/market.js", "lib/marketdb.js");

const { store, packs, market, marketdb } = WMT;
const REPORT = chrome.runtime.getURL("pages/report.html");
const PULLS = "https://www.wiki-masters.com/pulls";

// --- Ouverture des pages de l'extension ---------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg) return;
  if (msg.type === "open") openPage(msg.page, msg.run, msg.hash, sender.tab);
  if (msg.type === "testNotify") {
    testNotify().then(reply, (e) => reply({ ok: false, error: e.message }));
    return true; // réponse asynchrone
  }
});

async function openPage(page, run, hash = "", fromTab) {
  if (page === "options") {
    if (!hash) return chrome.runtime.openOptionsPage();
    return chrome.tabs.create({ url: chrome.runtime.getURL("pages/options.html") + hash });
  }
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

// --- Rappels de paquets --------------------------------------------------------------

async function current() {
  const [config, state] = await Promise.all([store.getConfig(), store.get("packs")]);
  return { settings: config.settings, est: packs.estimate(state, packs.cooldownMs(config.settings)) };
}

async function updateBadge(est) {
  if (!est) {
    await chrome.action.setBadgeText({ text: "" });
    await chrome.action.setTitle({ title: "WikiMasters Tagger" });
    return;
  }
  await chrome.action.setBadgeText({ text: String(est.count) });
  await chrome.action.setBadgeBackgroundColor({ color: est.count >= est.max ? "#fa9931" : "#34d399" });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: "#0f172a" });
  await chrome.action.setTitle({ title: `WikiMasters Tagger · ${est.count} / ${est.max} paquets (estimation) · ${packs.describe(est)}` });
}

/** (Re)programme les alarmes à partir du dernier relevé. */
async function schedule() {
  const { settings, est } = await current();
  await updateBadge(est);
  await chrome.alarms.clear("wmt-full");
  await chrome.alarms.clear("wmt-next");
  if (!est) return chrome.alarms.clear("wmt-badge");
  await chrome.alarms.create("wmt-badge", { periodInMinutes: 1 });
  if (est.count >= est.max) return;
  if (settings.notifyFull) await chrome.alarms.create("wmt-full", { when: est.fullAt });
  if (settings.notifyEach && est.nextAt) await chrome.alarms.create("wmt-next", { when: est.nextAt });
}

function notify(id, title, message) {
  return chrome.notifications.create(id, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
    priority: 2,
  });
}

async function onFull(settings, est) {
  // Une seule alerte par remplissage (le relevé change dès que tu ouvres un paquet).
  const key = String(est.fullAt);
  if ((await store.get("packsNotified")) === key) return;
  await store.set("packsNotified", key);
  const message = `${est.max} / ${est.max} paquets disponibles (estimation) : ouvre-les pour ne pas perdre de temps de recharge.`;
  if (settings.notifyFull) await notify("wmt-full", "Tes paquets WikiMasters sont pleins", message);
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith("wmt-")) return;
  const { settings, est } = await current();
  await updateBadge(est);
  if (!est || alarm.name === "wmt-badge") return;
  if (alarm.name === "wmt-full" && est.count >= est.max) await onFull(settings, est);
  if (alarm.name === "wmt-next" && settings.notifyEach && est.count < est.max) {
    await notify("wmt-next", "Nouveau paquet WikiMasters", `${est.count} / ${est.max} paquets disponibles (estimation).`);
  }
  await schedule(); // prochaine alarme (ou relance si l'alarme est arrivée un peu tôt)
});

async function testNotify() {
  await notify("wmt-test", "Test WikiMasters Tagger", "Les notifications fonctionnent. Tu seras prévenu quand tes paquets seront pleins.");
  return { ok: true };
}

chrome.notifications.onClicked.addListener((id) => {
  if (!id.startsWith("wmt-")) return;
  chrome.notifications.clear(id);
  chrome.tabs.create({ url: PULLS });
});

// --- Collecte du marché (lecture seule) -------------------------------------------------
// Une requête au plus par tick, à un moment tiré au hasard dans les 20 premières secondes.
// Un 403 du site (« trop de requêtes automatisées ») met tout en pause 24 h et divise le rythme
// par deux (market.account). Jamais d'enchère : seulement des GET sur l'API du marché.

const MARKET_ALARM = "market-collect";
const EXPORT_ALARM = "market-export";
const EXPORT_FILE = "wikimasters-marche/collecte.json"; // dans ton dossier Téléchargements
const SITE_TABS = ["https://www.wiki-masters.com/*", "https://wiki-masters.com/*"];
let marketBusy = false;

const marketState = async () => ({ ...market.DEFAULTS, ...(await store.get("market", {})) });

async function marketSchedule() {
  const s = await marketState();
  if (!s.on) {
    await chrome.alarms.clear(EXPORT_ALARM);
    return chrome.alarms.clear(MARKET_ALARM);
  }
  const period = Math.max(0.5, s.everySec / 60);
  const cur = await chrome.alarms.get(MARKET_ALARM);
  if (!cur || cur.periodInMinutes !== period) await chrome.alarms.create(MARKET_ALARM, { periodInMinutes: period });
  const exp = await chrome.alarms.get(EXPORT_ALARM);
  const every = s.exportEveryH * 60;
  if (!exp || exp.periodInMinutes !== every) await chrome.alarms.create(EXPORT_ALARM, { delayInMinutes: 15, periodInMinutes: every });
}

/**
 * Copie des données sur le disque, pour le backtest (market/backtest.js) et le guetteur
 * (market/watch.js). Un service worker ne peut pas créer d'URL blob : le document hors écran
 * (pages/offscreen.html) s'en charge.
 */
async function marketExport() {
  const data = await marketdb.exportAll();
  const text = JSON.stringify({ version: 1, exportedAt: Date.now(), state: await marketState(), ...data });
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (!contexts.length) {
    await chrome.offscreen.createDocument({ url: "pages/offscreen.html", reasons: ["BLOBS"], justification: "Export des données du marché en fichier JSON" });
  }
  const url = await chrome.runtime.sendMessage({ target: "offscreen", type: "blobUrl", text });
  await chrome.downloads.download({ url, filename: EXPORT_FILE, conflictAction: "overwrite", saveAs: false });
  setTimeout(() => chrome.runtime.sendMessage({ target: "offscreen", type: "revoke", url }).catch(() => {}), 60000);
}

/** GET avec ta session : d'abord depuis le service worker, sinon par un onglet WikiMasters ouvert. */
async function siteGet(url) {
  const t0 = Date.now();
  let status = 0;
  let body = null;
  try {
    const r = await fetch(url, { credentials: "include", headers: { accept: "application/json" } });
    status = r.status;
    body = r.ok ? await r.json() : null;
  } catch {
    status = 0;
  }
  if (status === 401) {
    const [tab] = await chrome.tabs.query({ url: SITE_TABS });
    if (tab) {
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { type: "marketGet", path: new URL(url).pathname + new URL(url).search });
        if (res) ({ status, body } = res);
      } catch {
        /* onglet sans content script à jour : on garde le 401 */
      }
    }
  }
  return { status, body, ms: Date.now() - t0 };
}

async function marketTick() {
  if (marketBusy) return;
  marketBusy = true;
  try {
    if (!market.canRequest(await marketState(), Date.now()).ok) return;
    await new Promise((r) => setTimeout(r, Math.random() * 20000));
    const now = Date.now();
    const task = market.nextTask(await marketdb.queue(now), await marketState(), now);
    if (!task) return;
    const res = await siteGet(market.urlFor(task));
    const kind = market.classify(res.status);
    let s = market.account(await marketState(), kind, Date.now());
    await marketdb.log({ t: Date.now(), kind: task.kind, status: res.status, ms: res.ms });
    if (kind === "ok" || kind === "gone") s = await marketApply(task, kind === "ok" ? res.body : null, s);
    await store.set("market", s);
    if (kind === "blocked") {
      await notify("market-blocked", "Collecte du marché en pause", "Le site a signalé trop de requêtes automatisées : pause de 24 h, puis rythme divisé par deux.");
    }
  } catch (e) {
    console.warn("[WikiMasters Tagger] collecte du marché :", e);
  } finally {
    marketBusy = false;
  }
}

/** Range une réponse ; renvoie l'état (mis à jour pour une lecture de la liste). */
async function marketApply(task, body, s) {
  const now = Date.now();
  if (task.kind === "list") {
    await marketdb.addAuctions(market.sample(body && body.auctions, s, now));
    return { ...s, lastListAt: now };
  }
  if (task.kind === "detail") {
    const rec = await marketdb.get("auctions", task.id);
    if (!rec) return s;
    const next = body ? market.afterDetail(rec, body, now) : { ...rec, state: "gone", doneAt: now };
    await marketdb.put("auctions", next);
    if (next.state === "done" && market.needsSales(await marketdb.get("cards", next.card), next, s)) {
      await marketdb.put("todo", { id: next.card, at: now });
    }
    return s;
  }
  if (body) await marketdb.put("cards", market.cardSales(task.id, body, now));
  await marketdb.del("todo", task.id);
  return s;
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === MARKET_ALARM) marketTick();
  if (alarm.name === EXPORT_ALARM) marketExport().catch((e) => console.warn("[WikiMasters Tagger] export du marché :", e));
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!msg || msg.target === "offscreen") return;
  if (msg.type === "marketExport") {
    marketExport().then(() => reply({ ok: true }), (e) => reply({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === "marketStop") {
    // Sanction anti-triche vue sur le site (content.js) : arrêt complet de la collecte.
    marketState()
      .then((s) => (s.on ? store.set("market", market.stop(s, msg.reason, Date.now())) : null))
      .then(() => reply({ ok: true }));
    return true;
  }
});

chrome.notifications.onClicked.addListener((id) => {
  if (id !== "market-blocked") return;
  chrome.notifications.clear(id);
  openPage("options", false, "#marche");
});

chrome.storage.onChanged.addListener((ch, area) => {
  if (area === "local" && (ch.packs || ch.config)) schedule();
  if (area === "local" && ch.market) marketSchedule();
});
chrome.runtime.onStartup.addListener(() => {
  schedule();
  marketSchedule();
});
chrome.runtime.onInstalled.addListener(() => {
  schedule();
  marketSchedule();
});
