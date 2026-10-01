// Page Rapport : catégorise la dernière analyse (avec Wikidata si activé) et affiche les cartes
// à étiqueter, la fiabilité des règles et les thèmes récurrents. Ouverte avec ?run=1 depuis le
// panneau de la page Collection pour lancer la catégorisation.
const { core, store } = WMT;
const COLLECTION = "https://www.wiki-masters.com/collection";

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
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const fmtDate = (t) =>
  new Date(t).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const wiki = (t) => "https://fr.wikipedia.org/wiki/" + encodeURIComponent(t.replace(/ /g, "_"));
const keyOf = (tag, c) => `${tag}|${c.title}`;
const local = {
  get(k, d) {
    try {
      const v = localStorage.getItem("wmt:" + k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem("wmt:" + k, JSON.stringify(v));
    } catch {
      /* stockage indisponible : préférence non mémorisée */
    }
  },
};

let config = null;
let scan = null;
let wd = null;
let done = new Set();
let A = null; // résultat de core.analyze
let running = false;
let tab = location.hash.slice(1) || local.get("tab", "todo");
let query = "";
let hideDone = local.get("hideDone", false);
let only = null;

// --- Données ---------------------------------------------------------------------------

async function init() {
  [config, scan, wd] = await Promise.all([store.getConfig(), store.get("scan"), store.get("wd")]);
  done = new Set(await store.get("done", []));
  byId("wd").checked = !!config.settings.wikidata;
  byId("wd").addEventListener("change", (e) => saveSettings({ wikidata: e.target.checked }).then(compute));
  byId("rerun").addEventListener("click", () => categorize());
  store.onChange(onStorage);
  const run = new URLSearchParams(location.search).has("run");
  if (run) history.replaceState(null, "", location.pathname + location.hash);
  if (run) await categorize();
  else compute();
}

async function onStorage(ch) {
  if (ch.config) {
    config = await store.getConfig();
    byId("wd").checked = !!config.settings.wikidata;
  }
  if (ch.scan) scan = ch.scan.newValue || null;
  if (ch.wd && !running) wd = ch.wd.newValue || null;
  if ((ch.config || ch.scan || ch.wd) && !running) compute();
}

async function saveSettings(patch) {
  config = { ...config, settings: { ...config.settings, ...patch } };
  await store.saveConfig(config);
}

function userAgent() {
  const contact = config.settings.contact;
  return `WikiMastersTagger/0.1 (extension perso${contact ? "; contact: " + contact : ""})`;
}

async function categorize() {
  if (running) return;
  if (!scan) return compute();
  running = true;
  byId("rerun").disabled = true;
  notice(null);
  try {
    if (config.settings.wikidata) {
      wd = wd || { titles: {}, labels: {} };
      const titles = scan.cards.map((c) => c.title);
      const missing = new Set(titles.filter((t) => !(t in wd.titles))).size;
      if (missing) showRun(`Wikidata : ${missing} titres à interroger…`, 0);
      try {
        await WMT.wikidata.enrich(
          titles,
          wd,
          userAgent(),
          (phase, i, n) => showRun(`Wikidata : ${phase === "titles" ? "titres" : "libellés"} ${i} / ${n}`, pct(i, n)),
          () => store.set("wd", wd),
        );
      } catch (e) {
        notice(`Wikidata indisponible (${e.message}) : catégorisation avec les infos déjà en cache.`, "warn");
      }
      await store.set("wd", wd);
    }
    await store.set("lastRun", { at: Date.now(), wikidata: !!config.settings.wikidata });
  } finally {
    running = false;
    byId("rerun").disabled = false;
    byId("run").hidden = true;
  }
  compute();
}

function compute() {
  if (!scan) return renderEmpty();
  A = core.analyze({
    cards: scan.cards,
    rules: config.rules,
    themes: config.themes,
    minCount: config.settings.minCount,
    wd: config.settings.wikidata ? wd : null,
  });
  render();
}

// --- Affichage commun ------------------------------------------------------------------

function showRun(text, p) {
  byId("run").hidden = false;
  byId("run-title").textContent = text;
  byId("run-bar").style.width = p + "%";
}

function notice(text, kind = "") {
  const n = byId("notice");
  n.hidden = !text;
  n.className = "note " + kind;
  n.textContent = text || "";
}

const colorOf = (tag) => (config.rules.find((r) => r.name === tag) || {}).color || "var(--accent)";
const swatch = (tag) => $("span", { class: "swatch", style: `--c:${colorOf(tag)}` });
const rarity = (r) => $("span", { class: "rar", style: `background: var(--${r}, var(--C))`, title: "Rareté" }, r || "?");
const where = (c) => $("div", { class: "where" }, c.page ? [$("b", {}, "p." + c.page), " #" + c.pos] : "—");
const link = (title) => $("a", { class: "t", href: wiki(title), target: "_blank", rel: "noopener" }, title);

function thumb(c) {
  const t = $("div", { class: "thumb" }, c.img ? "" : c.rarity);
  if (c.img) t.style.backgroundImage = `url(${JSON.stringify(c.img)})`;
  return t;
}

function wdPill(title) {
  const labs = core.wdLabels(wd, title);
  if (!config.settings.wikidata || !labs.length) return null;
  return $("span", { class: "pill wd", title: "Wikidata : " + labs.join(" ; ") },
    labs.slice(0, 3).join(" · ") + (labs.length > 3 ? ` +${labs.length - 3}` : ""));
}

function renderEmpty() {
  byId("sub").textContent = "Aucune analyse pour l'instant.";
  byId("stats").replaceChildren();
  byId("nav").replaceChildren();
  byId("main").replaceChildren($("section", { class: "group" },
    $("div", { class: "empty" },
      $("p", {}, "Va sur ta collection WikiMasters et clique sur « Analyser toute la collection » dans le panneau Tagger."),
      $("a", { class: "btn primary", href: COLLECTION, target: "_blank", rel: "noopener" }, "Ouvrir ma collection"))));
}

const todoTotal = () => A.todo.reduce((n, g) => n + g.items.length, 0);

function renderStats() {
  const checked = A.todo.reduce((n, g) => n + g.items.filter((it) => done.has(keyOf(g.tag, it.card))).length, 0);
  byId("stats").replaceChildren(...[
    [A.stats.cards, "cartes lues"],
    [A.stats.tagged, "déjà étiquetées"],
    [`${checked} / ${todoTotal()}`, "étiquettes posées"],
    [A.agreement.total ? pct(A.agreement.ok, A.agreement.total) + " %" : "—", "fiabilité des règles"],
    [A.stats.unmatched, "sans suggestion"],
  ].map(([v, l]) => $("div", { class: "stat" }, $("b", {}, String(v)), $("span", {}, l))));
}

function render() {
  const s = config.settings;
  byId("sub").textContent =
    `Analyse du ${fmtDate(scan.at)} · ${scan.cards.length} cartes · ${scan.pages} pages · ` +
    `Wikidata ${s.wikidata ? "activé" : "désactivé"}`;
  if (s.wikidata && !s.contact && byId("notice").hidden) {
    notice("Ajoute ton e-mail dans la config : Wikimedia demande un moyen de contact pour les requêtes automatiques.", "warn");
  }
  renderStats();
  const tabs = [
    ["todo", "À étiqueter", todoTotal()],
    ["check", "Fiabilité", A.agreement.misses.length],
    ["themes", "Nouveaux thèmes", A.themes.length],
  ];
  if (!tabs.some((t) => t[0] === tab)) tab = "todo";
  byId("nav").replaceChildren(...tabs.map(([id, label, n]) =>
    $("button", { class: id === tab ? "on" : "", onclick: () => { tab = id; local.set("tab", id); render(); } },
      label, $("span", { class: "n" }, String(n)))));
  const main = byId("main");
  main.replaceChildren();
  ({ todo: renderTodo, check: renderCheck, themes: renderThemes })[tab](main);
}

// --- Onglet « À étiqueter » --------------------------------------------------------------

function renderTodo(main) {
  const search = $("input", { type: "search", placeholder: "Filtrer par titre, description, motif…", value: query,
    oninput: (e) => { query = e.target.value; draw(); } });
  const hide = $("input", { type: "checkbox", class: "switch", checked: hideDone,
    onchange: (e) => { hideDone = e.target.checked; local.set("hideDone", hideDone); draw(); } });
  const chips = $("div", { class: "chips" });
  const list = $("div");
  main.append($("div", { class: "tools" }, search, $("label", { class: "toggle" }, hide, "Masquer les cartes cochées")), chips, list);

  function draw() {
    const groups = A.todo.filter((g) => g.items.length);
    if (only && !groups.some((g) => g.tag === only)) only = null;
    chips.replaceChildren(
      $("button", { class: "chip" + (only ? "" : " on"), onclick: () => { only = null; draw(); } }, "Toutes"),
      ...groups.map((g) => $("button", { class: "chip" + (only === g.tag ? " on" : ""),
        onclick: () => { only = only === g.tag ? null : g.tag; draw(); } }, swatch(g.tag), `${g.tag} · ${g.items.length}`)));
    const q = core.norm(query);
    const sections = groups.filter((g) => !only || g.tag === only).map((g) => {
      const n = g.items.filter((it) => done.has(keyOf(g.tag, it.card))).length;
      const items = g.items.filter((it) => {
        if (hideDone && done.has(keyOf(g.tag, it.card))) return false;
        if (!q) return true;
        const labs = core.wdLabels(wd, it.card.title).join(" ");
        return core.norm([it.card.title, it.card.desc, it.hits.join(" "), labs].join(" ")).includes(q);
      });
      if (!items.length && q) return null;
      return $("section", { class: "group" },
        $("div", { class: "ghead" }, $("h2", {}, swatch(g.tag), g.tag),
          $("span", { class: "count" }, `${n} / ${g.items.length}`),
          $("div", { class: "bar" }, $("i", { style: `width:${pct(n, g.items.length)}%` }))),
        items.length ? items.map((it) => cardRow(g.tag, it)) : $("div", { class: "empty" }, "Tout est posé ici. 🎉"));
    }).filter(Boolean);
    list.replaceChildren(...(sections.length ? sections : [$("div", { class: "empty" },
      todoTotal() ? "Aucune carte ne correspond au filtre." : "Rien à étiqueter avec les règles actuelles.")]));
  }

  function cardRow(tag, it) {
    const c = it.card;
    const k = keyOf(tag, c);
    return $("div", { class: "card" + (done.has(k) ? " done" : "") },
      $("input", { type: "checkbox", checked: done.has(k), title: "Marquer comme posée",
        onchange: (e) => {
          e.target.checked ? done.add(k) : done.delete(k);
          store.set("done", [...done]);
          renderStats();
          draw();
        } }),
      where(c),
      thumb(c),
      $("div", {},
        link(c.title), rarity(c.rarity),
        c.desc ? $("div", { class: "d" }, c.desc) : null,
        $("div", { class: "meta" },
          it.hits.map((h) => $("span", { class: "pill", title: "motif trouvé" }, h)),
          it.others.length ? $("span", { class: "pill warn", title: "matche aussi" }, "⚠ aussi : " + it.others.join(", ")) : null,
          wdPill(c.title))));
  }

  draw();
}

// --- Onglet « Fiabilité » ----------------------------------------------------------------

function renderCheck(main) {
  const a = A.agreement;
  const p = pct(a.ok, a.total);
  main.append($("section", { class: "group" },
    $("div", { class: "score" },
      $("div", { class: "ring", style: `--p:${p}` }, $("b", {}, a.total ? p + "%" : "—")),
      $("div", {},
        $("b", {}, a.total ? `${a.ok} / ${a.total} cartes retrouvées` : "Aucune carte étiquetée pour comparer"),
        $("div", { class: "d" }, "Sur les cartes que tu as déjà étiquetées à la main, les règles retrouvent-elles ton étiquette ?")))));
  if (!a.misses.length) return;
  main.append($("section", { class: "group" },
    $("div", { class: "ghead" }, $("h2", {}, "Ratés à corriger"),
      $("a", { class: "btn small", href: "options.html#tags" }, "Modifier les règles")),
    $("table", {},
      $("tr", {}, $("th", {}, "Carte"), $("th", {}, "Description"), $("th", {}, "Toi"), $("th", {}, "Règles")),
      a.misses.map((m) => $("tr", {},
        $("td", {}, link(m.card.title), rarity(m.card.rarity),
          $("div", { class: "d" }, m.card.page ? `p.${m.card.page} #${m.card.pos}` : "")),
        $("td", { class: "d" }, m.card.desc || "—"),
        $("td", { class: "you" }, m.real.join(", ")),
        $("td", { class: "bot" }, m.pred.join(", ") || "rien"))))));
}

// --- Onglet « Nouveaux thèmes » ----------------------------------------------------------

async function activateTheme(t) {
  if (config.rules.some((r) => core.norm(r.name) === core.norm(t.name))) return;
  config = { ...config, rules: [...config.rules, { ...t.rule }] };
  await store.saveConfig(config);
  notice(`« ${t.name} » fait maintenant partie de tes étiquettes. Crée-la aussi dans le jeu, avec exactement ce nom.`, "ok");
}

function renderThemes(main) {
  main.append($("p", { class: "d" },
    `Thèmes candidats (page Config) qui reviennent sur au moins ${config.settings.minCount} cartes sans étiquette ni suggestion. ` +
    "Un clic sur « Activer » les ajoute à tes étiquettes."));
  main.append($("section", { class: "group" }, A.themes.length ? A.themes.map((t) =>
    $("div", { class: "theme" },
      $("h3", {}, $("span", { class: "swatch", style: `--c:${t.rule.color || "var(--accent)"}` }), t.name,
        $("small", {}, `${t.n} cartes`),
        $("button", { class: "btn small primary", onclick: () => activateTheme(t) }, "Activer comme étiquette")),
      $("div", { class: "ex" }, t.cards.slice(0, 8).map((c) => c.title).join(" · ") + (t.n > 8 ? " …" : "")),
      $("div", { class: "kw" }, "Mots-clés : " + (t.rule.keywords || []).slice(0, 14).join(" · ") +
        ((t.rule.keywords || []).length > 14 ? " …" : ""))))
    : $("div", { class: "empty" }, "Aucun nouveau thème pour l'instant.")));

  const words = (title, list, hint) => main.append($("section", { class: "group" },
    $("div", { class: "ghead" }, $("h2", {}, title)),
    hint ? $("div", { class: "d pad" }, hint) : null,
    list.length
      ? $("div", { class: "words" }, list.map((w) =>
        $("div", { class: "word", title: w.cards.slice(0, 6).map((c) => c.title).join(", ") },
          $("b", {}, w.word), $("span", {}, String(w.n)))))
      : $("div", { class: "empty" }, "Rien de notable.")));
  words("Mots récurrents dans les descriptions non classées", A.words,
    "Survole un mot pour voir des exemples : utile pour repérer un thème que la config ne connaît pas encore.");
  if (config.settings.wikidata) words("Natures et occupations Wikidata récurrentes", A.wdWords);
}

init();
