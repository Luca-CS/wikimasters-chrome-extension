// Page Config : étiquettes actives, thèmes candidats, réglages d'analyse et données.
// Enregistrement automatique (chrome.storage.local, clé "config").
const { core, store } = WMT;
const PALETTE = ["#fbbf24", "#a78bfa", "#f472b6", "#60a5fa", "#fb923c", "#a3e635", "#f87171", "#22d3ee", "#e879f9", "#4ade80"];

const $ = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k);
  return e;
};
const byId = (id) => document.getElementById(id);
const lines = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const fmtDate = (t) => new Date(t).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

let config = null;
let saveTimer = 0;
let lastSaved = "";

// --- Enregistrement ----------------------------------------------------------------------

function scheduleSave() {
  byId("saved").textContent = "· modifications en cours…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}

async function save() {
  saveTimer = 0;
  lastSaved = JSON.stringify(config);
  await store.saveConfig(config);
  byId("saved").textContent = "· enregistré ✓";
  runTester();
}

// --- Éditeur d'étiquettes / de thèmes ----------------------------------------------------

function renderList(key) {
  const box = byId(key === "rules" ? "rules" : "themes-list");
  const open = new Set([...box.querySelectorAll("details[open]")].map((d) => d.dataset.i));
  box.replaceChildren(...config[key].map((r, i) => ruleEditor(key, i, open.has(String(i)))));
}

function ruleEditor(key, i, open) {
  const isTheme = key === "themes";
  const rule = config[key][i];
  const dot = $("span", { class: "swatch" });
  const label = $("span", { class: "name" });
  const count = $("span", { class: "count" });
  const err = $("div", { class: "err", hidden: true });
  const name = $("input", { type: "text", value: rule.name, placeholder: "Nom exact de l'étiquette dans le jeu" });
  const color = $("input", { type: "color", value: rule.color || "#34d399", title: "Couleur du surlignage" });
  const kw = $("textarea", { rows: 7, spellcheck: "false" });
  const tkw = $("textarea", { rows: 7, spellcheck: "false" });
  kw.value = (rule.keywords || []).join("\n");
  tkw.value = (rule.titleKeywords || []).join("\n");
  const crossBox = $("input", { type: "checkbox", class: "switch", checked: !!rule.cross });

  const details = $("details", { class: "rule", "data-i": String(i), open },
    $("summary", {}, dot, label, count),
    $("div", { class: "rule-body" },
      $("div", { class: "rule-head" },
        color, name,
        $("button", { class: "btn small", title: "Monter", disabled: i === 0, onclick: () => move(key, i, -1) }, "↑"),
        $("button", { class: "btn small", title: "Descendre", disabled: i === config[key].length - 1, onclick: () => move(key, i, 1) }, "↓"),
        isTheme ? $("button", { class: "btn small primary", onclick: () => activate(i) }, "Activer comme étiquette") : null,
        !isTheme && rule.colorLocked
          ? $("button", { class: "btn small", onclick: () => { update({ colorLocked: false }); renderList(key); } }, "Reprendre la couleur du jeu")
          : null,
        $("button", { class: "btn small danger", onclick: () => removeRule(key, i) }, "Supprimer")),
      rule.shiny
        ? $("div", { class: "d" }, "Posée sur toutes les cartes shiny (✦), en plus de leur catégorie, même si elles sont déjà étiquetées.")
        : $("div", { class: "cols" },
          $("label", {}, "Mots-clés cherchés dans la description, la précision du titre entre parenthèses (et Wikidata), un par ligne", kw),
          $("label", {}, "Mots-clés cherchés dans le titre", tkw)),
      isTheme || rule.shiny ? null : $("label", { class: "field inline" },
        $("span", {}, "Transversale", $("br"),
          $("small", {}, "Posée en plus de la catégorie, même sur une carte déjà étiquetée, sans compter comme catégorie. Seulement sur les indices de la carte (pas Wikidata).")),
        crossBox),
      isTheme ? null : $("div", { class: "d" },
        rule.colorLocked ? "Couleur choisie à la main." : "Couleur reprise automatiquement du jeu dès que l'étiquette apparaît sur une carte."),
      err));

  function refreshHead() {
    const r = config[key][i];
    label.textContent = r.name || "(sans nom)";
    dot.style.setProperty("--c", r.color || "#34d399");
    const bad = [...(r.keywords || []), ...(r.titleKeywords || [])]
      .map((p) => [p, core.patternError(p)])
      .filter(([, e]) => e);
    err.hidden = !bad.length;
    err.textContent = bad.map(([p, e]) => `Motif ignoré « ${p} » : ${e}`).join("\n");
    details.classList.toggle("invalid", bad.length > 0);
    const n = (r.keywords || []).length;
    const nt = (r.titleKeywords || []).length;
    count.textContent = r.shiny ? "toutes les cartes shiny" : bad.length
      ? `${bad.length} motif${bad.length > 1 ? "s" : ""} invalide${bad.length > 1 ? "s" : ""}`
      : `${n} mot${n > 1 ? "s" : ""}-clé${n > 1 ? "s" : ""}${nt ? ` · ${nt} pour le titre` : ""}`;
  }

  function update(patch) {
    config[key][i] = { ...config[key][i], ...patch };
    refreshHead();
    scheduleSave();
  }

  name.addEventListener("input", () => update({ name: name.value.trim() }));
  color.addEventListener("input", () => update(isTheme ? { color: color.value } : { color: color.value, colorLocked: true }));
  kw.addEventListener("input", () => update({ keywords: lines(kw.value) }));
  tkw.addEventListener("input", () => update({ titleKeywords: lines(tkw.value) }));
  crossBox.addEventListener("change", () => update({ cross: crossBox.checked }));
  refreshHead();
  return details;
}

function move(key, i, d) {
  const list = config[key];
  [list[i], list[i + d]] = [list[i + d], list[i]];
  renderList(key);
  scheduleSave();
}

function removeRule(key, i) {
  const r = config[key][i];
  if (!confirm(`Supprimer « ${r.name || "(sans nom)"} » ?`)) return;
  config[key].splice(i, 1);
  renderList(key);
  scheduleSave();
}

function addRule(key) {
  const used = new Set([...config.rules, ...config.themes].map((r) => r.color));
  const color = PALETTE.find((c) => !used.has(c)) || PALETTE[config[key].length % PALETTE.length];
  config[key].push({ name: key === "rules" ? "Nouvelle étiquette" : "Nouveau thème", color, keywords: [], titleKeywords: [] });
  renderList(key);
  const last = byId(key === "rules" ? "rules" : "themes-list").lastElementChild;
  last.open = true;
  last.querySelector('input[type="text"]').select();
  scheduleSave();
}

function activate(i) {
  const t = config.themes[i];
  if (config.rules.some((r) => core.norm(r.name) === core.norm(t.name))) {
    alert(`« ${t.name} » fait déjà partie de tes étiquettes.`);
    return;
  }
  config.rules.push({ ...t });
  renderList("rules");
  scheduleSave();
  alert(`« ${t.name} » est maintenant une étiquette active. Crée-la aussi dans le jeu, avec exactement ce nom.`);
}

// --- Testeur -----------------------------------------------------------------------------

function runTester() {
  const title = byId("t-title").value.trim();
  const desc = byId("t-desc").value.trim();
  const out = byId("t-out");
  if (!title && !desc) {
    out.replaceChildren($("span", { class: "d" }, "Tape un titre ou une description pour voir les étiquettes suggérées."));
    return;
  }
  const card = { title, desc, tags: [] };
  const res = core.matchCard(card, core.compileRules(config.rules));
  const themes = core.matchCard(card, core.compileRules(config.themes));
  const chip = (m, color) => {
    const e = $("span", { class: "res" }, m.tag, $("small", {}, m.hits.join(", ")));
    e.style.setProperty("--c", color || "#34d399");
    return e;
  };
  out.replaceChildren(...[
    res.length
      ? $("div", {}, $("span", { class: "d" }, "Suggestion : "), res.map((m) => chip(m, (config.rules.find((r) => r.name === m.tag) || {}).color)))
      : $("div", { class: "d" }, "Aucune étiquette ne correspond."),
    themes.length
      ? $("div", {}, $("span", { class: "d" }, "Thèmes candidats : "), themes.map((m) => chip(m, (config.themes.find((r) => r.name === m.tag) || {}).color)))
      : null,
  ].filter(Boolean));
}

// --- Réglages ----------------------------------------------------------------------------

function bindSettings() {
  for (const el of document.querySelectorAll("[data-setting]")) {
    const k = el.dataset.setting;
    if (el.type === "checkbox") el.checked = !!config.settings[k];
    else el.value = config.settings[k] ?? "";
    el.addEventListener(el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input", () => {
      let v = el.type === "checkbox" ? el.checked : el.value.trim();
      if (el.type === "number") {
        v = Number(v);
        if (!Number.isFinite(v) || v < +el.min) return;
        v = Math.min(v, +el.max);
      }
      config.settings = { ...config.settings, [k]: v };
      scheduleSave();
    });
  }
}

function fillSettings() {
  for (const el of document.querySelectorAll("[data-setting]")) {
    if (el === document.activeElement) continue;
    const v = config.settings[el.dataset.setting];
    if (el.type === "checkbox") el.checked = !!v;
    else el.value = v ?? "";
  }
}

// --- Paquets et rappels ------------------------------------------------------------------

async function renderPacksInfo() {
  const state = await store.get("packs");
  const est = WMT.packs.estimate(state, WMT.packs.cooldownMs(config.settings));
  byId("packs-info").textContent = state
    ? `Dernier relevé sur la page Paquets : ${state.count} / ${state.max} à ${WMT.packs.fmtTime(state.at)}. ` +
      `Estimation actuelle : ${est.count} / ${est.max}, ${WMT.packs.describe(est)}.`
    : "Pas encore de relevé : passe sur la page Paquets de WikiMasters avec l'extension active.";
}

async function testNotify() {
  const out = byId("test-result");
  out.textContent = "Envoi…";
  try {
    const res = await chrome.runtime.sendMessage({ type: "testNotify" });
    if (!res || !res.ok) throw new Error((res && res.error) || "pas de réponse de l'extension");
    out.textContent = "✓ Notification envoyée.";
  } catch (e) {
    out.textContent = `✗ ${e.message}`;
  }
}

// --- Données -----------------------------------------------------------------------------

async function renderDataInfo() {
  const [meta, wd, bytes] = await Promise.all([
    store.get("scanMeta"),
    store.get("wd"),
    chrome.storage.local.getBytesInUse(null),
  ]);
  const nwd = wd && wd.titles ? Object.keys(wd.titles).length : 0;
  byId("data-info").textContent =
    (meta ? `Dernière analyse : ${fmtDate(meta.at)}, ${meta.n} cartes sur ${meta.pages} pages.` : "Pas encore d'analyse.") +
    ` Cache Wikidata : ${nwd} titre${nwd > 1 ? "s" : ""}.`;
  byId("usage").textContent = `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo utilisés`;
}

function download(name, text) {
  const a = $("a", { href: URL.createObjectURL(new Blob([text], { type: "application/json" })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function bindData() {
  byId("export").addEventListener("click", () => {
    download("wikimasters-tagger-config.json", JSON.stringify(config, null, 2));
  });
  byId("import").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const valid = (l) => Array.isArray(l) && l.every((r) => r && typeof r.name === "string" && Array.isArray(r.keywords || []));
      if (!valid(data.rules) || (data.themes && !valid(data.themes))) throw new Error("ce n'est pas une config WikiMasters Tagger");
      const dflt = WMT.defaults.config();
      config = { ...dflt, ...data, themes: data.themes || dflt.themes, settings: { ...dflt.settings, ...data.settings } };
      await save();
      renderAll();
    } catch (err) {
      alert(`Import impossible : ${err.message}`);
    }
  });
  byId("reset").addEventListener("click", async () => {
    if (!confirm("Remettre les étiquettes, thèmes et réglages par défaut ?")) return;
    config = WMT.defaults.config();
    await save();
    renderAll();
  });
  byId("clear-wd").addEventListener("click", async () => {
    if (!confirm("Vider le cache Wikidata ? Il sera reconstruit à la prochaine catégorisation.")) return;
    await store.remove("wd");
  });
  byId("clear-scan").addEventListener("click", async () => {
    if (!confirm("Supprimer la dernière analyse (cartes lues et cases cochées du rapport) ?")) return;
    await store.remove("scan", "scanMeta", "done");
  });
}

// --- Marché : collecte de données (lecture seule) ----------------------------------------

const KIND = { list: "nouvelles annonces", detail: "résultat d'enchère", sales: "historique de prix" };
const fmtTime = (t) => new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const marketState = async () => ({ ...WMT.market.DEFAULTS, ...(await store.get("market", {})) });

async function saveMarket(patch) {
  await store.set("market", { ...(await marketState()), ...patch });
}

async function renderMarket() {
  const s = await marketState();
  const now = Date.now();
  byId("mk-on").checked = s.on;
  for (const [id, v] of [["mk-every", s.everySec], ["mk-cap", s.dailyCap], ["mk-share", Math.round(s.pRest * 100)], ["mk-h0", s.hours[0]], ["mk-h1", s.hours[1]]]) {
    if (document.activeElement !== byId(id)) byId(id).value = v;
  }
  let st = null;
  try {
    st = await WMT.marketdb.stats();
  } catch (e) {
    byId("mk-status").textContent = `Données illisibles : ${e.message}`;
    return;
  }
  const used = s.today && s.today.day === WMT.market.dayKey(now) ? s.today.n : 0;
  const gate = WMT.market.canRequest(s, now);
  const state = !s.on ? "arrêtée"
    : gate.why === "pause" ? `en pause jusqu'à ${fmtDate(s.backoffUntil)}`
    : gate.why === "hours" ? `en veille (heures actives ${s.hours[0]} h – ${s.hours[1]} h)`
    : gate.why === "cap" ? "quota du jour atteint"
    : "active";
  byId("mk-badge").textContent = `${st.done} enchères terminées`;
  byId("mk-status").textContent =
    `Collecte ${state}. Aujourd'hui : ${used} / ${s.dailyCap} requêtes. ` +
    `Enchères suivies : ${st.waiting} en attente de leur fin, ${st.done} terminées, ${st.gone} introuvables. ` +
    `Historiques de prix : ${st.cards} cartes (${st.todo} à lire).` +
    (s.lastError ? ` Dernier problème : ${s.lastError}` : "");
  byId("mk-log").replaceChildren(
    ...st.last.map((l) => $("tr", {}, $("td", {}, fmtTime(l.t)), $("td", {}, KIND[l.kind] || l.kind), $("td", {}, l.status ? `HTTP ${l.status}` : "pas de réponse"), $("td", {}, `${(l.ms / 1000).toFixed(1).replace(".", ",")} s`))),
  );
}

function bindMarket() {
  // Relancer efface le dernier message ; une pause de 24 h en cours reste respectée.
  byId("mk-on").addEventListener("change", (e) => saveMarket(e.target.checked ? { on: true, lastError: null } : { on: false }).then(renderMarket));
  const num = (id, min, max, apply) => byId(id).addEventListener("change", async (e) => {
    const v = Math.round(Number(e.target.value));
    if (!Number.isFinite(v)) return renderMarket();
    await saveMarket(apply(Math.min(max, Math.max(min, v)), await marketState()));
    renderMarket();
  });
  num("mk-every", 30, 600, (v) => ({ everySec: v }));
  num("mk-cap", 50, 5000, (v) => ({ dailyCap: v }));
  num("mk-share", 1, 100, (v) => ({ pRest: v / 100 }));
  num("mk-h0", 0, 23, (v, s) => ({ hours: [v, Math.max(v + 1, s.hours[1])] }));
  num("mk-h1", 1, 24, (v, s) => ({ hours: [Math.min(s.hours[0], v - 1), v] }));
  byId("mk-export").addEventListener("click", async () => {
    const out = byId("mk-result");
    out.textContent = "Export…";
    const res = await chrome.runtime.sendMessage({ type: "marketExport" }).catch((e) => ({ ok: false, error: e.message }));
    out.textContent = res && res.ok ? "✓ Enregistré dans Téléchargements/wikimasters-marche/collecte.json" : `✗ ${(res && res.error) || "pas de réponse"}`;
  });
  byId("mk-clear").addEventListener("click", async () => {
    if (!confirm("Supprimer toutes les données collectées sur le marché ?")) return;
    await WMT.marketdb.clear();
    renderMarket();
  });
}

// --- Démarrage ---------------------------------------------------------------------------

function renderAll() {
  renderList("rules");
  renderList("themes");
  fillSettings();
  runTester();
}

async function init() {
  config = await store.getConfig();
  lastSaved = JSON.stringify(config);
  renderAll();
  bindSettings();
  bindData();
  byId("add-rule").addEventListener("click", () => addRule("rules"));
  byId("add-theme").addEventListener("click", () => addRule("themes"));
  byId("t-title").addEventListener("input", runTester);
  byId("t-desc").addEventListener("input", runTester);
  byId("test-notif").addEventListener("click", testNotify);
  renderDataInfo();
  renderPacksInfo();
  setInterval(renderPacksInfo, 30000);
  bindMarket();
  renderMarket();
  setInterval(() => document.hidden || renderMarket(), 5000);
  store.onChange(async (ch) => {
    if (ch.scanMeta || ch.wd) renderDataInfo();
    if (ch.packs || ch.config) renderPacksInfo();
    // Changement venu d'ailleurs (couleurs reprises du jeu, rapport…) : on recharge si rien n'est en cours ici.
    if (ch.config && !saveTimer && JSON.stringify(ch.config.newValue) !== lastSaved) {
      config = await store.getConfig();
      lastSaved = JSON.stringify(config);
      renderAll();
    }
  });
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
}

init();
