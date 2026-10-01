// Tests Node du rythme de défilement (node --test extension/tests/).
const test = require("node:test");
const assert = require("node:assert/strict");
const { createRhythm, readingMs } = require("../lib/rhythm.js");

// Générateur pseudo-aléatoire à graine (mulberry32) : tests reproductibles.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sample = (n, opts) => {
  const r = createRhythm({ rng: seeded(42), ...opts });
  return Array.from({ length: n }, () => r.factor());
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

test("facteur moyen proche de 1 et borné", () => {
  const xs = sample(20000);
  assert.ok(Math.abs(mean(xs) - 1) < 0.02, `moyenne ${mean(xs)}`);
  assert.ok(xs.every((x) => x >= 0.6 && x <= 1.8));
  assert.ok(new Set(xs.map((x) => x.toFixed(3))).size > 1000, "pas de valeur constante");
});

test("délais successifs corrélés (rythme qui dérive, pas un bruit blanc)", () => {
  const xs = sample(20000, { phi: 0.65 }).map(Math.log);
  const m = mean(xs);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    den += (xs[i] - m) ** 2;
    if (i) num += (xs[i] - m) * (xs[i - 1] - m);
  }
  const lag1 = num / den;
  assert.ok(lag1 > 0.5 && lag1 < 0.8, `autocorrélation ${lag1}`);
  const white = sample(20000, { phi: 0 }).map(Math.log);
  const mw = mean(white);
  let nw = 0;
  let dw = 0;
  for (let i = 0; i < white.length; i++) {
    dw += (white[i] - mw) ** 2;
    if (i) nw += (white[i] - mw) * (white[i - 1] - mw);
  }
  assert.ok(Math.abs(nw / dw) < 0.05, "phi = 0 redonne un bruit blanc");
});

test("temps de lecture selon la carte", () => {
  assert.equal(readingMs(null), 0);
  assert.equal(readingMs({ title: "Musc", desc: "matière première", rarity: "C" }), 0);
  assert.equal(readingMs({ title: "X", desc: "", rarity: "L" }), 3000);
  assert.equal(readingMs({ title: "X", desc: "", rarity: "UR" }), 2500);
  const long = readingMs({ title: "Titre", desc: "a".repeat(400), rarity: "R" });
  assert.equal(long, 1200); // plafonné
});
