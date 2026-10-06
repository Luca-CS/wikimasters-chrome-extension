// Tests Node (node --test extension/tests/) de la stratégie « mise de départ en fin d'enchère ».
const test = require("node:test");
const assert = require("node:assert/strict");
const st = require("../lib/strategy.js");

const S = 1000;
const DAY = 86400000;
const END = Date.UTC(2026, 9, 6, 12, 0, 0);
const O = st.DEFAULTS;

const rec = (bids, extra = {}) => ({ end: END, lbase: 10, base: 10, detail: { lbase: 10, base: 10, bids, ...extra } });

test("candidate : aucune mise avant T − 12 s", () => {
  assert.deepEqual(st.candidate(rec([]), O), { t: END - 12 * S, price: 10 });
  assert.equal(st.candidate(rec([[10, END - 60 * S, "x"]]), O), null);
  assert.ok(st.candidate(rec([[10, END - 5 * S, "x"]]), O)); // mise arrivée après notre moment
});

test("prix de départ baissé par le vendeur avant notre moment", () => {
  const r = rec([], { lbase: 60, base: 30, repricedAt: END - 600 * S });
  assert.equal(st.candidate(r, O).price, 30);
  const late = rec([], { lbase: 60, base: 30, repricedAt: END - 5 * S });
  assert.equal(st.candidate(late, O).price, 60);
});

test("issue : gagnée seule, abandonnée dès qu'un autre mise après nous", () => {
  assert.equal(st.outcome(rec([]), O).status, "won");
  assert.equal(st.outcome(rec([[10, END - 5 * S, "x"]]), O).status, "abandoned");
  // Mode optimiste : une mise au prix de départ après nous n'aurait pas pu passer (il fallait 11).
  assert.equal(st.outcome(rec([[10, END - 5 * S, "x"]]), { ...O, prudent: false }).status, "won");
  assert.equal(st.outcome(rec([[11, END - 5 * S, "x"]]), { ...O, prudent: false }).status, "abandoned");
  assert.equal(st.outcome(rec([[10, END - 60 * S, "x"]]), O), null);
});

test("valeur : seulement les ventes de la carte, de même rareté, avant t, hors l'enchère étudiée", () => {
  const sales = [
    [20, "UR", END - 1 * DAY, "a"], [30, "UR", END - 2 * DAY, "b"], [25, "UR", END - 3 * DAY, "c"],
    [500, "L", END - 1 * DAY, "d"], // autre rareté
    [40, "UR", END + 1 * DAY, "e"], // après t
    [22, "UR", END - 4 * DAY, "f"], [28, "UR", END - 5 * DAY, "g"],
    [99, "UR", END - 1 * DAY, "moi"], // la vente de l'enchère étudiée
  ];
  const v = st.value(sales, "UR", END, O, "moi");
  assert.equal(v.n, 5);
  assert.equal(v.v, 25);
  assert.ok(v.low <= v.v);
  assert.equal(st.value(sales, "UR", END, { ...O, minSales: 6 }, "moi"), null);
  assert.equal(st.value(sales, "L", END, O), null);
});

test("valeur : les ventes récentes pèsent plus", () => {
  const old = Array.from({ length: 5 }, (_, i) => [100, "SR", END - (50 + i) * DAY, "o" + i]);
  const recent = Array.from({ length: 4 }, (_, i) => [10, "SR", END - (1 + i) * DAY, "r" + i]);
  assert.equal(st.value([...old, ...recent], "SR", END, O).v, 10);
});

test("décision : marge et ratio minimums sur la valeur prudente", () => {
  assert.equal(st.decide(10, { low: 20 }, O).go, true);
  assert.equal(st.decide(10, { low: 12 }, O).go, false); // ratio 1,2
  assert.equal(st.decide(2, { low: 5 }, O).go, false); // +3 seulement
  assert.equal(st.decide(10, null, O).go, false);
});

test("régression : retrouve les coefficients d'un modèle simulé (cloglog et logit)", () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const link of ["cloglog", "logit"]) {
    const truth = [-0.5, -1.5, 0.8];
    const X = [];
    const y = [];
    for (let i = 0; i < 6000; i++) {
      const x = [1, rand() * 4 - 2, rand() * 2 - 1];
      X.push(x);
      y.push(rand() < st.predict(truth, x, link) ? 1 : 0);
    }
    const beta = st.fit(X, y, null, { link });
    beta.forEach((b, i) => assert.ok(Math.abs(b - truth[i]) < 0.15, `${link} β${i} = ${b.toFixed(3)} au lieu de ${truth[i]}`));
  }
});

test("variables d'une mise en vente", () => {
  const x = st.features(20, 10, 60, 6);
  assert.equal(x.length, 5);
  assert.ok(Math.abs(x[1] - Math.log(2)) < 1e-12);
  assert.equal(x[2], 0);
  assert.ok(Math.abs(x[3] - 1) < 1e-12);
});
