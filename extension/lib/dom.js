// Lecture de la page Collection de WikiMasters (structure relevée le 01/10/2026).
//
// Une carte : <div class="relative isolate group"> > <div class="... rounded-2xl ..."> qui
// contient la rareté (badge « SR »…), un <h3> (titre), un <p> (description, facultative),
// les étiquettes posées (<span> arrondis colorés) et deux nombres (attaque, défense).
// La pagination « ← Précédent · Page X / Y · Suivant → » change de page sans recharger.
//
// On s'appuie sur la structure (h3, badge de rareté, texte de pagination) plutôt que sur les
// classes Tailwind, plus susceptibles de changer.
(function (root) {
  const WMT = (root.WMT = root.WMT || {});
  const RARITIES = new Set(["L", "UR", "SR", "R", "PC", "C"]);
  const NUM = /^\d{1,3}(?: \d{3})*$|^\d+$/;
  const PAGE = /^Page (\d+) ?\/ ?(\d+)$/;

  const clean = (s) => String(s || "").replace(/[    ]/g, " ").replace(/\s+/g, " ").trim();
  const text = (el) => clean(el.textContent);
  const leaf = (el) => el.childElementCount === 0;

  /** Pagination : {page, total, prev, next, bar} ou null. */
  function pager(doc = document) {
    const scope = doc.querySelector("main") || doc.body;
    if (!scope) return null;
    for (const el of scope.querySelectorAll("span, div, p")) {
      if (!leaf(el)) continue;
      const m = text(el).match(PAGE);
      if (!m) continue;
      const bar = el.parentElement;
      const buttons = bar ? [...bar.querySelectorAll("button")] : [];
      return {
        page: +m[1],
        total: +m[2],
        bar,
        prev: buttons.find((b) => /Précédent/i.test(text(b))) || null,
        next: buttons.find((b) => /Suivant/i.test(text(b))) || null,
      };
    }
    return null;
  }

  function rarityBadge(el) {
    for (const e of el.querySelectorAll("div, span")) if (leaf(e) && RARITIES.has(text(e))) return e;
    return null;
  }

  /** Conteneur des cartes : le bloc qui entoure la grille et les deux barres de pagination. */
  function cardScope(doc = document) {
    const p = pager(doc);
    return (p && p.bar && p.bar.parentElement) || doc.querySelector("main") || doc.body;
  }

  /** Cartes affichées, dans l'ordre de la page : {root, el, h3}. */
  function cardElements(doc = document) {
    const scope = cardScope(doc);
    const out = [];
    const seen = new Set();
    for (const h3 of scope.querySelectorAll("h3")) {
      let card = null;
      let el = h3.parentElement;
      for (let i = 0; el && el !== scope && i < 8; i++, el = el.parentElement) {
        if (el.querySelectorAll("h3").length > 1) break;
        if (rarityBadge(el)) {
          card = el;
          break;
        }
      }
      if (!card || seen.has(card)) continue;
      seen.add(card);
      const parent = card.parentElement;
      const root = parent && parent !== scope && parent.querySelectorAll("h3").length === 1 ? parent : card;
      out.push({ root, el: card, h3 });
    }
    return out;
  }

  function hexColor(css) {
    const m = String(css || "").match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
    return m ? "#" + m.slice(1, 4).map((n) => (+n).toString(16).padStart(2, "0")).join("") : null;
  }

  /** Données d'une carte. knownTags aide à reconnaître les étiquettes si le style change. */
  function readCard({ el, h3 }, knownTags = new Set()) {
    const badge = rarityBadge(el);
    const p = el.querySelector("p");
    const nums = [];
    const tags = [];
    const colors = {};
    for (const s of el.querySelectorAll("span")) {
      if (!leaf(s)) continue;
      const t = text(s);
      if (!t) continue;
      if (NUM.test(t)) {
        nums.push(+t.replace(/ /g, ""));
        continue;
      }
      const chip = /rounded-full/.test(s.className) && /background-color/i.test(s.getAttribute("style") || "");
      if (chip || knownTags.has(t)) {
        tags.push(t);
        const color = hexColor(s.style.borderColor || s.style.backgroundColor);
        if (color) colors[t] = color;
      }
    }
    const img = [...el.querySelectorAll("img")].find((i) => i.alt && i.alt !== "WikiMasters" && /^https?:/.test(i.src));
    return {
      title: text(h3),
      rarity: badge ? text(badge) : "",
      desc: p ? text(p) : "",
      tags,
      attack: nums[0] || 0,
      defense: nums[1] || 0,
      img: img ? img.src : "",
      colors,
    };
  }

  /** Toutes les cartes de la page : {root, el, h3, pos, title, rarity, desc, tags, ...}. */
  function cards(doc = document, knownTags) {
    return cardElements(doc).map((c, i) => ({ ...c, pos: i + 1, ...readCard(c, knownTags) }));
  }

  /** Filtres actifs (le scan ne verrait alors qu'une partie de la collection). */
  function activeFilters(doc = document) {
    const out = [];
    const tagBtn = doc.querySelector('button[aria-label="Filtrer par étiquette"]');
    if (tagBtn && !/^Toutes les étiquettes$/i.test(text(tagBtn))) out.push(`étiquette « ${text(tagBtn)} »`);
    const search = doc.querySelector('main input[placeholder^="Rechercher"]');
    if (search && search.value.trim()) out.push(`recherche « ${search.value.trim()} »`);
    const chips = [...doc.querySelectorAll("main button")].filter((b) => RARITIES.has(text(b)));
    const on = chips.filter((b) => !/opacity-50/.test(b.className));
    if (chips.length && on.length && on.length < chips.length) out.push(`rareté ${on.map(text).join(", ")}`);
    return out;
  }

  // --- Page Paquets (/pulls), relevée le 01/10/2026 ---------------------------------
  // <div class="card-frame ..."><div><span>7</span><span> / 10</span></div><div>paquets disponibles</div>
  //   <div>Prochain dans <span class="font-mono">1:43</span></div></div>
  // À 10/10 la ligne « Prochain dans » disparaît. On lit le temps (« 1:43 », ou au besoin
  // « 4 min 12 s ») dans la colonne du compteur.

  /** Durée en ms dans un texte (« 04:12 », « 1:02:03 », « dans 4 min 12 s »), sinon null. */
  function parseDuration(t) {
    const clock = t.match(/(?:^|[^\d:])(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?![\d:])/);
    if (clock) return ((+(clock[1] || 0) * 60 + +clock[2]) * 60 + +clock[3]) * 1000;
    if (!/prochain|dans|recharge|reste|nouveau/i.test(t)) return null; // évite les nombres sans rapport
    const h = t.match(/(\d+)\s*h(?![a-z])/i);
    const min = t.match(/(\d+)\s*min/i);
    const s = t.match(/(\d+)\s*s(?:ec(?:onde)?s?)?(?![a-z])/i);
    if (!h && !min && !s) return null;
    return (((h ? +h[1] : 0) * 60 + (min ? +min[1] : 0)) * 60 + (s ? +s[1] : 0)) * 1000;
  }

  /** Compteur de paquets : {count, max, nextMs} (nextMs = null si aucun minuteur affiché). */
  function packs(doc = document) {
    const scope = doc.querySelector("main") || doc.body;
    if (!scope) return null;
    for (const el of scope.querySelectorAll("div, span, p")) {
      if (!leaf(el) || !/^paquets? disponibles?$/i.test(text(el))) continue;
      const box = el.parentElement;
      const m = box && text(box).match(/(\d+) ?\/ ?(\d+)/);
      if (!m) continue;
      const column = (box.parentElement && box.parentElement.parentElement) || scope;
      let nextMs = null;
      for (const t of column.querySelectorAll("div, span, p")) {
        if (!leaf(t) || t === el) continue;
        const ms = parseDuration(text(t));
        if (ms != null) {
          nextMs = ms;
          break;
        }
      }
      return { count: +m[1], max: +m[2], nextMs };
    }
    return null;
  }

  /**
   * Écran d'ouverture d'un paquet : « Carte 5 / 5 » au-dessus d'une seule carte en grand (même
   * composant que la collection, mais avec l'extrait Wikipédia complet en description).
   * Renvoie {index, total} ou null.
   */
  function reveal(doc = document) {
    const scope = doc.querySelector("main") || doc.body;
    if (!scope) return null;
    for (const el of scope.querySelectorAll("span")) {
      if (!leaf(el) || text(el) !== "Carte") continue;
      // Trois <span> collés (« Carte » « 5 » « / 5 ») : l'espace vient du CSS, pas du texte.
      const m = text(el.parentElement).match(/^Carte ?(\d+) ?\/ ?(\d+)$/);
      if (m) return { index: +m[1], total: +m[2] };
    }
    return null;
  }

  /**
   * Navigation de l'écran d'ouverture : une rangée [bouton précédent, points (un par carte),
   * bouton suivant] et le bouton « Continuer » qui ferme l'écran. {prev, next, cont}.
   */
  function revealNav(doc = document) {
    const scope = doc.querySelector("main") || doc.body;
    const nav = { prev: null, next: null, cont: null };
    if (!scope) return nav;
    nav.cont = [...scope.querySelectorAll("button")].find((b) => /^Continuer$/i.test(text(b))) || null;
    for (const row of scope.querySelectorAll("div")) {
      const kids = [...row.children];
      if (kids.length !== 3 || kids[0].tagName !== "BUTTON" || kids[2].tagName !== "BUTTON") continue;
      if (kids[1].querySelectorAll("button").length < 2) continue;
      nav.prev = kids[0];
      nav.next = kids[2];
      break;
    }
    return nav;
  }

  /** Bouton « Ouvrir » de la page Paquets (image « Ouvrir un paquet » + libellé « Ouvrir »). */
  function openButton(doc = document) {
    const scope = doc.querySelector("main") || doc.body;
    if (!scope) return null;
    return [...scope.querySelectorAll("button")].find((b) => text(b) === "Ouvrir" || b.querySelector('img[alt^="Ouvrir"]')) || null;
  }

  const shown = (el) => (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);

  /**
   * Fenêtre bloquante affichée (dont la vérification « je ne suis pas un robot ») : l'extension
   * n'y touche jamais, elle attend que tu t'en occupes.
   */
  function blockingDialog(doc = document) {
    for (const el of doc.querySelectorAll('[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]')) {
      if (!el.closest("#wmt-host") && shown(el)) return true;
    }
    for (const el of doc.querySelectorAll("label, span, p, div, h2, h3")) {
      if (leaf(el) && /robot/i.test(text(el)) && shown(el)) return true;
    }
    return false;
  }

  /** Première phrase d'un extrait Wikipédia (celle qui définit le sujet). */
  function firstSentence(t) {
    const m = String(t || "").match(/^(.{20,}?[.!?])(?:\s|$)/);
    return (m ? m[1] : String(t || "")).slice(0, 240);
  }

  WMT.dom = {
    clean, pager, cardElements, readCard, cards, activeFilters, hexColor,
    packs, parseDuration, reveal, revealNav, openButton, blockingDialog, firstSentence,
  };
})(globalThis);
