// Tests Node de la config stockée (migration des réglages), avec un faux chrome.storage.
const test = require("node:test");
const assert = require("node:assert/strict");

const data = {};
globalThis.chrome = {
  storage: {
    local: {
      async get(key) {
        return key in data ? { [key]: structuredClone(data[key]) } : {};
      },
      async set(obj) {
        Object.assign(data, structuredClone(obj));
      },
      async remove(keys) {
        for (const k of [].concat(keys)) delete data[k];
      },
    },
    onChanged: { addListener() {} },
  },
};
require("../lib/defaults.js");
require("../lib/store.js");
const { store, defaults } = globalThis.WMT;

test("premier lancement : config par défaut enregistrée", async () => {
  delete data.config;
  const c = await store.getConfig();
  assert.equal(c.version, 3);
  assert.equal(c.settings.revealDelay, 200);
  assert.equal(data.config.version, 3);
  assert.ok(c.rules.some((r) => r.shiny && r.name === "Shiny"));
});

test("migration v1 → v2 : l'ancien délai par défaut (1,5 s) passe à 0,2 s", async () => {
  const old = defaults.config();
  data.config = { ...old, version: 1, settings: { ...old.settings, revealDelay: 1500, accountType: "pro" } };
  const c = await store.getConfig();
  assert.equal(c.settings.revealDelay, 200);
  assert.equal(c.settings.accountType, "pro"); // les autres réglages sont conservés
  assert.equal(data.config.version, 3);
});

// Règle Ski telle qu'elle était dans les valeurs par défaut de la v2.
const SKI_V2 = {
  name: "Ski", color: "#123456",
  keywords: ["ski", "skis", "skieur", "skieuse", "ski alpin", "ski de fond", "saut a ski", "station de ski", "slalom",
    "slalom geant", "super-g", "biathl\\w*", "combine nordique", "snowboard\\w*"],
  titleKeywords: ["^ski ", "coupe du monde de ski"],
};

function v2Config(rules) {
  const c = defaults.config();
  return {
    ...c, version: 2, rules,
    settings: { ...c.settings, emailFull: true, ntfyToken: "tk_x", ntfyTopic: "t", accountType: "pro" },
  };
}

test("migration v2 → v3 : règle jamais modifiée remplacée, Shiny ajoutée, plus d'e-mail", async () => {
  assert.equal(store.fingerprint(SKI_V2), "ynyf73");
  data.config = v2Config([SKI_V2]);
  const c = await store.getConfig();
  const ski = c.rules.find((r) => r.name === "Ski");
  const dflt = defaults.config().rules.find((r) => r.name === "Ski");
  assert.deepEqual(ski.keywords, dflt.keywords);
  assert.equal(ski.color, "#123456"); // couleur conservée
  assert.ok(c.rules.some((r) => r.shiny));
  assert.equal(c.settings.accountType, "pro");
  for (const k of ["emailFull", "ntfyToken", "ntfyTopic"]) assert.ok(!(k in data.config.settings), k);
});

test("migration v2 → v3 : règle modifiée à la main, tes motifs restent et les nouveaux s'ajoutent", async () => {
  data.config = v2Config([{ ...SKI_V2, keywords: ["mon motif"] }, { name: "Shiny", color: "#000000", keywords: [] }]);
  const c = await store.getConfig();
  const ski = c.rules.find((r) => r.name === "Ski");
  assert.equal(ski.keywords[0], "mon motif");
  assert.ok(ski.keywords.includes("fondeur"));
  const shiny = c.rules.filter((r) => r.name === "Shiny");
  assert.equal(shiny.length, 1); // l'étiquette existante devient l'étiquette shiny, sans doublon
  assert.equal(shiny[0].shiny, true);
});

test("migration v1 → v2 : un délai choisi à la main est conservé", async () => {
  const old = defaults.config();
  data.config = { ...old, version: 1, settings: { ...old.settings, revealDelay: 900 } };
  assert.equal((await store.getConfig()).settings.revealDelay, 900);
});
