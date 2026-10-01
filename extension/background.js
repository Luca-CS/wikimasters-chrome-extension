// Service worker :
// - ouvre le rapport ou la config à la demande du content script (pas d'accès à chrome.tabs là-bas) ;
// - rappels de paquets : à partir du dernier relevé fait sur la page Paquets, affiche le nombre
//   estimé de paquets sur l'icône et prévient (notification, e-mail via ntfy.sh) quand le stock est
//   plein. Aucune action dans le jeu : c'est toi qui ouvres les paquets.
importScripts("lib/defaults.js", "lib/store.js", "lib/packs.js");

const { store, packs } = WMT;
const REPORT = chrome.runtime.getURL("pages/report.html");
const PULLS = "https://www.wiki-masters.com/pulls";

// --- Ouverture des pages de l'extension ---------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg) return;
  if (msg.type === "open") openPage(msg.page, msg.run, msg.hash, sender.tab);
  if (msg.type === "testNotify") {
    testNotify(msg.email).then(reply, (e) => reply({ ok: false, error: e.message }));
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
  if (settings.notifyFull || settings.emailFull) await chrome.alarms.create("wmt-full", { when: est.fullAt });
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

/** Publie un message ntfy.sh avec copie par e-mail (compte ntfy.sh avec e-mail vérifié requis). */
async function sendEmail(settings, title, message) {
  if (!settings.ntfyToken || !settings.ntfyTopic) throw new Error("renseigne ton jeton ntfy et ton topic dans la config");
  const r = await fetch("https://ntfy.sh/", {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.ntfyToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: settings.ntfyTopic,
      title,
      message,
      email: "yes", // adresse principale vérifiée du compte ntfy.sh
      click: PULLS,
      tags: ["package"],
      priority: 4,
    }),
  });
  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try {
      const body = await r.json();
      detail = body.error || detail;
    } catch {
      /* réponse non JSON */
    }
    throw new Error(`ntfy.sh a refusé l'envoi (${detail})`);
  }
}

async function onFull(settings, est) {
  // Une seule alerte par remplissage (le relevé change dès que tu ouvres un paquet).
  const key = String(est.fullAt);
  if ((await store.get("packsNotified")) === key) return;
  await store.set("packsNotified", key);
  const title = "Tes paquets WikiMasters sont pleins";
  const message = `${est.max} / ${est.max} paquets disponibles (estimation) : ouvre-les pour ne pas perdre de temps de recharge.`;
  if (settings.notifyFull) await notify("wmt-full", title, message);
  if (settings.emailFull) {
    try {
      await sendEmail(settings, title, message);
    } catch (e) {
      await notify("wmt-error", "E-mail de rappel non envoyé", e.message);
    }
  }
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

async function testNotify(withEmail) {
  const { settings } = await current();
  await notify("wmt-test", "Test WikiMasters Tagger", "Les notifications fonctionnent. Tu seras prévenu quand tes paquets seront pleins.");
  if (withEmail) await sendEmail(settings, "Test WikiMasters Tagger", "L'e-mail de rappel fonctionne.");
  return { ok: true };
}

chrome.notifications.onClicked.addListener((id) => {
  if (!id.startsWith("wmt-")) return;
  chrome.notifications.clear(id);
  if (id !== "wmt-error") chrome.tabs.create({ url: PULLS });
});

chrome.storage.onChanged.addListener((ch, area) => {
  if (area === "local" && (ch.packs || ch.config)) schedule();
});
chrome.runtime.onStartup.addListener(schedule);
chrome.runtime.onInstalled.addListener(schedule);
