// Backtest de la stratégie « mise de départ en fin d'enchère » (extension/lib/strategy.js) sur les
// données de la collecte du marché (export de l'extension).
//
//   node market/backtest.js [collecte.json] > output/backtest-marche.md
//
// Sans regarder le futur : la valeur d'une carte n'utilise que les ventes antérieures au moment de
// décision, et le modèle de revente π est estimé sur les 60 % d'enchères les plus anciennes puis
// évalué sur les 40 % suivantes, où la stratégie est simulée.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const st = require("../extension/lib/strategy.js");

const DEFAULT_FILE = path.join(os.homedir(), "Downloads", "wikimasters-marche", "collecte.json");
const RARITIES = ["C", "PC", "R", "SR", "UR", "L"];
const HOUR = 3600000;

const sold = (a) => a.detail.status === "settled_sold";
const wsum = (list, f = () => 1) => list.reduce((s, a) => s + (a.w || 1) * f(a), 0);
const share = (list, pred) => (list.length ? wsum(list, (a) => (pred(a) ? 1 : 0)) / wsum(list) : null);
const median = (xs) => {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};

/** Variables et issue d'une enchère pour le modèle de revente, ou null sans valeur de référence. */
function row(a, sales, opts) {
  const val = st.value(sales, a.rarity, a.end, opts, a.id);
  if (!val || !val.v) return null;
  const price = st.priceAt(a, a.end);
  if (!(price > 0)) return null;
  const x = st.features(price, val.v, Math.max(10, (a.end - a.cr) / 60000), new Date(a.end).getHours());
  return { x, y: sold(a) ? 1 : 0, w: a.w || 1, price, v: val.v };
}

function logLoss(beta, rows, link) {
  let s = 0;
  let w = 0;
  for (const r of rows) {
    const p = Math.min(1 - 1e-6, Math.max(1e-6, st.predict(beta, r.x, link)));
    s += -r.w * (r.y ? Math.log(p) : Math.log(1 - p));
    w += r.w;
  }
  return w ? s / w : null;
}

function calibration(beta, rows, link, bins = 5) {
  const scored = rows.map((r) => ({ p: st.predict(beta, r.x, link), y: r.y, w: r.w })).sort((a, b) => a.p - b.p);
  const out = [];
  for (let b = 0; b < bins; b++) {
    const part = scored.slice(Math.floor((b * scored.length) / bins), Math.floor(((b + 1) * scored.length) / bins));
    if (!part.length) continue;
    const W = part.reduce((s, r) => s + r.w, 0);
    out.push({ n: part.length, predicted: part.reduce((s, r) => s + r.w * r.p, 0) / W, observed: part.reduce((s, r) => s + r.w * r.y, 0) / W });
  }
  return out;
}

/** Simule la stratégie sur une liste d'enchères ; π et le ratio de surenchère viennent de l'entraînement. */
function simulate(list, cards, opts, model) {
  const trades = [];
  let candidates = 0;
  let abandoned = 0;
  let noValue = 0;
  for (const a of list) {
    const o = st.outcome(a, opts);
    if (!o) continue;
    candidates++;
    if (o.status === "abandoned") {
      abandoned++;
      continue;
    }
    const sales = cards.get(a.card);
    const val = st.value(sales, a.rarity, o.t, opts, a.id);
    if (!val) {
      noValue++;
      continue;
    }
    const d = st.decide(o.price, val, opts);
    if (!d.go) continue;
    // A : revendu au prix de la prochaine vente réelle de la carte (même rareté) dans les 14 jours,
    //     sinon défaussé (1). Optimiste : ces ventes sont celles qui ont trouvé preneur.
    const next = (sales || []).filter((s) => s[1] === a.rarity && s[2] > a.end && s[2] - a.end < 14 * 24 * HOUR && s[3] !== a.id).sort((x, y) => x[2] - y[2])[0];
    const pnlA = (next ? next[0] : 1) - o.price;
    // B : remis en vente 1 h au prix V ; vendu avec la probabilité π, au prix × ratio de surenchère
    //     médian, sinon défaussé (1). Prudent : pas de seconde tentative.
    let pnlB = null;
    if (model) {
      const pi = st.predict(model.beta, st.features(val.v, val.v, 60, new Date(a.end).getHours()), model.link);
      pnlB = pi * val.v * model.overbid + (1 - pi) * 1 - o.price;
    }
    trades.push({ title: a.title, rarity: a.rarity, price: o.price, v: val.v, low: val.low, n: val.n, pnlA, pnlB, w: a.w || 1 });
  }
  const sum = (f) => trades.reduce((s, t) => s + f(t), 0);
  return {
    candidates, abandoned, noValue, trades,
    pnlA: sum((t) => t.pnlA),
    pnlB: model ? sum((t) => t.pnlB) : null,
    winA: trades.length ? trades.filter((t) => t.pnlA > 0).length / trades.length : null,
    invested: sum((t) => t.price),
  };
}

function run(data, opts = st.DEFAULTS) {
  const cards = new Map((data.cards || []).map((c) => [c.id, c.sales]));
  const done = (data.auctions || []).filter((a) => a.state === "done" && a.detail && a.end).sort((a, b) => a.end - b.end);
  const cut = Math.floor(done.length * 0.6);
  const train = done.slice(0, cut);
  const test = done.slice(cut);

  const sample = {
    done: done.length,
    waiting: (data.auctions || []).filter((a) => a.state === "wait").length,
    cards: cards.size,
    from: done.length ? done[0].end : null,
    to: done.length ? done[done.length - 1].end : null,
    sellThrough: share(done, sold),
    byRarity: RARITIES.map((r) => {
      const l = done.filter((a) => a.rarity === r);
      const cand = l.filter((a) => st.candidate(a, opts));
      return {
        rarity: r, n: l.length, sellThrough: share(l, sold),
        candidate: share(l, (a) => !!st.candidate(a, opts)),
        abandoned: share(cand, (a) => st.outcome(a, opts).status === "abandoned"),
        withValue: share(cand, (a) => !!st.value(cards.get(a.card), a.rarity, a.end - opts.lead * 1000, opts, a.id)),
      };
    }).filter((x) => x.n),
  };

  // Modèle de revente π, estimé sur l'entraînement.
  const rowsTrain = train.map((a) => row(a, cards.get(a.card), opts)).filter(Boolean);
  const rowsTest = test.map((a) => row(a, cards.get(a.card), opts)).filter(Boolean);
  let model = null;
  const models = [];
  if (rowsTrain.length >= 40 && rowsTest.length >= 20) {
    const base = wsum(rowsTrain.map((r) => ({ w: r.w })), () => 1);
    const rate = Math.min(0.99, Math.max(0.01, rowsTrain.reduce((s, r) => s + r.w * r.y, 0) / base));
    const naive = logLoss([Math.log(-Math.log(1 - rate))], rowsTest.map((r) => ({ ...r, x: [1] })), "cloglog");
    for (const link of ["cloglog", "logit"]) {
      const beta = st.fit(rowsTrain.map((r) => r.x), rowsTrain.map((r) => r.y), rowsTrain.map((r) => r.w), { link, l2: 0.1 });
      models.push({ link, beta, loss: logLoss(beta, rowsTest, link), naive, calib: calibration(beta, rowsTest, link) });
    }
    const best = models.slice().sort((a, b) => a.loss - b.loss)[0];
    const ratios = train.filter((a) => sold(a) && a.detail.final).map((a) => a.detail.final / st.priceAt(a, a.end)).filter((x) => x > 0);
    model = { ...best, overbid: median(ratios) || 1 };
  }

  const sim = simulate(test, cards, opts, model);
  const grid = [];
  for (const minRatio of [1.2, 1.5, 2, 3]) {
    for (const quantile of [0.25, 0.5]) {
      const o = { ...opts, minRatio, quantile };
      const r = simulate(test, cards, o, model);
      grid.push({ minRatio, quantile, trades: r.trades.length, pnlA: r.pnlA, pnlB: r.pnlB, winA: r.winA, invested: r.invested });
    }
  }
  return { opts, sample, train: train.length, test: test.length, rows: [rowsTrain.length, rowsTest.length], models, model, sim, grid };
}

const pct = (x) => (x == null ? "–" : `${Math.round(x * 100)} %`);
const num = (x, d = 0) => (x == null ? "–" : x.toFixed(d).replace(".", ","));
const day = (t) => (t ? new Date(t).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–");

function report(r) {
  const s = r.sample;
  const L = [];
  L.push("# Backtest : mise de départ en fin d'enchère", "");
  L.push(`Données : ${s.done} enchères terminées (du ${day(s.from)} au ${day(s.to)}), ${s.waiting} encore en attente, historiques de ${s.cards} cartes.`);
  L.push(`Règles : décision à T−${r.opts.lead} s, sans mise à ce moment ; on mise le prix de départ et on abandonne si quelqu'un d'autre mise ensuite (mode ${r.opts.prudent ? "prudent" : "optimiste"}). Valeur : ventes de la carte elle-même, même rareté, au moins ${r.opts.minSales} sur ${r.opts.maxAgeDays} jours, demi-vie ${r.opts.halfLifeDays} jours ; décision sur le quantile ${r.opts.quantile} (marge ≥ ${r.opts.minEdge}, ratio ≥ ${r.opts.minRatio}).`, "");
  L.push(`Taux de vente pondéré : ${pct(s.sellThrough)}.`, "");
  L.push("| Rareté | Enchères | Vendues | Sans mise à T−12 s | Abandonnées (concurrence) | Candidates avec valeur |", "|---|---|---|---|---|---|");
  for (const x of s.byRarity) L.push(`| ${x.rarity} | ${x.n} | ${pct(x.sellThrough)} | ${pct(x.candidate)} | ${pct(x.abandoned)} | ${pct(x.withValue)} |`);
  L.push("", "## Modèle de revente π (probabilité de trouver preneur)", "");
  if (!r.model) {
    L.push(`Pas assez de données : ${r.rows[0]} lignes d'entraînement et ${r.rows[1]} de test avec une valeur de référence (il en faut 40 et 20).`);
  } else {
    L.push(`Variables : constante, log(prix / V), log(durée en h), heure (sin, cos). ${r.rows[0]} lignes d'entraînement, ${r.rows[1]} de test.`, "");
    L.push("| Lien | Coefficients | Log-loss test | Référence (taux constant) |", "|---|---|---|---|");
    for (const m of r.models) L.push(`| ${m.link} | ${m.beta.map((b) => num(b, 2)).join(" ; ")} | ${num(m.loss, 3)} | ${num(m.naive, 3)} |`);
    L.push("", `Retenu : ${r.model.link}. Ratio de surenchère médian (prix final / prix de départ, ventes) : ${num(r.model.overbid, 2)}.`, "");
    L.push("Calibration sur le test (par quintile de π prédit) :", "", "| Enchères | π prédit | Vendues |", "|---|---|---|");
    for (const c of r.model.calib) L.push(`| ${c.n} | ${pct(c.predicted)} | ${pct(c.observed)} |`);
  }
  const m = r.sim;
  L.push("", `## Stratégie simulée sur le test (${r.test} enchères)`, "");
  L.push(`Candidates : ${m.candidates}, abandonnées pour concurrence : ${m.abandoned}, sans valeur de référence : ${m.noValue}, achats décidés : ${m.trades.length} (${num(m.invested)} wikibidous engagés).`);
  L.push(`Gain A (revente au prix de la prochaine vente réelle, sinon défausse ; optimiste) : ${num(m.pnlA)} wikibidous, ${pct(m.winA)} d'achats gagnants.`);
  L.push(`Gain B (remise en vente 1 h au prix V avec π, sinon défausse ; prudent) : ${m.pnlB == null ? "– (pas de modèle)" : num(m.pnlB)} wikibidous.`, "");
  if (m.trades.length) {
    L.push("| Carte | Rareté | Prix | V | Valeur prudente | Ventes | Gain A | Gain B |", "|---|---|---|---|---|---|---|---|");
    for (const t of m.trades.slice(0, 30)) L.push(`| ${t.title || "?"} | ${t.rarity} | ${t.price} | ${num(t.v)} | ${num(t.low)} | ${t.n} | ${num(t.pnlA)} | ${t.pnlB == null ? "–" : num(t.pnlB)} |`);
    L.push("");
  }
  L.push("## Sensibilité aux seuils", "", "| Ratio min | Quantile | Achats | Engagés | Gain A | Gain B | Gagnants A |", "|---|---|---|---|---|---|---|");
  for (const g of r.grid) L.push(`| ${num(g.minRatio, 1)} | ${g.quantile} | ${g.trades} | ${num(g.invested)} | ${num(g.pnlA)} | ${g.pnlB == null ? "–" : num(g.pnlB)} | ${pct(g.winA)} |`);
  L.push("", "Limites : l'historique de prix ne distingue pas les shiny ; la revente A ne compte que des ventes réussies ; B suppose une seule tentative ; les 10 emplacements de vente et le temps de présence ne sont pas encore modélisés.");
  return L.join("\n") + "\n";
}

if (require.main === module) {
  const file = process.argv[2] || DEFAULT_FILE;
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  process.stdout.write(report(run(data)));
}

module.exports = { run, report, simulate, DEFAULT_FILE };
