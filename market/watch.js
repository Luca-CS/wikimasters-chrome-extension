// Guetteur de la collecte du marché, indépendant de Claude : lit l'export de l'extension
// (Téléchargements/wikimasters-marche/collecte.json, réécrit toutes les 3 h) et te prévient par
// une notification Windows quand :
//   - la collecte a atteint l'objectif : il copie l'export dans cache/market/, lance le backtest
//     (output/backtest-marche.md) puis te le signale ;
//   - la collecte est en pause ou arrêtée (blocage du site, sanction, arrêt manuel) ;
//   - l'export n'a pas été mis à jour depuis 8 h (Chrome fermé, extension arrêtée…).
// Une seule notification par événement (cache/market/watch-state.json). Journal : cache/market/watch.log.
//
//   node market/watch.js                 une vérification
//   node market/watch.js --loop          une vérification par heure, jusqu'à l'objectif atteint
//   node market/watch.js --test-notify   affiche une notification de test
//   options : --file <export.json> --target <nombre d'enchères terminées, 1000 par défaut>
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const backtest = require("./backtest.js");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "cache", "market");
const STATE = path.join(DIR, "watch-state.json");
const LOG = path.join(DIR, "watch.log");
const REPORT = path.join(ROOT, "output", "backtest-marche.md");
const HOUR = 3600000;

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const FILE = arg("--file", backtest.DEFAULT_FILE);
const TARGET = Number(arg("--target", 1000));

function log(line) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);
}

const readJson = (file, dflt) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return dflt;
  }
};

/** Notification Windows (toast via PowerShell) ; à défaut, simple ligne dans le journal. */
function notify(title, message) {
  log(`NOTIFICATION ${title} : ${message}`);
  const esc = (s) => s.replace(/'/g, "''").replace(/[<>&]/g, " ");
  const ps = [
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null",
    "$x = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)",
    `$x.GetElementsByTagName('text')[0].AppendChild($x.CreateTextNode('${esc(title)}')) > $null`,
    `$x.GetElementsByTagName('text')[1].AppendChild($x.CreateTextNode('${esc(message)}')) > $null`,
    "$id = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'",
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($id).Show([Windows.UI.Notifications.ToastNotification]::new($x))",
  ].join("; ");
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { stdio: "ignore", timeout: 30000 });
  } catch (e) {
    log(`notification impossible : ${e.message}`);
  }
}

function check() {
  const state = readJson(STATE, { sent: {} });
  const once = (key, title, message) => {
    if (state.sent[key]) return;
    state.sent[key] = Date.now();
    notify(title, message);
  };
  const data = readJson(FILE, null);
  if (!data) {
    log(`pas d'export lisible : ${FILE}`);
  } else {
    const done = (data.auctions || []).filter((a) => a.state === "done").length;
    const s = data.state || {};
    const age = Date.now() - data.exportedAt;
    log(`export du ${new Date(data.exportedAt).toISOString()} : ${done} / ${TARGET} enchères terminées, ${(data.cards || []).length} cartes, collecte ${s.on ? "active" : "arrêtée"}`);
    if (!s.on && s.stoppedAt) once(`stop-${s.stoppedAt}`, "Collecte du marché arrêtée", s.lastError || "Arrêt sans message.");
    if (s.blockedAt) once(`block-${s.blockedAt}`, "Collecte du marché en pause 24 h", "Le site a signalé trop de requêtes automatisées. Rythme divisé par deux à la reprise.");
    if (age > 8 * HOUR) once(`stale-${data.exportedAt}`, "Collecte du marché : pas de nouvelles", `Dernier export il y a ${Math.round(age / HOUR)} h. Chrome est-il ouvert, et la collecte active ?`);
    if (done >= TARGET && !state.doneAt) {
      fs.mkdirSync(DIR, { recursive: true });
      const copy = path.join(DIR, `collecte-${new Date().toISOString().slice(0, 10)}.json`);
      fs.copyFileSync(FILE, copy);
      fs.mkdirSync(path.dirname(REPORT), { recursive: true });
      fs.writeFileSync(REPORT, backtest.report(backtest.run(data)));
      state.doneAt = Date.now();
      notify("Collecte du marché terminée", `${done} enchères. Backtest prêt : output/backtest-marche.md. Relance Claude pour l'analyse.`);
    }
  }
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  return state;
}

function safeCheck() {
  try {
    return check();
  } catch (e) {
    log(`erreur : ${e.stack || e.message}`);
    return null;
  }
}

if (require.main === module && process.argv.includes("--test-notify")) {
  notify("Test du guetteur WikiMasters", "Les notifications fonctionnent.");
} else if (require.main === module) {
  const first = safeCheck();
  if (process.argv.includes("--loop") && !(first && first.doneAt)) {
    setInterval(() => {
      const st = safeCheck();
      if (st && st.doneAt) process.exit(0); // objectif atteint : le guetteur s'arrête
    }, HOUR);
  }
}

module.exports = { check };
