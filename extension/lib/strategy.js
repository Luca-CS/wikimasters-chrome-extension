// Stratégie « mise de départ en fin d'enchère » (méthode 3), pour le backtest et l'aide à la
// décision. L'exécution reste manuelle : rien ici ne mise.
//
// Première version, volontairement simple :
// - on ne vise que les enchères SANS mise à T − lead secondes (avant la fenêtre de prolongation) ;
// - on mise exactement le prix de départ en vigueur à ce moment ;
// - si quelqu'un d'autre mise ensuite, on abandonne (pas de guerre d'enchères ; la mise est
//   remboursée par le site) ;
// - la valeur d'une carte ne vient que de SES ventes de même rareté : les cartes d'une même rareté
//   sont trop dispersées (jusqu'à 5 à 10 fois autour de la médiane) pour se servir de référence.
//
// Fonctions pures sur les enregistrements de la collecte (voir lib/market.js) :
//   rec = {end, lbase, base, …, detail: {base, lbase, repricedAt, bids: [[montant, t, enchérisseur]], status, final}}
//   sales = [[prix, rareté, t, id d'enchère]] (historique de la « Vue du marché »)
(function (root) {
  const WMT = (root.WMT = root.WMT || {});
  const DAY = 86400000;

  const DEFAULTS = {
    lead: 12, // secondes avant la fin prévue (la fenêtre de prolongation est de 10 s)
    minSales: 5, // en dessous, pas de valeur : on passe
    maxAgeDays: 60, // ventes plus anciennes ignorées
    halfLifeDays: 14, // poids d'une vente divisé par deux tous les 14 jours
    quantile: 0.25, // valeur prudente : quantile bas des ventes pondérées
    minEdge: 5, // gain minimal en wikibidous (valeur prudente − prix)
    minRatio: 1.3, // et valeur prudente ≥ 1,3 × prix
    prudent: true, // toute mise d'un autre après la nôtre compte comme une surenchère
  };

  /** Prix de départ en vigueur à l'instant t (le vendeur a pu le baisser en cours d'enchère). */
  function priceAt(rec, t) {
    const d = rec.detail || {};
    const lbase = d.lbase ?? rec.lbase;
    const base = d.base ?? rec.base;
    if (base !== lbase && d.repricedAt && d.repricedAt <= t) return base;
    return lbase;
  }

  const bids = (rec) => ((rec.detail && rec.detail.bids) || []).slice().sort((a, b) => a[1] - b[1]);

  /** Candidate à T − lead : {t, price}, ou null s'il y avait déjà une mise. `rec.end` = fin prévue. */
  function candidate(rec, opts = DEFAULTS) {
    const t = rec.end - opts.lead * 1000;
    if (bids(rec).some((b) => b[1] < t)) return null;
    return { t, price: priceAt(rec, t) };
  }

  /**
   * Issue simulée de notre mise au prix de départ : « won » au prix, « abandoned » si un autre a
   * misé après nous (en mode prudent, toute mise ; sinon seulement une mise au-dessus du prix de
   * départ, puisqu'il aurait dû nous surenchérir), null si l'enchère n'était pas candidate.
   */
  function outcome(rec, opts = DEFAULTS) {
    const c = candidate(rec, opts);
    if (!c) return null;
    const later = bids(rec).filter((b) => b[1] >= c.t);
    const rival = later.some((b) => (opts.prudent ? true : b[0] > c.price));
    return rival ? { status: "abandoned", t: c.t, price: c.price } : { status: "won", t: c.t, price: c.price };
  }

  /** Quantile pondéré (valeurs triées avec leurs poids). */
  function wquantile(pairs, q) {
    const s = pairs.slice().sort((a, b) => a[0] - b[0]);
    const total = s.reduce((x, p) => x + p[1], 0);
    let acc = 0;
    for (const [v, w] of s) {
      acc += w;
      if (acc >= q * total - 1e-9) return v;
    }
    return s.length ? s[s.length - 1][0] : null;
  }

  /**
   * Valeur de référence d'une carte à l'instant t, à partir de ses seules ventes de même rareté :
   * {v (médiane pondérée), low (quantile prudent), n, spread (écart absolu médian / v)}, ou null
   * avec moins de minSales ventes. `exclude` = id de l'enchère étudiée (sa propre vente ne compte pas).
   */
  function value(sales, rarity, t, opts = DEFAULTS, exclude = null) {
    const pts = (sales || []).filter((s) => s[1] === rarity && s[2] < t && t - s[2] <= opts.maxAgeDays * DAY && s[3] !== exclude);
    if (pts.length < opts.minSales) return null;
    const pairs = pts.map((s) => [s[0], Math.pow(0.5, (t - s[2]) / (opts.halfLifeDays * DAY))]);
    const v = wquantile(pairs, 0.5);
    const mad = wquantile(pairs.map(([x, w]) => [Math.abs(x - v), w]), 0.5);
    return { v, low: wquantile(pairs, opts.quantile), n: pts.length, spread: v ? mad / v : null };
  }

  /** Décision simple (en attendant le modèle de revente) : la valeur prudente dépasse nettement le prix. */
  function decide(price, val, opts = DEFAULTS) {
    if (!val || !(price > 0)) return { go: false, edge: null, ratio: null };
    const edge = val.low - price;
    const ratio = val.low / price;
    return { go: edge >= opts.minEdge && ratio >= opts.minRatio, edge, ratio };
  }

  // --- Probabilité de vendre une remise en vente : régression binaire ---------------------------
  // π = P(au moins une mise avant la fin). Lien « cloglog » par défaut : si les mises arrivent
  // comme un processus de Poisson d'intensité A·e^(−k·δ) (Avellaneda–Stoikov) pendant une durée d,
  // alors π = 1 − exp(−exp(log A + log d − k·δ)), exactement ce lien. « logit » reste disponible.

  const links = {
    logit: { inv: (e) => 1 / (1 + Math.exp(-e)), d: (e) => { const p = 1 / (1 + Math.exp(-e)); return p * (1 - p); } },
    cloglog: { inv: (e) => 1 - Math.exp(-Math.exp(e)), d: (e) => Math.exp(e - Math.exp(e)) },
  };

  const dot = (b, x) => x.reduce((s, xi, i) => s + b[i] * xi, 0);

  /** Résout A·x = b (petit système, élimination de Gauss avec pivot partiel). */
  function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) {
        if (r === c || !M[c][c]) continue;
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((row, i) => row[n] / row[i]);
  }

  /**
   * Maximum de vraisemblance pondéré (Newton / IRLS) avec une petite pénalité L2 (hors constante).
   * X : lignes de variables (la 1re colonne = 1), y : 0/1, w : poids d'échantillonnage.
   */
  function fit(X, y, w = null, { link = "cloglog", l2 = 1e-3, iters = 50 } = {}) {
    const L = links[link];
    const k = X[0].length;
    let beta = new Array(k).fill(0);
    if (link === "cloglog") beta[0] = -1; // départ raisonnable (π ≈ 0,3)
    for (let it = 0; it < iters; it++) {
      const H = Array.from({ length: k }, () => new Array(k).fill(0));
      const g = new Array(k).fill(0);
      for (let i = 0; i < X.length; i++) {
        const e = dot(beta, X[i]);
        const p = Math.min(1 - 1e-9, Math.max(1e-9, L.inv(e)));
        const dp = Math.max(1e-12, L.d(e));
        const wi = w ? w[i] : 1;
        const s = (wi * (y[i] - p) * dp) / (p * (1 - p)); // score
        const h = (wi * dp * dp) / (p * (1 - p)); // information de Fisher
        for (let a = 0; a < k; a++) {
          g[a] += s * X[i][a];
          for (let b = 0; b < k; b++) H[a][b] += h * X[i][a] * X[i][b];
        }
      }
      for (let a = 1; a < k; a++) {
        g[a] -= l2 * beta[a];
        H[a][a] += l2;
      }
      const step = solve(H, g);
      beta = beta.map((b, i) => b + step[i]);
      if (Math.max(...step.map(Math.abs)) < 1e-8) break;
    }
    return beta;
  }

  const predict = (beta, x, link = "cloglog") => links[link].inv(dot(beta, x));

  /** Variables d'une mise en vente : constante, log(prix / valeur), log(durée en h), heure (sin, cos). */
  function features(price, v, durationMin, hour) {
    const a = (2 * Math.PI * hour) / 24;
    return [1, Math.log(price / v), Math.log(durationMin / 60), Math.sin(a), Math.cos(a)];
  }

  WMT.strategy = { DEFAULTS, priceAt, candidate, outcome, wquantile, value, decide, fit, predict, features, links };
  if (typeof module !== "undefined") module.exports = WMT.strategy;
})(globalThis);
