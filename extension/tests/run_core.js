// Lit {cards, rules, themes, minCount, wd} en JSON sur stdin et écrit le résultat de
// l'analyse JS sur stdout. Utilisé par tests/test_wmtag.py (TestExtensionParity) pour
// vérifier que l'extension classe exactement comme la version Python.
const fs = require("fs");
const core = require("../lib/core.js");

const input = JSON.parse(fs.readFileSync(0, "utf8"));
const res = core.analyze(input);
const R = core.compileRules(input.rules);
const wdTextOf = (t) => (input.wd ? core.wdText(input.wd, t) : "");
const pick = (ms) => ms.map(({ tag, hits }) => ({ tag, hits }));

process.stdout.write(JSON.stringify({
  matches: input.cards.map((c) => pick(core.matchCard(c, R, wdTextOf(c.title)))),
  suggestions: input.cards.map((c) => pick(core.suggest(c, R, wdTextOf(c.title), core.wdNature(input.wd, c.title)))),
  themes: res.themes.map((t) => [t.name, t.n]),
  words: res.words.map((w) => [w.word, w.n]),
  wdWords: res.wdWords.map((w) => [w.word, w.n]),
  agreement: [res.agreement.total, res.agreement.ok, res.agreement.misses.map((m) => m.card.title)],
  headWords: input.cards.map((c) => core.headWord(c.desc)),
}));
