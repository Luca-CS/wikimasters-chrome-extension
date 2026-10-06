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
      return e.message.replace(/^Invalid regular expression: \/.*\/[a-z]*: /, "");
    }
  }

  function compileRules(list) {
    return (list || []).map((r) => ({
      name: r.name,
      color: r.color,
      shiny: !!r.shiny,
      cross: !!r.cross,
      raw: r,
      kw: (r.keywords || []).flatMap((p) => (patternError(p) ? [] : [compilePattern(p)])),
      tkw: (r.titleKeywords || []).flatMap((p) => (patternError(p) ? [] : [compilePattern(p)])),
    }));
  }

  /** Précision entre parenthèses en fin de titre : « Couplage (théorie des graphes) ». */
  function qualifier(title) {
    const m = String(title || "").match(/\(([^()]*)\)\s*$/);
    return m ? m[1] : "";
  }

  /**
   * Étiquettes qui matchent, triées par score décroissant puis ordre des règles.
   * Indices propres à la carte : description, précision du titre, motifs de titre. Wikidata
   * (extraText = nature + occupations) ne fait que compléter : si une règle a un indice propre,
   * celles qui n'ont que Wikidata sont écartées. Sans indice propre, on se rabat sur Wikidata ;
   * si la carte a une description, seulement sur sa nature (natureText, P31), les occupations
   * étant trop bruitées. Les règles shiny matchent les cartes shiny. Les règles transversales
   * (cross) viennent après les catégories, sur indices propres seulement.
   */
  function matchCard(card, rules, extraText = "", natureText = null) {
    const desc = norm(card.desc);
    const qual = norm(qualifier(card.title));
    const title = norm(card.title);
    const extra = norm(extraText);
    const nature = natureText == null || !desc ? extra : norm(natureText);
    const ownFound = [];
    const wdFound = [];
    const cross = [];
    const shiny = [];
    for (const rule of rules) {
      if (rule.shiny) {
        if (card.shiny) shiny.push({ tag: rule.name, score: 1, hits: ["shiny"] });
        continue;
      }
      if (rule.cross) {
        const hits = new Set();
        for (const re of rule.kw) {
          const m = re.exec(desc) || (qual ? re.exec(qual) : null);
          if (m) hits.add(m[0]);
        }
        for (const re of rule.tkw) {
          const m = re.exec(title);
          if (m) hits.add("titre:" + m[0]);
        }
        if (hits.size) cross.push({ tag: rule.name, score: hits.size, hits: [...hits].sort() });
        continue;
      }
      const own = new Set();
      const wd = new Set();
      const fallback = new Set();
      for (const re of rule.kw) {
        let m = re.exec(desc) || (qual ? re.exec(qual) : null);
        if (m) {
          own.add(m[0]);
          continue;
        }
        m = extra ? re.exec(extra) : null;
        if (m) {
          wd.add(m[0]);
          m = nature ? re.exec(nature) : null;
          if (m) fallback.add(m[0]);
        }
      }
      for (const re of rule.tkw) {
        const m = re.exec(title);
        if (m) own.add("titre:" + m[0]);
      }
      if (own.size) {
        const hits = [...new Set([...own, ...wd])].sort();
        ownFound.push({ tag: rule.name, score: hits.length, hits });
      } else if (fallback.size) {
        wdFound.push({ tag: rule.name, score: fallback.size, hits: [...fallback].sort() });
      }
    }
    const out = ownFound.length ? ownFound : wdFound;
    out.sort((a, b) => b.score - a.score); // tri stable => ordre des règles en cas d'égalité
    return out.concat(cross, shiny);
  }

  /** Étiquettes qui ne classent pas la carte : shiny et transversales. */
  const shinyNames = (rules) => new Set(rules.filter((r) => r.shiny || r.cross || (r.raw && (r.raw.shiny || r.raw.cross))).map((r) => r.name));

  /** Étiquettes posées qui classent la carte (toutes sauf les shiny et transversales). */
  function categoryTags(card, rules) {
    const special = shinyNames(rules);
    return card.tags.filter((t) => !special.has(t));
  }

  /**
   * Étiquettes à poser : la catégorie si la carte n'en a pas encore, et les étiquettes shiny et
   * transversales qui lui manquent, même déjà classée.
   */
  function suggest(card, rules, extraText = "", natureText = null) {
    const special = shinyNames(rules);
    const classified = card.tags.some((t) => !special.has(t));
    return matchCard(card, rules, extraText, natureText)
      .filter((m) => !card.tags.includes(m.tag) && (special.has(m.tag) || !classified));
  }

  // --- Wikidata (cache {titles, labels} partagé avec la version Python) -------------

  function wdLabels(cache, title, props = ["P31", "P106"]) {
    const e = (cache && cache.titles && cache.titles[title]) || {};
    const lab = (q) => (cache.labels && cache.labels[q]) || q;
    return props.flatMap((p) => (e[p] || []).map(lab));
  }

  const wdText = (cache, title) => wdLabels(cache, title).join(" ; ");
  /** Nature seule (P31 : « film », « album »…), sans les occupations. */
  const wdNature = (cache, title) => wdLabels(cache, title, ["P31"]).join(" ; ");

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

  /** Compare les suggestions aux étiquettes déjà posées à la main (catégories seulement). */
  function agreement(cards, rules, wdTextOf, wdNatureOf = () => null) {
    const active = new Set(rules.filter((r) => !r.shiny && !r.cross).map((r) => r.name));
    const tagged = cards.filter((c) => c.tags.some((t) => active.has(t)));
    let ok = 0;
    const misses = [];
    for (const c of tagged) {
      const pred = new Set(matchCard(c, rules, wdTextOf(c.title), wdNatureOf(c.title)).map((m) => m.tag).filter((t) => active.has(t)));
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
    const wdNatureOf = (t) => (wd ? wdNature(wd, t) : null);
    const wdLabelsOf = wd ? (t) => wdLabels(wd, t) : null;
    const special = shinyNames(R);

    const todo = new Map(R.map((r) => [r.name, []]));
    const rows = [];
    const unmatched = [];
    for (const c of cards) {
      const matches = suggest(c, R, wdTextOf(c.title), wdNatureOf(c.title));
      rows.push({ card: c, matches });
      for (const m of matches) {
        todo.get(m.tag).push({ card: c, hits: m.hits, others: matches.filter((o) => o.tag !== m.tag).map((o) => o.tag) });
      }
      if (!categoryTags(c, R).length && matches.every((m) => special.has(m.tag))) unmatched.push(c);
    }
    const rep = suggestThemes(unmatched, T, R.map((r) => r.name), minCount, wdTextOf, wdLabelsOf);
    const untagged = cards.filter((c) => !categoryTags(c, R).length);
    return {
      rows,
      todo: R.map((r) => ({ tag: r.name, color: r.color, items: todo.get(r.name) })),
      unmatched,
      themes: rep.candidates,
      words: rep.words,
      wdWords: rep.wdWords,
      agreement: agreement(cards, R, wdTextOf, wdNatureOf),
      stats: {
        cards: cards.length,
        tagged: cards.length - untagged.length,
        suggested: rows.filter((r) => r.matches.length).length,
        unmatched: unmatched.length,
      },
    };
  }

  WMT.core = {
    RARITIES, norm, compilePattern, patternError, compileRules, qualifier, matchCard, shinyNames, categoryTags,
    suggest, headWord, wdLabels, wdText, wdNature, suggestThemes, agreement, analyze,
  };
  if (typeof module !== "undefined") module.exports = WMT.core;
})(globalThis);
