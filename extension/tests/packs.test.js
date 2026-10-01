// Tests Node (node --test extension/tests/) de l'estimation des paquets et de la lecture des minuteurs.
const test = require("node:test");
const assert = require("node:assert/strict");
const packs = require("../lib/packs.js");
require("../lib/dom.js"); // définit WMT.dom (parseDuration n'a pas besoin du DOM)

const MIN = 60000;
const T = Date.UTC(2026, 9, 1, 12, 0, 0);

test("durée de recharge selon le type de compte", () => {
  assert.equal(packs.cooldownMs({ accountType: "free" }), 10 * MIN);
  assert.equal(packs.cooldownMs({ accountType: "pro" }), 3 * MIN);
  assert.equal(packs.cooldownMs({}), 10 * MIN);
});

test("stock plein : rien à attendre", () => {
  const est = packs.estimate({ count: 10, max: 10, at: T, nextMs: null }, 10 * MIN, T + 99 * MIN);
  assert.deepEqual([est.count, est.nextAt], [10, null]);
});

test("sans minuteur : estimation prudente (recharge complète pour le prochain paquet)", () => {
  const s = { count: 7, max: 10, at: T, nextMs: null };
  const C = 10 * MIN;
  assert.deepEqual(packs.estimate(s, C, T), { count: 7, max: 10, nextAt: T + C, fullAt: T + 3 * C, exact: false });
  assert.equal(packs.estimate(s, C, T + C).count, 8);
  assert.equal(packs.estimate(s, C, T + 3 * C - 1).count, 9);
  const full = packs.estimate(s, C, T + 3 * C);
  assert.deepEqual([full.count, full.nextAt], [10, null]);
  assert.equal(packs.estimate(s, C, T + 50 * C).count, 10);
});

test("avec minuteur : le premier paquet arrive à la fin du minuteur", () => {
  const C = 3 * MIN;
  const s = { count: 7, max: 10, at: T, nextMs: 4 * MIN };
  const est = packs.estimate(s, C, T);
  assert.deepEqual([est.nextAt, est.fullAt, est.exact], [T + 4 * MIN, T + 4 * MIN + 2 * C, true]);
  assert.equal(packs.estimate(s, C, T + 4 * MIN).count, 8);
  assert.equal(packs.estimate(s, C, T + 4 * MIN + 2 * C).count, 10);
});

test("lecture des minuteurs affichés", () => {
  const { parseDuration } = globalThis.WMT.dom;
  assert.equal(parseDuration("1:43"), MIN + 43000); // format réel : « Prochain dans 1:43 »
  assert.equal(parseDuration("04:12"), 4 * MIN + 12000);
  assert.equal(parseDuration("Prochain paquet dans 04:12"), 4 * MIN + 12000);
  assert.equal(parseDuration("1:02:03"), 3723000);
  assert.equal(parseDuration("Prochain paquet dans 4 min 12 s"), 4 * MIN + 12000);
  assert.equal(parseDuration("Recharge dans 9 min"), 9 * MIN);
  assert.equal(parseDuration("Page 2 / 27"), null);
  assert.equal(parseDuration("10 / 10"), null);
  assert.equal(parseDuration("Découvrez 5 nouvelles cartes Wikipédia"), null);
});

test("description courte", () => {
  assert.match(packs.describe(null), /pas encore de relevé/);
  assert.match(packs.describe({ count: 10, max: 10 }), /^plein/);
  assert.match(packs.describe({ count: 7, max: 10, fullAt: T + 70 * MIN }, T), /dans 1 h 10/);
});
