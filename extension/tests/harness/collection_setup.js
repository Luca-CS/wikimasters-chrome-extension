// Page Collection de test (snapshot input/…, scripts du site retirés).
// - config de test : pagination rapide, couleur de Maths faussée (doit être reprise du jeu) ;
// - fausse pagination : 4 pages, départ en page 2 comme dans le snapshot ; les pages 1, 3 et 4
//   reprennent les cartes du snapshot avec un titre suffixé.
(function () {
  const c = WMT.defaults.config();
  c.settings.pageDelay = 300;
  c.rules.find((r) => r.name === "Maths").color = "#000000";
  window.__store.config = c;

  const TOTAL = 4;
  let page = 2;
  const roots = [...document.querySelectorAll("div.relative.isolate.group")];
  const grid = roots[0].parentElement;
  const template = roots.map((r) => r.cloneNode(true));
  if (location.search.includes("autotag")) {
    // Une carte shiny : l'étiquette Shiny n'existe pas dans ce « jeu », elle doit être sautée.
    const badge = [...template[0].querySelectorAll("div, span")].find((e) => e.childElementCount === 0 && /^(L|UR|SR|R|PC|C)$/.test(e.textContent.trim()));
    badge.classList.add("shiny-badge");
    badge.innerHTML = `${badge.textContent.trim()}<span aria-hidden="true">✦</span><span class="sr-only"> shiny</span>`;
  }
  const pagerTexts = [...document.querySelectorAll("main span")].filter((s) =>
    /^Page\s+\d+\s*\/\s*\d+$/.test(s.textContent.replace(/\s+/g, " ").trim()));
  const buttons = pagerTexts.flatMap((s) => [...s.parentElement.querySelectorAll("button")]);
  function setPager() {
    pagerTexts.forEach((s) => (s.textContent = `Page ${page} / ${TOTAL}`));
    buttons.forEach((b) => (b.disabled = /Précédent/.test(b.textContent) ? page === 1 : page === TOTAL));
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
    const n = selected.size;
    bar.innerHTML = `<div><span>${n}</span><span>${n > 1 ? "cartes sélectionnées" : "carte sélectionnée"}</span></div>` +
      `<div><button type="button">Tout sélectionner (page)</button><button type="button"${n ? "" : " disabled"}>Étiqueter</button>` +
      `<button type="button" disabled>Retirer l'étiquette</button><button type="button"${n ? "" : " disabled"}>Défausser (+${n})</button></div>`;
    const [, tag, , discard] = bar.querySelectorAll("button");
    tag.addEventListener("click", () => setTimeout(openModal, 200));
    discard.addEventListener("click", () => window.__discarded++);
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
        addChips(root);
        n++;
      }
      window.__applied.push({ page, tag, titles: [...selected] });
      m.querySelector(".sim-body").innerHTML = `<p><span>${n}</span> ${n > 1 ? "cartes étiquetées" : "carte étiquetée"}.</p><button type="button">Terminé</button>`;
      m.querySelector(".sim-body button").addEventListener("click", () => m.remove());
    }, 300);
  }

  function render() {
    grid.replaceChildren(...template.map((r) => {
      const n = r.cloneNode(true);
      const h3 = n.querySelector("h3");
      if (page !== 2) h3.textContent = h3.textContent + " ·" + page;
      addChips(n);
      return n;
    }));
  }

  /** Affiche directement une page (vérifications de fin de scénario). */
  window.__showPage = (n) => {
    page = n;
    setPager();
    render();
  };
  buttons.forEach((b) => b.addEventListener("click", () => {
    window.__clicks = (window.__clicks || 0) + 1;
    const next = /Suivant/.test(b.textContent) ? page + 1 : page - 1;
    setTimeout(() => {
      page = next;
      setPager();
      setTimeout(render, 120);
    }, 200);
  }));
  setPager();
})();
