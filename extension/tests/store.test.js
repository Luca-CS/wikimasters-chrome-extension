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
  assert.equal(c.version, 2);
  assert.equal(c.settings.revealDelay, 200);
  assert.equal(data.config.version, 2);
});

test("migration v1 → v2 : l'ancien délai par défaut (1,5 s) passe à 0,2 s", async () => {
  const old = defaults.config();
  data.config = { ...old, version: 1, settings: { ...old.settings, revealDelay: 1500, accountType: "pro" } };
  const c = await store.getConfig();
  assert.equal(c.settings.revealDelay, 200);
  assert.equal(c.settings.accountType, "pro"); // les autres réglages sont conservés
  assert.equal(data.config.version, 2);
});

test("migration v1 → v2 : un délai choisi à la main est conservé", async () => {
  const old = defaults.config();
  data.config = { ...old, version: 1, settings: { ...old.settings, revealDelay: 900 } };
  assert.equal((await store.getConfig()).settings.revealDelay, 900);
});
