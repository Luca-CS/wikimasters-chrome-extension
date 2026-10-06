// Tests Node (node --test extension/tests/) du backtest du marché (market/backtest.js) sur des
// données synthétiques au format de l'export de l'extension.
const test = require("node:test");
const assert = require("node:assert/strict");
const bt = require("../../market/backtest.js");

const MIN = 60000;
const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 1, 10, 0, 0);

/** Marché simulé : chaque carte a une valeur ; une enchère se vend d'autant mieux que son prix est bas. */
function market(n = 400) {
  let seed = 3;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const cards = [];
  for (let c = 0; c < 40; c++) {
    const v = 10 + Math.round(rand() * 90);
    const sales = Array.from({ length: 12 }, (_, i) => [Math.round(v * (0.6 + rand() * 0.8)), "SR", T0 - (i + 1) * DAY, `old-${c}-${i}`]);
    cards.push({ id: `c${c}`, v, sales });
  }
  const auctions = [];
  for (let i = 0; i < n; i++) {
    const card = cards[i % cards.length];
    const price = Math.max(1, Math.round(card.v * (0.2 + rand() * 1.8)));
    const end = T0 + i * 20 * MIN;
    const pSold = 1 - Math.exp(-Math.exp(-1.5 - 1.2 * Math.log(price / card.v)));
    const isSold = rand() < pSold;
    const late = rand() < 0.3; // mise arrivée dans les 12 dernières secondes
    const bids = isSold ? [[price, late ? end - 5000 : end - 30 * MIN, "x"]] : [];
    const id = `a${i}`;
    if (isSold) card.sales.push([price, "SR", end + 4 * MIN, id]);
    auctions.push({
      id, card: card.id, rarity: "SR", title: `Carte ${card.id}`, base: price, lbase: price, cr: end - 60 * MIN, end, w: 1, state: "done",
      detail: { status: isSold ? "settled_sold" : "settled_unsold", final: isSold ? price : null, base: price, lbase: price, repricedAt: null, bids, end },
    });
  }
  return { version: 1, exportedAt: T0 + n * 20 * MIN, state: {}, auctions, cards: cards.map(({ id, sales }) => ({ id, sales, at: T0 + n * 20 * MIN })) };
}

test("backtest : sépare entraînement et test, estime π et simule la stratégie", () => {
  const r = bt.run(market());
  assert.equal(r.train + r.test, 400);
  assert.ok(r.model, "modèle de revente estimé");
  const cloglog = r.models.find((m) => m.link === "cloglog");
  assert.ok(cloglog.beta[1] < -0.5, `le prix relatif fait baisser π (β = ${cloglog.beta[1]})`);
  assert.ok(cloglog.loss < cloglog.naive, "meilleur que le taux constant");
  assert.ok(r.sim.candidates > 0 && r.sim.abandoned > 0);
  assert.ok(r.sim.trades.length > 0);
  assert.equal(r.grid.length, 8);
});

test("backtest : le rapport se génère, même sans assez de données pour π", () => {
  const md = bt.report(bt.run(market(30)));
  assert.match(md, /# Backtest/);
  assert.match(md, /Pas assez de données/);
  assert.match(bt.report(bt.run(market())), /Calibration sur le test/);
});
