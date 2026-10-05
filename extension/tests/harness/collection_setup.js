// Page Collection de test (snapshot input/…, scripts du site retirés).
// - config de test : pagination rapide, couleur de Maths faussée (doit être reprise du jeu) ;
// - fausse pagination : 4 pages, départ en page 2 comme dans le snapshot ; les pages 1, 3 et 4
//   reprennent les cartes du snapshot avec un titre suffixé.
(function () {
  const c = WMT.defaults.config();
  c.settings.pageDelay = 300;
  c.rules.find((r) => r.name === "Maths").color = "#000000";
  window.__store.config = c;

  const PAGES = 4;
  let page = 2;
  const roots = [...document.querySelectorAll("div.relative.isolate.group")];
  const grid = roots[0].parentElement;
  const template = roots.map((r) => r.cloneNode(true));
  const rarityLeaf = (root) => [...root.querySelectorAll("div, span")].find((e) => e.childElementCount === 0 && /^(L|UR|SR|R|PC|C)$/.test(e.textContent.trim()));
  const shiny = location.search.includes("autotag") || location.search.includes("sell");
  if (shiny) {
    // Une carte shiny : l'étiquette Shiny n'existe pas dans ce « jeu » (sautée à l'étiquetage,
    // gardée à la vente).
    const badge = rarityLeaf(template[0]);
    badge.classList.add("shiny-badge");
    badge.innerHTML = `${badge.textContent.trim()}<span aria-hidden="true">✦</span><span class="sr-only"> shiny</span>`;
  }
  if (location.search.includes("sell")) {
    // Le snapshot n'a que des SR : une carte sur 5 devient R, que la vente des SR doit épargner.
    template.forEach((r, i) => {
      if (i % 5 === 4) rarityLeaf(r).textContent = "R";
    });
  }
  // Inventaire : 4 « pages » du snapshot (titres suffixés hors page 2). Les filtres du site
  // (« Sans étiquette », raretés) et la défausse s'y appliquent, comme sur le vrai site.
  const inventory = [];
  for (let p = 1; p <= PAGES; p++) {
    template.forEach((r, t) => {
      const base = r.querySelector("h3").textContent.trim();
      const badge = r.querySelector(".shiny-badge") || rarityLeaf(r);
      inventory.push({ t, title: p === 2 ? base : `${base} ·${p}`, rarity: badge ? badge.firstChild.textContent.trim() : "" });
    });
  }
  window.__inventory = inventory;
  const filters = { untagged: false, rarities: new Set() };
  window.__filters = filters;
  window.__sold = [];
  const pagerTexts = [...document.querySelectorAll("main span")].filter((s) =>
    /^Page\s+\d+\s*\/\s*\d+$/.test(s.textContent.replace(/\s+/g, " ").trim()));
  const buttons = pagerTexts.flatMap((s) => [...s.parentElement.querySelectorAll("button")]);
  let total = PAGES;
  function setPager() {
    // Comme le site : pas de pagination quand il n'y a qu'une page.
    pagerTexts.forEach((s) => (s.textContent = total > 1 ? `Page ${page} / ${total}` : ""));
    buttons.forEach((b) => (b.disabled = /Précédent/.test(b.textContent) ? page === 1 : page === total));
  }

  // --- Rechargements, comme sur le site (relevés le 07/10/2026) -------------------------
  // Chaque action qui change la liste la recharge : d'abord un délai sans aucun signe (les
  // anciennes cartes restent affichées et cliquables), puis le chargement (grille estompée,
  // « Chargement… » et icône qui tourne dans la pagination, boutons désactivés,
  // « Actualisation… » dans la barre de sélection), puis les nouvelles cartes. La requête la
  // plus récente l'emporte.
  const QUIET = 500; // ms, comme le site (~0,5 à 1 s)
  const LOAD = 1500; // ms (le site : 2 à 3 s)
  // Le total de pages vient d'une requête séparée, refaite seulement en page 1, qui arrive
  // après les cartes : en attendant, « Page 1 / Y » et « Suivant » restent sur l'ancien total.
  const STATS_LAG = 1200;
  let reloadId = 0;
  let loading = false;
  window.__reloads = 0;
  function setLoading(on) {
    loading = on;
    grid.classList.toggle("opacity-40", on);
    grid.classList.toggle("pointer-events-none", on);
    if (on) {
      pagerTexts.forEach((s) => {
        s.textContent = "Chargement…";
        const spin = document.createElement("span");
        spin.className = "sim-spin animate-spin";
        s.before(spin);
      });
      buttons.forEach((b) => (b.disabled = true));
    } else {
      document.querySelectorAll(".sim-spin").forEach((s) => s.remove());
    }
    renderBar();
  }
  function reload() {
    const id = ++reloadId;
    window.__reloads++;
    setTimeout(() => {
      if (id !== reloadId) return;
      setLoading(true);
      setTimeout(() => {
        if (id !== reloadId) return;
        setLoading(false);
        render(page === 1);
      }, LOAD);
    }, QUIET);
  }
  // --- Mode sélection et étiquetage (relevés sur le site le 02/10/2026) ---------------
  // Étiquettes « existant dans le jeu » : pas de Ski ni de Shiny, qui doivent être sautées.
  const GAME_TAGS = {
    Automobile: "134, 239, 172", "Cinéma/Séries/Acteurs": "255, 0, 234", Maths: "1, 199, 252", Musique: "94, 234, 212",
    Mythologie: "251, 113, 133", Roumanie: "245, 236, 0", Royauté: "167, 139, 250",
  };
  window.__gameTags = Object.keys(GAME_TAGS);
  window.__applied = [];
  window.__discarded = 0;
  const added = new Map(); // titre -> Set des étiquettes posées pendant le test
  const titleOf = (root) => root.querySelector("h3").textContent.trim();
  const tagsOf = (root) => [...root.querySelectorAll("span.rounded-full")].map((s) => s.textContent.trim());

  function addChips(root) {
    const tags = added.get(titleOf(root));
    if (!tags) return;
    const zone = root.querySelector("h3").parentElement.querySelector("div.mt-auto");
    let wrap = zone.querySelector("[data-sim-tags]");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.dataset.simTags = "";
      zone.prepend(wrap);
    }
    for (const t of tags) {
      if (tagsOf(root).includes(t)) continue;
      const s = document.createElement("span");
      s.className = "inline-block max-w-[104px] truncate rounded-full border";
      s.style.cssText = `background-color: rgba(${GAME_TAGS[t]}, 0.38); border-color: rgba(${GAME_TAGS[t]}, 0.52);`;
      s.textContent = t;
      wrap.append(s);
    }
  }

  const selBtn = [...document.querySelectorAll("main button")].find((b) => b.textContent.trim().endsWith("lectionner"));
  let selecting = false;
  const selected = new Set();
  let bar = null;
  selBtn.addEventListener("click", () => setTimeout(() => {
    selecting = !selecting;
    selected.clear();
    const toast = document.getElementById("sim-toast");
    if (selecting && toast) toast.remove();
    selBtn.lastChild.textContent = selecting ? "Quitter la sélection" : "Sélectionner";
    renderBar();
  }, 120));
  grid.addEventListener("click", (e) => {
    const root = selecting && e.target.closest("div.relative.isolate.group");
    if (!root) return;
    const t = titleOf(root);
    selected.has(t) ? selected.delete(t) : selected.add(t);
    renderBar();
  });

  function renderBar() {
    if (!selecting) {
      if (bar) bar.remove();
      bar = null;
      return;
    }
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "fixed bottom-4 z-[80] flex flex-col";
      document.body.append(bar);
    }
    const shown = new Set([...grid.children].map(titleOf));
    const n = [...selected].filter((t) => shown.has(t)).length;
    const off = !n || loading ? " disabled" : "";
    bar.innerHTML = (loading ? "<div><span>Actualisation…</span></div>"
      : `<div><span>${n}</span><span>${n > 1 ? "cartes sélectionnées" : "carte sélectionnée"}</span></div>`) +
      `<div><button type="button"${loading ? " disabled" : ""}>Tout sélectionner (page)</button><button type="button"${off}>Étiqueter</button>` +
      `<button type="button" disabled>Retirer l'étiquette</button><button type="button"${off}>Défausser (+${n})</button></div>`;
    const [all, tag, , discard] = bar.querySelectorAll("button");
    all.addEventListener("click", () => {
      for (const root of grid.children) selected.add(titleOf(root));
      renderBar();
    });
    tag.addEventListener("click", () => setTimeout(openModal, 200));
    discard.addEventListener("click", () => {
      window.__discarded++;
      setTimeout(openDiscard, 200);
    });
  }

  function openModal() {
    const m = document.createElement("div");
    m.className = "fixed inset-0 z-[60] flex items-center justify-center";
    m.innerHTML = `<div><button type="button" aria-label="Fermer"><svg></svg></button><div><div><h2>Appliquer une étiquette</h2>` +
      `<p>Sur ${selected.size} cartes sélectionnées.</p></div></div>` +
      `<div class="sim-body"><input type="text" maxlength="48" placeholder="Chargement…"><div class="sim-list"></div></div></div>`;
    document.body.append(m);
    m.querySelector('[aria-label="Fermer"]').addEventListener("click", () => m.remove());
    setTimeout(() => {
      m.querySelector("input").placeholder = "Chercher ou créer une étiquette…";
      for (const [name, rgb] of Object.entries(GAME_TAGS)) {
        const b = document.createElement("button");
        b.type = "button";
        const s = document.createElement("span");
        s.style.cssText = `background-color: rgba(${rgb}, 0.22)`;
        s.textContent = name;
        b.append(s);
        b.addEventListener("click", () => apply(m, name));
        m.querySelector(".sim-list").append(b);
      }
    }, 400);
  }

  function apply(m, tag) {
    setTimeout(() => {
      let n = 0;
      for (const root of grid.children) {
        const t = titleOf(root);
        if (!selected.has(t) || tagsOf(root).includes(tag)) continue;
        if (!added.has(t)) added.set(t, new Set());
        added.get(t).add(tag);
        n++;
      }
      window.__applied.push({ page, tag, titles: [...selected] });
      m.querySelector(".sim-body").innerHTML = `<p><span>${n}</span> ${n > 1 ? "cartes étiquetées" : "carte étiquetée"}.</p><button type="button">Terminé</button>`;
      m.querySelector(".sim-body button").addEventListener("click", () => m.remove());
      reload(); // le site recharge la collection après avoir posé l'étiquette
    }, 300);
  }

  const cardTags = (it) => [...tagsOf(template[it.t]), ...(added.get(it.title) || [])];
  function visible() {
    return inventory.filter((it) => (!filters.untagged || !cardTags(it).length) &&
      (!filters.rarities.size || filters.rarities.has(it.rarity)));
  }
  let empty = null;
  function render(lateTotal = false) {
    const list = visible();
    const realTotal = Math.max(1, Math.ceil(list.length / 50));
    if (page > realTotal) page = realTotal;
    if (lateTotal && realTotal !== total) {
      setTimeout(() => {
        total = realTotal;
        if (!loading) setPager();
      }, STATS_LAG);
    } else {
      total = realTotal;
    }
    setPager();
    grid.replaceChildren(...list.slice((page - 1) * 50, page * 50).map((it) => {
      const n = template[it.t].cloneNode(true);
      n.querySelector("h3").textContent = it.title;
      addChips(n);
      return n;
    }));
    if (empty) empty.remove();
    empty = null;
    if (!list.length) {
      empty = document.createElement("p");
      empty.textContent = "Aucune carte trouvée avec ces filtres.";
      grid.after(empty);
    }
  }

  // --- Filtres du site (relevés le 05/10/2026) ------------------------------------------
  const tagBtn = document.querySelector('button[aria-label="Filtrer par étiquette"]');
  const tagLabel = [...tagBtn.querySelectorAll("span, div")].find((e) => e.childElementCount === 0 && e.textContent.trim()) || tagBtn;
  tagLabel.textContent = "Toutes les étiquettes";
  tagBtn.addEventListener("click", () => {
    const open = document.querySelector('[role="listbox"]');
    if (open) return open.remove();
    const ul = document.createElement("ul");
    ul.setAttribute("role", "listbox");
    for (const label of ["Toutes les étiquettes", "Sans étiquette", ...Object.keys(GAME_TAGS).map((t) => `#${t}`)]) {
      const li = document.createElement("li");
      li.setAttribute("role", "none");
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "option");
      b.textContent = label;
      b.addEventListener("click", () => {
        ul.remove();
        filters.untagged = label === "Sans étiquette";
        tagLabel.textContent = label;
        page = 1;
        reload();
      });
      li.append(b);
      ul.append(li);
    }
    document.body.append(ul);
  });
  for (const chip of [...document.querySelectorAll("main button")].filter((b) => /^(L|UR|SR|R|PC|C)$/.test(b.textContent.trim()))) {
    const r = chip.textContent.trim();
    chip.className = "px-3 py-1 rounded-full text-xs font-semibold opacity-50";
    chip.addEventListener("click", () => {
      filters.rarities.has(r) ? filters.rarities.delete(r) : filters.rarities.add(r);
      chip.className = `px-3 py-1 rounded-full text-xs font-semibold ${filters.rarities.has(r) ? "ring-2" : "opacity-50"}`;
      page = 1;
      reload();
    });
  }

  // --- Défausse : confirmation du site, puis cartes retirées et liste rechargée ----------
  function openDiscard() {
    const n = selected.size;
    const d = document.createElement("div");
    d.className = "fixed inset-0 z-[90] flex items-center justify-center";
    d.innerHTML = `<div class="card-frame"><h3>Défausser ${n} carte${n > 1 ? "s" : ""} ?</h3>` +
      "<p>Un exemplaire de chaque carte sélectionnée sera retiré définitivement.</p>" +
      `<p>Vous recevrez ${n} wikibidou${n > 1 ? "s" : ""}.</p>` +
      '<div><button type="button">Annuler</button><button type="button">Défausser</button></div></div>';
    document.body.append(d);
    const [cancel, confirm] = d.querySelectorAll("button");
    cancel.addEventListener("click", () => d.remove());
    confirm.addEventListener("click", () => setTimeout(() => {
      const titles = [...selected];
      for (const t of titles) inventory.splice(inventory.findIndex((it) => it.title === t), 1);
      window.__sold.push({ page, titles });
      d.remove();
      selected.clear();
      renderBar();
      let toast = document.getElementById("sim-toast");
      if (!toast) {
        toast = document.createElement("div");
        toast.id = "sim-toast";
        grid.parentElement.prepend(toast);
      }
      const n2 = titles.length;
      toast.innerHTML = `<span>${n2} carte${n2 > 1 ? "s" : ""} défaussée${n2 > 1 ? "s" : ""} (+${n2} wikibidou${n2 > 1 ? "s" : ""}).</span>`;
      reload();
    }, 300));
  }

  /** Affiche directement une page (vérifications de fin de scénario). */
  window.__showPage = (n) => {
    page = n;
    render();
  };
  window.__nav = { next: 0, prev: 0 };
  buttons.forEach((b) => b.addEventListener("click", () => {
    window.__clicks = (window.__clicks || 0) + 1;
    const forward = /Suivant/.test(b.textContent);
    window.__nav[forward ? "next" : "prev"]++;
    page += forward ? 1 : -1;
    reload();
  }));
  setPager();
})();
