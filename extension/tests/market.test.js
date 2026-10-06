// Tests Node (node --test extension/tests/) de la logique de collecte du marché.
const test = require("node:test");
const assert = require("node:assert/strict");
const market = require("../lib/market.js");

const MIN = 60000;
const T = Date.UTC(2026, 9, 6, 12, 0, 0);
const S = { ...market.DEFAULTS, on: true };

const item = (id, rarity, extra = {}) => ({
  id,
  card_id: "c-" + id,
  seller_id: "s",
  base_amount: 10,
  listing_base_amount: 10,
  current_bid: null,
  created_at: new Date(T - 5 * MIN).toISOString(),
  end_at: new Date(T + 55 * MIN).toISOString(),
  snapshot_rarity: rarity,
  is_shiny: false,
  card: { wikipedia_title: "Titre " + id, rarity, pageviews: 1200 },
  ...extra,
});

test("mise minimale : la mise de départ, puis +10 % arrondi au-dessus et +1 au moins", () => {
  assert.equal(market.minBid(null, 25), 25);
  assert.equal(market.minBid(10, 1), 11);
  assert.equal(market.minBid(4, 1), 5);
  // Même calcul que le site : 1,1 × 100 = 110,00000000000001 en virgule flottante, donc 111.
  assert.equal(market.minBid(100, 1), 111);
  assert.equal(market.minBid(101, 1), 112);
  assert.equal(market.minBid(50, 1), 56);
});

test("échantillon : toujours les L, UR et shiny, une part des autres, avec leur poids", () => {
  const list = [item("a", "L"), item("b", "UR"), item("c", "SR", { is_shiny: true }), item("d", "SR"), item("e", "C")];
  const picked = market.sample(list, S, T, () => 0.5); // 0,5 ≥ 0,15 : les C à SR non shiny sont écartés
  assert.deepEqual(picked.map((x) => x.id), ["a", "b", "c"]);
  assert.ok(picked.every((x) => x.w === 1 && x.state === "wait" && x.tries === 0));
  const all = market.sample(list, S, T, () => 0.1);
  assert.equal(all.length, 5);
  assert.equal(all.find((x) => x.id === "d").w, 1 / 0.15);
});

test("échantillon : résultat lu 3 à 8 min après la fin", () => {
  const end = T + 55 * MIN;
  assert.equal(market.sample([item("a", "L")], S, T, () => 0)[0].due, end + 3 * MIN);
  const late = market.sample([item("a", "L")], S, T, () => 0.999)[0].due;
  assert.ok(late > end + 7.9 * MIN && late <= end + 8 * MIN);
});

test("annonce réduite : champs utiles à l'analyse", () => {
  const rec = market.listing(item("a", "UR", { base_amount: 30, listing_base_amount: 60, is_shiny: true }), T);
  assert.equal(rec.card, "c-a");
  assert.deepEqual([rec.base, rec.lbase, rec.shiny, rec.rarity, rec.pageviews], [30, 60, true, "UR", 1200]);
  assert.equal(rec.end, T + 55 * MIN);
});

test("détail : terminé si réglé, relu 5 min plus tard sinon (5 fois au plus)", () => {
  const rec = { id: "a", tries: 0, state: "wait", due: T };
  const active = { auction: { status: "active" }, bids: [] };
  const again = market.afterDetail(rec, active, T);
  assert.deepEqual([again.state, again.tries, again.due], ["wait", 1, T + 5 * MIN]);
  assert.equal(market.afterDetail({ ...rec, tries: 5 }, active, T).state, "done");
  const sold = {
    auction: { status: "settled_sold", final_price: 22, base_amount: 10, listing_base_amount: 10, end_at: new Date(T).toISOString() },
    bids: [{ amount: 10, placed_at: new Date(T - 30000).toISOString(), bidder_id: "x" }, { amount: 22, placed_at: new Date(T - 5000).toISOString(), bidder_id: "y" }],
  };
  const done = market.afterDetail(rec, sold, T + 4 * MIN);
  assert.equal(done.state, "done");
  assert.equal(done.detail.final, 22);
  assert.deepEqual(done.detail.bids[1], [22, T - 5000, "y"]);
});

test("historique de prix : relu seulement s'il date de plus de 6 h avant la fin", () => {
  const rec = { end: T };
  assert.equal(market.needsSales(null, rec, S), true);
  assert.equal(market.needsSales({ at: T - 7 * 60 * MIN }, rec, S), true);
  assert.equal(market.needsSales({ at: T - 5 * 60 * MIN }, rec, S), false);
});

test("réponses : 403 = trop de requêtes, 429 = ralentir, 401 = pas connecté", () => {
  assert.deepEqual([200, 403, 429, 401, 404, 500, 0].map(market.classify), ["ok", "blocked", "slow", "auth", "gone", "error", "error"]);
});

test("403 : pause de 24 h et rythme divisé par deux", () => {
  const s = market.account(S, "blocked", T);
  assert.equal(s.backoffUntil, T + 24 * 60 * MIN);
  assert.equal(s.everySec, 120);
  assert.equal(market.canRequest(s, T + 23 * 60 * MIN).why, "pause");
  assert.equal(market.canRequest(s, T + 24 * 60 * MIN).ok, true);
});

test("deuxième 403 en moins de 7 jours : collecte arrêtée pour de bon", () => {
  const first = market.account(S, "blocked", T);
  const again = market.account({ ...first, backoffUntil: null }, "blocked", T + 3 * 24 * 60 * MIN);
  assert.equal(again.on, false);
  assert.equal(market.canRequest(again, T + 4 * 24 * 60 * MIN).why, "off");
  const later = market.account({ ...first, backoffUntil: null }, "blocked", T + 8 * 24 * 60 * MIN);
  assert.equal(later.on, true); // plus de 7 jours après : nouvelle pause de 24 h seulement
});

test("heures actives : pas de requêtes la nuit (heure locale)", () => {
  const at = (h) => new Date(2026, 9, 6, h, 30).getTime();
  assert.equal(market.canRequest(S, at(3)).why, "hours");
  assert.equal(market.canRequest(S, at(8)).why, "hours");
  assert.equal(market.canRequest(S, at(9)).ok, true);
  assert.equal(market.canRequest(S, at(23)).ok, true);
  assert.equal(market.canRequest({ ...S, hours: [0, 24] }, at(3)).ok, true);
});

test("arrêt : collecte coupée avec la raison", () => {
  const s = market.stop(S, "sanction", T);
  assert.deepEqual([s.on, s.lastError, s.stoppedAt], [false, "sanction", T]);
});

test("erreurs : pause seulement à partir de 3 de suite, remise à zéro au premier succès", () => {
  let s = market.account(S, "error", T);
  s = market.account(s, "error", T + MIN);
  assert.equal(s.backoffUntil, undefined);
  s = market.account(s, "error", T + 2 * MIN);
  assert.equal(s.backoffUntil, T + 2 * MIN + 15 * MIN);
  assert.equal(market.account(s, "ok", T + 20 * MIN).errors, 0);
});

test("garde-fous : arrêt, quota du jour, espacement", () => {
  assert.equal(market.canRequest({ ...S, on: false }, T).why, "off");
  const day = market.dayKey(T);
  assert.equal(market.canRequest({ ...S, today: { day, n: S.dailyCap } }, T).why, "cap");
  assert.equal(market.canRequest({ ...S, today: { day: "autre jour", n: S.dailyCap } }, T).ok, true);
  assert.equal(market.canRequest({ ...S, lastAt: T - 30000 }, T).why, "spacing");
  assert.equal(market.canRequest({ ...S, lastAt: T - 50000 }, T).ok, true);
});

test("prochaine requête : résultat échu, puis nouvelles annonces, puis historique de prix", () => {
  const q = { due: "a", waiting: 10, todo: "c" };
  assert.deepEqual(market.nextTask(q, S, T), { kind: "detail", id: "a" });
  assert.deepEqual(market.nextTask({ ...q, due: null }, S, T), { kind: "list" });
  const listed = { ...S, lastListAt: T - 5 * MIN };
  assert.deepEqual(market.nextTask({ ...q, due: null }, listed, T), { kind: "sales", id: "c" });
  assert.deepEqual(market.nextTask({ due: null, waiting: S.maxWaiting, todo: null }, S, T), null);
  assert.equal(market.urlFor({ kind: "sales", id: "c" }), "https://www.wiki-masters.com/api/marketplace/cards/c/sales");
});
