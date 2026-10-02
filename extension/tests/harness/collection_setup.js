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
  const pagerTexts = [...document.querySelectorAll("main span")].filter((s) =>
    /^Page\s+\d+\s*\/\s*\d+$/.test(s.textContent.replace(/\s+/g, " ").trim()));
  const buttons = pagerTexts.flatMap((s) => [...s.parentElement.querySelectorAll("button")]);
  function setPager() {
    pagerTexts.forEach((s) => (s.textContent = `Page ${page} / ${TOTAL}`));
    buttons.forEach((b) => (b.disabled = /Précédent/.test(b.textContent) ? page === 1 : page === TOTAL));
  }
  function render() {
    grid.replaceChildren(...template.map((r) => {
      const n = r.cloneNode(true);
      const h3 = n.querySelector("h3");
      if (page !== 2) h3.textContent = h3.textContent + " ·" + page;
      return n;
    }));
  }
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
