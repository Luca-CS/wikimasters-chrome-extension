"""Rapport HTML autonome (output/rapport.html) : un seul fichier, sans dépendance,
qui s'ouvre dans le navigateur. Les données sont injectées en JSON et rendues en JS ;
les cases cochées sont mémorisées dans le localStorage du navigateur."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from .parser import Card


def card_json(c: Card, **extra) -> dict:
    return {"page": c.page, "pos": c.position, "title": c.title, "rarity": c.rarity,
            "desc": c.description, "tags": c.tags, **extra}


def write_html(path: Path, data: dict) -> None:
    data = {**data, "generated": datetime.now().strftime("%d/%m/%Y %H:%M")}
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    path.write_text(TEMPLATE.replace("__DATA__", payload), encoding="utf-8")


TEMPLATE = r"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WikiMasters Tagger</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
/* Thème repris de wiki-masters.com : sombre par défaut, accent émeraude, Outfit + Inter. */
:root {
  --bg: #0c0d0c; --panel: #131615; --panel-2: #1b1f1d; --ink: #f2f4f3;
  --muted: rgba(242,244,243,.6); --line: #2e3431;
  --accent: #34d399; --accent-ink: #0f172a; --accent-soft: rgba(52,211,153,.12);
  --warn: #fa9931; --warn-soft: rgba(250,153,49,.13);
  --ok: #34d399; --bad: #ff6568;
  --C: #b8f2d5; --PC: #b1cff2; --R: #c6a7f2; --SR: #ed6fa3; --UR: #fa9931; --L: #ffe144;
  --shadow: 0 1px 0 rgba(255,255,255,.03) inset, 0 8px 24px rgba(0,0,0,.35);
  --font-heading: "Outfit", system-ui, sans-serif;
  --font-body: "Inter", system-ui, "Segoe UI", sans-serif;
  color-scheme: dark;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #f7f8f7; --panel: #eef1ef; --panel-2: #e4e8e5; --ink: #0f172a;
    --muted: rgba(15,23,42,.6); --line: #b4bfb8;
    --accent: #009767; --accent-soft: rgba(0,151,103,.1);
    --warn: #b75000; --warn-soft: rgba(221,116,0,.12); --ok: #009767; --bad: #e40014;
    --shadow: 0 1px 2px rgba(0,0,0,.05); color-scheme: light;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); -webkit-font-smoothing: antialiased;
  font: 15px/1.5 var(--font-body);
  background-image: radial-gradient(ellipse 80% 40% at 50% -10%, var(--accent-soft), transparent); background-repeat: no-repeat; }
h1, h2, h3, .stat b, nav button { font-family: var(--font-heading); }
.wrap { max-width: 1040px; margin: 0 auto; padding: 28px 16px 64px; }
header h1 { margin: 0; font-size: 30px; font-weight: 800; letter-spacing: -.02em; }
header h1 em { font-style: normal; color: var(--accent); }
header p { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 22px 0; }
.stat { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; box-shadow: var(--shadow); }
.stat b { display: block; font-size: 26px; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.stat span { color: var(--muted); font-size: 13px; }
nav { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 18px; overflow-x: auto; }
nav button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 10px 14px;
  color: var(--muted); font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap; }
nav button.on { color: var(--accent); border-color: var(--accent); }
nav .n { font-weight: 500; font-size: 12px; background: var(--line); border-radius: 99px; padding: 1px 7px; margin-left: 4px; }
.tools { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 16px; }
.tools input[type=search] { flex: 1; min-width: 200px; padding: 9px 12px; border-radius: 9px;
  border: 1px solid var(--line); background: var(--panel); color: var(--ink); font: inherit; }
.tools label { color: var(--muted); font-size: 13px; display: flex; gap: 6px; align-items: center; cursor: pointer; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 18px; }
.chip { border: 1px solid var(--line); background: var(--panel); color: var(--ink); border-radius: 99px;
  padding: 4px 12px; font: inherit; font-size: 13px; cursor: pointer; }
.chip.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 600; }
section.group { background: var(--panel); border: 1px solid var(--line); border-radius: 14px;
  margin-bottom: 18px; box-shadow: var(--shadow); overflow: hidden; }
.ghead { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--line); }
.ghead h2 { margin: 0; font-size: 17px; flex: 1; }
.ghead .count { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.bar { width: 120px; height: 6px; background: var(--line); border-radius: 99px; overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--ok); transition: width .2s; }
.card { display: grid; grid-template-columns: 22px 64px 1fr; gap: 4px 12px; padding: 11px 18px;
  border-top: 1px solid var(--line); align-items: start; }
.card:first-of-type { border-top: 0; }
.card:hover { background: var(--panel-2); }
.card.done { opacity: .45; }
.card.done .t { text-decoration: line-through; }
.card input { margin-top: 4px; width: 16px; height: 16px; accent-color: var(--ok); cursor: pointer; }
.where { font-variant-numeric: tabular-nums; font-size: 13px; color: var(--muted); padding-top: 2px; white-space: nowrap; }
.where b { color: var(--ink); }
.t { font-weight: 600; color: var(--ink); text-decoration: none; }
.t:hover { color: var(--accent); text-decoration: underline; }
.d { color: var(--muted); font-size: 13.5px; }
.meta { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
.pill { font-size: 11.5px; border-radius: 6px; padding: 1px 7px; background: var(--accent-soft); color: var(--accent); }
.pill.warn { background: var(--warn-soft); color: var(--warn); }
.pill.wd { background: var(--panel-2); color: var(--muted); }
.rar { display: inline-block; min-width: 28px; text-align: center; font-size: 11px; font-weight: 700;
  border-radius: 5px; padding: 1px 5px; color: #0f172a; margin-left: 6px; vertical-align: 2px; }
.empty { padding: 28px; text-align: center; color: var(--muted); }
.score { display: flex; align-items: center; gap: 18px; padding: 18px; }
.ring { --p: 0; width: 84px; height: 84px; border-radius: 50%; flex: none; display: grid; place-items: center;
  background: conic-gradient(var(--ok) calc(var(--p) * 1%), var(--line) 0); }
.ring b { background: var(--panel); width: 66px; height: 66px; border-radius: 50%; display: grid; place-items: center; font-size: 18px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 10px 18px; border-top: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
.you { color: var(--ok); font-weight: 600; } .bot { color: var(--bad); font-weight: 600; }
.theme { padding: 16px 18px; border-top: 1px solid var(--line); }
.theme:first-of-type { border-top: 0; }
.theme h3 { margin: 0 0 4px; font-size: 16px; display: flex; gap: 10px; align-items: baseline; }
.theme h3 small { color: var(--muted); font-weight: 500; font-size: 13px; }
.ex { color: var(--muted); font-size: 13.5px; margin-bottom: 10px; }
pre { margin: 0; background: var(--bg); border: 1px solid var(--line); border-radius: 9px; padding: 10px 12px;
  font: 12.5px/1.5 ui-monospace, Consolas, monospace; white-space: pre-wrap; word-break: break-word; max-height: 160px; overflow: auto; }
.copy { float: right; border: 1px solid var(--line); background: var(--panel); color: var(--ink); border-radius: 7px;
  padding: 3px 10px; font: inherit; font-size: 12px; cursor: pointer; }
.words { display: flex; flex-wrap: wrap; gap: 8px; padding: 16px 18px; }
.word { background: var(--bg); border: 1px solid var(--line); border-radius: 9px; padding: 6px 10px; font-size: 13px; }
.word b { margin-right: 6px; } .word span { color: var(--muted); }
[hidden] { display: none !important; }
@media (max-width: 600px) {
  .card { grid-template-columns: 22px 1fr; }
  .where { grid-column: 2; }
  .card > div:last-child { grid-column: 2; }
  .bar { width: 70px; }
}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Wiki<em>Masters</em> Tagger</h1>
    <p id="sub"></p>
  </header>
  <div class="stats" id="stats"></div>
  <nav id="nav"></nav>
  <main id="main"></main>
</div>
<script id="data" type="application/json">__DATA__</script>
<script>
const D = JSON.parse(document.getElementById("data").textContent);
const $ = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k);
  return e;
};
const store = {
  get(k, d) { try { const v = localStorage.getItem("wmtag:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("wmtag:" + k, JSON.stringify(v)); } catch {} },
};
const done = new Set(store.get("done", []));
const keyOf = (tag, c) => `${tag}|${c.title}`;
const wiki = t => "https://fr.wikipedia.org/wiki/" + encodeURIComponent(t.replace(/ /g, "_"));
const where = c => $("div", { class: "where" }, c.page ? [$("b", {}, "p." + c.page), " #" + c.pos] : "—");
const rar = r => $("span", { class: "rar", style: `background: var(--${r}, var(--C))`, title: "Rareté" }, r);
const wdPill = txt => {
  const labs = txt.split(" ; ");
  return $("span", { class: "pill wd", title: "Wikidata : " + txt },
    labs.slice(0, 3).join(" · ") + (labs.length > 3 ? ` +${labs.length - 3}` : ""));
};
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;

document.getElementById("sub").textContent =
  `Généré le ${D.generated} · ${D.stats.cards} cartes lues${D.wikidata ? " · enrichi avec Wikidata" : ""}`;

const todoTotal = D.todo.reduce((n, g) => n + g.items.length, 0);
function renderStats() {
  const checked = D.todo.reduce((n, g) => n + g.items.filter(c => done.has(keyOf(g.tag, c))).length, 0);
  const s = document.getElementById("stats");
  s.replaceChildren(...[
    [D.stats.cards, "cartes lues"],
    [D.stats.tagged, "déjà étiquetées"],
    [`${checked} / ${todoTotal}`, "étiquettes posées"],
    [D.agreement.total ? pct(D.agreement.ok, D.agreement.total) + " %" : "—", "fiabilité des règles"],
    [D.stats.unmatched, "sans suggestion"],
  ].map(([v, l]) => $("div", { class: "stat" }, $("b", {}, String(v)), $("span", {}, l))));
}

const tabs = [
  ["todo", "À étiqueter", todoTotal],
  ["check", "Fiabilité", D.agreement.misses.length],
  ["themes", "Nouveaux thèmes", D.themes.length],
];
let tab = location.hash.slice(1) || store.get("tab", "todo");
if (!tabs.some(t => t[0] === tab)) tab = "todo";
function renderNav() {
  document.getElementById("nav").replaceChildren(...tabs.map(([id, label, n]) =>
    $("button", { class: id === tab ? "on" : "", onclick: () => { tab = id; store.set("tab", id); render(); } },
      label, $("span", { class: "n" }, String(n)))));
}

let query = "", hideDone = store.get("hideDone", false), only = null;
function renderTodo(main) {
  const search = $("input", { type: "search", placeholder: "Filtrer par titre, description, motif…", value: query,
    oninput: e => { query = e.target.value; draw(); } });
  const hide = $("input", { type: "checkbox", checked: hideDone,
    onchange: e => { hideDone = e.target.checked; store.set("hideDone", hideDone); draw(); } });
  const chips = $("div", { class: "chips" });
  const list = $("div");
  main.append($("div", { class: "tools" }, search, $("label", {}, hide, "Masquer les cartes cochées")), chips, list);

  function draw() {
    chips.replaceChildren(
      $("button", { class: "chip" + (only ? "" : " on"), onclick: () => { only = null; draw(); } }, "Toutes"),
      ...D.todo.filter(g => g.items.length).map(g => $("button", { class: "chip" + (only === g.tag ? " on" : ""),
        onclick: () => { only = only === g.tag ? null : g.tag; draw(); } }, `${g.tag} · ${g.items.length}`)));
    const q = query.trim().toLowerCase();
    const groups = D.todo.filter(g => g.items.length && (!only || g.tag === only)).map(g => {
      const n = g.items.filter(c => done.has(keyOf(g.tag, c))).length;
      const items = g.items.filter(c => {
        if (hideDone && done.has(keyOf(g.tag, c))) return false;
        if (!q) return true;
        return [c.title, c.desc, c.hits.join(" "), c.wikidata || ""].join(" ").toLowerCase().includes(q);
      });
      if (!items.length && q) return null;
      return $("section", { class: "group" },
        $("div", { class: "ghead" }, $("h2", {}, g.tag),
          $("span", { class: "count" }, `${n} / ${g.items.length}`),
          $("div", { class: "bar" }, $("i", { style: `width:${pct(n, g.items.length)}%` }))),
        items.length ? items.map(c => cardRow(g.tag, c)) : $("div", { class: "empty" }, "Tout est posé ici. 🎉"));
    }).filter(Boolean);
    list.replaceChildren(...(groups.length ? groups : [$("div", { class: "empty" },
      todoTotal ? "Aucune carte ne correspond au filtre." : "Rien à étiqueter avec les règles actuelles.")]));
  }
  function cardRow(tag, c) {
    const k = keyOf(tag, c);
    const row = $("div", { class: "card" + (done.has(k) ? " done" : "") },
      $("input", { type: "checkbox", checked: done.has(k), title: "Marquer comme posée",
        onchange: e => {
          e.target.checked ? done.add(k) : done.delete(k);
          store.set("done", [...done]); renderStats(); draw();
        } }),
      where(c),
      $("div", {},
        $("a", { class: "t", href: wiki(c.title), target: "_blank", rel: "noopener" }, c.title), rar(c.rarity),
        c.desc ? $("div", { class: "d" }, c.desc) : null,
        $("div", { class: "meta" },
          c.hits.map(h => $("span", { class: "pill", title: "motif trouvé" }, h)),
          c.others.length ? $("span", { class: "pill warn", title: "matche aussi" }, "⚠ aussi : " + c.others.join(", ")) : null,
          c.wikidata ? wdPill(c.wikidata) : null)));
    return row;
  }
  draw();
}

function renderCheck(main) {
  const a = D.agreement;
  const p = pct(a.ok, a.total);
  main.append($("section", { class: "group" },
    $("div", { class: "score" },
      $("div", { class: "ring", style: `--p:${p}` }, $("b", {}, a.total ? p + "%" : "—")),
      $("div", {},
        $("b", {}, a.total ? `${a.ok} / ${a.total} cartes retrouvées` : "Aucune carte étiquetée pour comparer"),
        $("div", { class: "d" }, "Sur les cartes que tu as déjà étiquetées à la main, est-ce que les règles de rules.toml retrouvent ton étiquette ?")))));
  if (!a.misses.length) return;
  main.append($("section", { class: "group" },
    $("div", { class: "ghead" }, $("h2", {}, "Ratés à corriger dans rules.toml"), $("span", { class: "count" }, String(a.misses.length))),
    $("table", {},
      $("tr", {}, $("th", {}, "Carte"), $("th", {}, "Description"), $("th", {}, "Toi"), $("th", {}, "Script")),
      a.misses.map(m => $("tr", {},
        $("td", {}, $("a", { class: "t", href: wiki(m.title), target: "_blank", rel: "noopener" }, m.title), rar(m.rarity),
          $("div", { class: "d" }, m.page ? `p.${m.page} #${m.pos}` : "")),
        $("td", { class: "d" }, m.desc || "—"),
        $("td", { class: "you" }, m.real.join(", ")),
        $("td", { class: "bot" }, m.pred.join(", ") || "rien"))))));
}

function renderThemes(main) {
  main.append($("p", { class: "d" },
    `Thèmes de themes.toml qui reviennent sur au moins ${D.min_count} cartes sans étiquette ni suggestion. ` +
    "Pour en faire une étiquette, copie le bloc à la fin de rules.toml (et crée l'étiquette dans le jeu)."));
  main.append($("section", { class: "group" }, D.themes.length ? D.themes.map(t => {
    const copy = $("button", { class: "copy", onclick: async () => {
      try { await navigator.clipboard.writeText(t.toml); copy.textContent = "Copié ✓"; }
      catch { copy.textContent = "Sélectionne le texte"; }
      setTimeout(() => copy.textContent = "Copier", 1500);
    } }, "Copier");
    return $("div", { class: "theme" },
      $("h3", {}, t.name, $("small", {}, `${t.n} cartes`)),
      $("div", { class: "ex" }, t.examples.join(" · ") + (t.n > t.examples.length ? " …" : "")),
      copy, $("pre", {}, t.toml));
  }) : $("div", { class: "empty" }, "Aucun nouveau thème pour l'instant.")));

  const words = (title, list, hint) => main.append($("section", { class: "group" },
    $("div", { class: "ghead" }, $("h2", {}, title)),
    hint ? $("div", { class: "d", style: "padding: 12px 18px 0" }, hint) : null,
    list.length ? $("div", { class: "words" }, list.map(w =>
      $("div", { class: "word", title: w.examples.join(", ") }, $("b", {}, w.word), $("span", {}, String(w.n)))))
      : $("div", { class: "empty" }, "Rien de notable.")));
  words("Mots récurrents dans les descriptions non classées", D.words,
    "Survole un mot pour voir des exemples. Utile pour repérer un thème que themes.toml ne connaît pas.");
  if (D.wikidata) words("Natures / occupations Wikidata récurrentes", D.wd_words);
}

function render() {
  renderNav(); renderStats();
  const main = document.getElementById("main");
  main.replaceChildren();
  ({ todo: renderTodo, check: renderCheck, themes: renderThemes })[tab](main);
}
render();
</script>
</body>
</html>
"""
