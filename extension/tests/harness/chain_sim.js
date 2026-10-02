// Simulateur de la page Paquets (?state=chain) pour tester l'enchaînement : 3 paquets, écran d'ouverture réel
// (5 cartes), bouton Continuer. Variantes (paramètres d'URL) :
//   robot         vérification « je ne suis pas un robot » après le 1er paquet
//   opendown      « Ouvrir » réagit à l'appui et remplace l'écran aussitôt (pas de « click »)
//   trustedonly   « Ouvrir » ignore les clics non humains (event.isTrusted)
//   disabledflash « Ouvrir » désactivé 1,5 s après « Continuer »
//   popup         après le 1er paquet : fenêtre plein écran sans rôle (annonce) pendant 20 s, « Ouvrir » grisé
//   openerror     la 1re ouverture automatique échoue avec « Erreur réseau. Réessayez. »
//   sanction      après le 1er paquet : « Sanction anti-triche active », « Ouvrir » grisé
//   toast         après le 1er paquet : petit toast avec un bouton de fermeture (#toast-close)
(function () {
  if (STATE !== "chain") return;
  const DECK = [
    ["Sydney Park", "Sydney Park est une actrice américaine.", "SR"],
    ["Planète double", "Le terme planète double décrit deux planètes en orbite.", "PC"],
    ["Ptolémée II", "Ptolémée II est un roi d'Égypte.", "UR"],
    ["Porsche 917", "La Porsche 917 est une voiture de course.", "R"],
    ["Limahl", "Limahl est un chanteur britannique.", "C"],
  ];
  const m = document.querySelector("main");
  const sim = (window.__sim = { count: 3, opens: [], cards: [], continues: 0, robotShown: 0, ignored: 0 });

  function open(e, sync) {
    if (sim.count < 1 || document.getElementById("robot")) return;
    if (PARAMS.has("trustedonly") && !e.isTrusted) { sim.ignored++; return; }
    if (PARAMS.has("openerror") && !e.isTrusted && !sim.errored) {
      sim.errored = Date.now();
      const err = document.createElement("div");
      err.className = "rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400 max-w-sm text-center";
      err.textContent = "Erreur réseau. Réessayez.";
      m.firstElementChild.append(err);
      return;
    }
    sim.count--;
    sim.opens.push({ t: Date.now(), trusted: e.isTrusted, type: e.type });
    sync ? renderReveal() : setTimeout(renderReveal, 200);
  }

  function renderPulls() {
    m.innerHTML = pullsMain(sim.count, sim.count < 10 ? "9:12" : "");
    const btn = WMT_openButton();
    btn.disabled = sim.count < 1;
    if (PARAMS.has("disabledflash") && sim.continues > 0 && sim.count > 0) {
      btn.disabled = true;
      setTimeout(() => (btn.disabled = false), 1500);
    }
    if (PARAMS.has("opendown")) btn.addEventListener("pointerdown", (e) => open(e, true));
    else btn.addEventListener("click", (e) => open(e, false));
    const afterFirst = sim.continues === 1 && !sim.extraShown;
    if (afterFirst && PARAMS.has("popup")) {
      sim.extraShown = Date.now();
      btn.disabled = true;
      const pop = document.createElement("div");
      pop.style.cssText = "position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.7)";
      pop.innerHTML = '<div style="margin:20vh auto;width:300px;padding:20px;background:#fff;color:#000">Dixième édition du ZEVENT !</div>';
      document.body.append(pop);
      setTimeout(() => {
        pop.remove();
        btn.disabled = false;
      }, 20000);
    }
    if (afterFirst && PARAMS.has("sanction")) {
      sim.extraShown = Date.now();
      btn.disabled = true;
      const box = document.createElement("div");
      box.className = "mx-auto max-w-lg mb-4 p-4 rounded-xl border border-amber-500/40 bg-amber-500/10";
      box.innerHTML = '<p class="font-semibold text-amber-200 mb-1">Sanction anti-triche active</p><p>Tes activités sont restreintes.</p>';
      m.firstElementChild.prepend(box);
    }
    if (afterFirst && PARAMS.has("toast")) {
      sim.extraShown = Date.now();
      const toast = document.createElement("div");
      toast.style.cssText = "position:fixed;right:20px;top:20px;z-index:60;padding:12px;background:#fff;color:#000";
      toast.innerHTML = 'Nouveau succès débloqué ! <button id="toast-close" type="button">×</button>';
      toast.querySelector("button").addEventListener("click", () => toast.remove());
      document.body.append(toast);
    }
    if (PARAMS.has("robot") && sim.continues === 1 && !sim.robotShown) {
      sim.robotShown = Date.now();
      const box = document.createElement("div");
      box.id = "robot";
      box.setAttribute("role", "dialog");
      box.style.cssText = "position:fixed;left:40%;top:40%;padding:20px;background:#fff;color:#000;z-index:10";
      box.innerHTML = '<label><input type="checkbox" id="robot-check"> Je ne suis pas un robot</label>';
      box.querySelector("input").addEventListener("click", (e) => {
        sim.robotTrusted = e.isTrusted;
        setTimeout(() => box.remove(), 500);
      });
      document.body.append(box);
    }
  }

  function renderReveal() {
    m.innerHTML = REVEAL;
    const counter = [...m.querySelectorAll("span")].find((x) => x.textContent.trim() === "Carte").nextElementSibling;
    const badge = [...m.querySelectorAll("div")].find((d) => d.childElementCount === 0 && ["L", "UR", "SR", "R", "PC", "C"].includes(d.textContent.trim()));
    const row = [...m.querySelectorAll("div")].find((d) => d.children.length === 3 && d.children[0].tagName === "BUTTON" && d.children[2].tagName === "BUTTON");
    const [prev, , next] = row.children;
    const cont = [...m.querySelectorAll("button")].find((b) => b.textContent.trim() === "Continuer");
    let i = 0;
    const show = () => {
      const [t, d, r] = DECK[i];
      m.querySelector("h3").textContent = t;
      m.querySelector("h3").nextElementSibling.textContent = d;
      badge.textContent = r;
      counter.textContent = String(i + 1);
      prev.disabled = i === 0;
      next.disabled = i === DECK.length - 1;
      sim.cards.push({ t: Date.now(), card: i + 1, rarity: r });
    };
    show();
    next.addEventListener("click", () => setTimeout(() => { i++; show(); }, 120));
    cont.addEventListener("click", () => setTimeout(() => { sim.continues++; renderPulls(); }, 150));
  }

  window.WMT_openButton = () => [...m.querySelectorAll("button")].find((b) => b.textContent.trim() === "Ouvrir");
  renderPulls();
})();
