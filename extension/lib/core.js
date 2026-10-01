// Moteur de classement : portage fidèle de wmtag/classify.py (mêmes règles, mêmes résultats).
// Script classique (pas de module) : utilisable dans le content script, les pages de
// l'extension et Node (tests de parité).
(function (root) {
  const WMT = (root.WMT = root.WMT || {});

  const RARITIES = ["L", "UR", "SR", "R", "PC", "C"];

  /** minuscules, sans accents, apostrophes unifiées, espaces compactés. */
  function norm(s) {
    s = String(s || "").replace(/’/g, "'").replace(/œ/g, "oe").replace(/Œ/g, "oe");
    s = s.normalize("NFKD").replace(/\p{M}/gu, "");
    return s.toLowerCase().replace(/\s+/g, " ").trim();
  }

  const WORD = "[\\p{L}\\p{N}_]";

  /** Compile un motif de rules.toml : regex sur texte normalisé, bornée à des mots entiers. */
  function compilePattern(p) {
    const body = norm(p);
    try {
      return new RegExp(`(?<!${WORD})(?:${body})(?!${WORD})`, "u");
    } catch {
      // Le mode "u" refuse certains échappements tolérés par Python (ex. \-) : repli ASCII.
      return new RegExp(`(?<![A-Za-z0-9_])(?:${body})(?![A-Za-z0-9_])`);
    }
  }

  /** Renvoie le message d'erreur si le motif est invalide, sinon null. */
  function patternError(p) {
    try {
      compilePattern(p);
      return null;
    } catch (e) {
      return e.message;
    }
  }

  function compileRules(list) {
    return (list || []).map((r) => ({
      name: r.name,
      color: r.color,
      raw: r,
      kw: (r.keywords || []).flatMap((p) => (patternError(p) ? [] : [compilePattern(p)])),
      tkw: (r.titleKeywords || []).flatMap((p) => (patternError(p) ? [] : [compilePattern(p)])),
    }));
  }

  /** Étiquettes qui matchent, triées par score décroissant puis ordre des règles. */
  function matchCard(card, rules, extraText = "") {
    const desc = norm(card.desc);
    const extra = norm(extraText);
    const title = norm(card.title);
    const out = [];
    for (const rule of rules) {
      const hits = new Set();
      for (const re of rule.kw) {
        const m = re.exec(desc) || (extra ? re.exec(extra) : null);
        if (m) hits.add(m[0]);
      }
      for (const re of rule.tkw) {
        const m = re.exec(title);
        if (m) hits.add("titre:" + m[0]);
      }
      if (hits.size) out.push({ tag: rule.name, score: hits.size, hits: [...hits].sort() });
    }
    out.sort((a, b) => b.score - a.score); // tri stable => ordre des règles en cas d'égalité
    return out;
  }

  // --- Wikidata (cache {titles, labels} partagé avec la version Python) -------------

  function wdLabels(cache, title) {
    const e = (cache && cache.titles && cache.titles[title]) || {};
    const lab = (q) => (cache.labels && cache.labels[q]) || q;
    return [...(e.P31 || []).map(lab), ...(e.P106 || []).map(lab)];
  }

  const wdText = (cache, title) => wdLabels(cache, title).join(" ; ");

  // --- Motifs récurrents (mot de tête de la description) ---------------------------

  const STOP = new Set([
    "le", "la", "les", "l", "un", "une", "des", "de", "du", "d", "et", "en", "a",
    "ancien", "ancienne", "anciens", "anciennes", "grand", "grande", "petit", "petite",
    "celebre", "premier", "premiere", "page", "terme", "nom", "type",
  ]);
  const FEM = [["trice", "teur"], ["euse", "eur"], ["ienne", "ien"], ["ière", "ier"], ["iere", "ier"], ["enne", "en"]];

  /** Premier mot significatif, au masculin singulier approx. ('actrice britannique' -> 'acteur'). */
  function headWord(description) {
    for (let tok of norm(description).match(/[a-z][a-z'-]*/g) || []) {
      tok = tok.split("'").pop();
      if (STOP.has(tok) || tok.length < 3) continue;
      for (const [fem, masc] of FEM) {
        if (tok.endsWith(fem) && tok.length > fem.length + 1) {
          tok = tok.slice(0, -fem.length) + masc;
          break;
        }
      }
      if (tok.endsWith("s") && tok.length > 4 && !tok.endsWith("ss")) tok = tok.slice(0, -1);
      return tok;
    }
    return null;
  }

  function groupBy(cards, keysOf, minCount) {
    const by = new Map();
    for (const c of cards) for (const k of keysOf(c)) by.has(k) ? by.get(k).push(c) : by.set(k, [c]);
    return [...by]
      .filter(([, cs]) => cs.length >= minCount)
      .map(([word, cs]) => ({ word, n: cs.length, cards: cs }))
      .sort((a, b) => b.n - a.n);
  }

  /** Thèmes candidats + mots récurrents, sur les cartes sans étiquette ni suggestion. */
  function suggestThemes(untagged, themes, activeTags, minCount, wdTextOf, wdLabelsOf) {
    const active = new Set([...activeTags].map(norm));
    const byTheme = new Map();
    for (const c of untagged) {
      for (const m of matchCard(c, themes, wdTextOf(c.title))) {
        byTheme.has(m.tag) ? byTheme.get(m.tag).push(c) : byTheme.set(m.tag, [c]);
      }
    }
    const ruleByName = new Map(themes.map((t) => [t.name, t]));
    const candidates = [...byTheme]
      .filter(([name, cs]) => cs.length >= minCount && !active.has(norm(name)))
      .map(([name, cs]) => ({ name, n: cs.length, cards: cs, rule: ruleByName.get(name).raw }))
      .sort((a, b) => b.n - a.n);
    const words = groupBy(untagged, (c) => {
      const hw = headWord(c.desc);
      return hw ? [hw] : [];
    }, minCount);
    const wdWords = wdLabelsOf ? groupBy(untagged, (c) => [...new Set(wdLabelsOf(c.title))], minCount) : [];
    return { candidates, words, wdWords };
  }

  /** Compare les suggestions aux étiquettes déjà posées à la main. */
  function agreement(cards, rules, wdTextOf) {
    const active = new Set(rules.map((r) => r.name));
    const tagged = cards.filter((c) => c.tags.some((t) => active.has(t)));
    let ok = 0;
    const misses = [];
    for (const c of tagged) {
      const pred = new Set(matchCard(c, rules, wdTextOf(c.title)).map((m) => m.tag));
      const real = c.tags.filter((t) => active.has(t));
      if (real.some((t) => pred.has(t))) ok++;
      else misses.push({ card: c, real: [...new Set(real)].sort(), pred: [...pred].sort() });
    }
    return { total: tagged.length, ok, misses };
  }

  /** Analyse complète d'un scan (équivalent de python -m wmtag). */
  function analyze({ cards, rules, themes, minCount, wd }) {
    const R = compileRules(rules);
    const T = compileRules(themes);
    const wdTextOf = (t) => (wd ? wdText(wd, t) : "");
    const wdLabelsOf = wd ? (t) => wdLabels(wd, t) : null;

    const todo = new Map(R.map((r) => [r.name, []]));
    const rows = [];
    const unmatched = [];
    for (const c of cards) {
      const matches = matchCard(c, R, wdTextOf(c.title));
      rows.push({ card: c, matches });
      if (c.tags.length) continue;
      for (const m of matches) {
        todo.get(m.tag).push({ card: c, hits: m.hits, others: matches.filter((o) => o.tag !== m.tag).map((o) => o.tag) });
      }
      if (!matches.length) unmatched.push(c);
    }
    const rep = suggestThemes(unmatched, T, R.map((r) => r.name), minCount, wdTextOf, wdLabelsOf);
    const untagged = cards.filter((c) => !c.tags.length);
    return {
      rows,
      todo: R.map((r) => ({ tag: r.name, color: r.color, items: todo.get(r.name) })),
      unmatched,
      themes: rep.candidates,
      words: rep.words,
      wdWords: rep.wdWords,
      agreement: agreement(cards, R, wdTextOf),
      stats: {
        cards: cards.length,
        tagged: cards.length - untagged.length,
        suggested: rows.filter((r) => !r.card.tags.length && r.matches.length).length,
        unmatched: unmatched.length,
      },
    };
  }

  WMT.core = { RARITIES, norm, compilePattern, patternError, compileRules, matchCard, headWord, wdLabels, wdText, suggestThemes, agreement, analyze };
  if (typeof module !== "undefined") module.exports = WMT.core;
})(globalThis);
