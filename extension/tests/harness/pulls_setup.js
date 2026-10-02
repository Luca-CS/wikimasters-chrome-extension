// Page Paquets de test. L'écran d'ouverture (window.REVEAL) vient d'un export réel placé dans
// input/ (généré dans out/pulls/reveal.js par build.py) ; la page « Ouvrir un paquet » est
// reconstruite ci-dessous d'après le HTML relevé le 01/10/2026.
//   ?state=full       10/10, sans minuteur
//   ?state=regen      7/10, « Prochain dans 1:43 »
//   ?state=reveal     écran d'ouverture (carte 5/5), puis carte suivante, puis retour à 9/10
//   ?state=auto       écran d'ouverture simulé (5 cartes) : défilement automatique ; &robot ajoute
//                     une vérification « je ne suis pas un robot » en carte 3, retirée après 3 s
//   ?state=pingpong   5/10 ; le scénario simule un autre onglet qui réécrit 10/10 en boucle
//   ?state=chain      simulateur complet pour l'enchaînement (voir chain_sim.js)
//   &open             panneau ouvert, sans scénario (captures) ; &card2 : 2e carte affichée
window.PARAMS = new URLSearchParams(location.search);
window.STATE = PARAMS.get("state") || "full";

const PULLS = `
<div class="flex-1 flex flex-col items-center justify-center gap-4 md:gap-8 p-4 md:p-6">
  <div class="text-center animate-fade-in-up">
    <h1 class="text-3xl md:text-4xl font-bold mb-2" style="font-family: var(--font-heading);">Ouvrir un paquet</h1>
    <p class="text-[var(--color-foreground)]/50 text-sm">Découvrez 5 nouvelles cartes Wikipédia</p>
    <div class="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs"><button class="text-[var(--color-accent)]/70 hover:text-[var(--color-accent)] transition-colors cursor-pointer">Comment ça marche ?</button></div>
  </div>
  <button class="relative flex flex-col items-center justify-center gap-4 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 cursor-pointer">
    <span class="text-lg md:text-xl font-bold text-[var(--color-accent)] drop-shadow-md">Ouvrir</span>
  </button>
  <div class="flex flex-col items-center gap-3 animate-fade-in-up">
    <div class="card-frame px-6 py-3 flex flex-col items-center gap-1 text-center">
      <div class="text-lg font-bold"><span class="text-[var(--color-accent)]">__N__</span><span class="text-[var(--color-foreground)]/40"> / 10</span></div>
      <div class="text-xs text-[var(--color-foreground)]/40">paquets disponibles</div>__TIMER__
    </div>
  </div>
  <div class="w-full max-w-sm animate-fade-in-up rounded-xl border border-violet-500/25 bg-violet-950/20 px-4 py-3 flex flex-col gap-2">
    <p class="text-xs font-medium text-violet-200/90">Pack PRO du jour</p>
    <p class="text-[11px] text-[var(--color-foreground)]/45 text-center">Déjà réclamé aujourd’hui (heure de ton appareil). Reviens demain&nbsp;!</p>
  </div>
</div>`;

window.pullsMain = (n, timer) =>
  PULLS.replace("__N__", n).replace("__TIMER__", timer
    ? `<div class="text-xs text-[var(--color-foreground)]/40">Prochain dans <span class="text-[var(--color-accent)] font-mono">${timer}</span></div>`
    : "");

(function () {
  const main = document.querySelector("main");
  main.innerHTML = {
    reveal: window.REVEAL,
    auto: window.REVEAL,
    pingpong: pullsMain(5, ""),
    regen: pullsMain(7, "1:43"),
    chain: "",
  }[STATE] ?? pullsMain(10, "");
  if (PARAMS.has("open")) sessionStorage.setItem("wmt-open-pulls", "1");
  if (PARAMS.has("card2")) {
    main.querySelector("h3").textContent = "Sydney Park";
    main.querySelector("h3").nextElementSibling.textContent = "Sydney Park, née le 31 octobre 1997 à Los Angeles, est une actrice américaine.";
  }
  if (STATE !== "auto") return;

  // Écran d'ouverture simulé : 5 cartes, flèche suivante, « Continuer », vérification optionnelle.
  const DECK = [
    ["Sydney Park", "Sydney Park, née en 1997, est une actrice américaine. Elle joue dans des séries.", "SR"],
    ["Planète double", "Le terme informel « planète double » est utilisé pour décrire deux planètes en orbite.", "PC"],
    ["Ptolémée II", "Ptolémée II est un roi d'Égypte de la dynastie lagide.", "UR"],
    ["Porsche 917", "La Porsche 917 est une voiture de course allemande.", "R"],
    ["Limahl", "Limahl est un chanteur britannique.", "C"],
  ];
  const counter = [...main.querySelectorAll("span")].find((x) => x.textContent.trim() === "Carte").nextElementSibling;
  const badge = [...main.querySelectorAll("div")].find((d) => d.childElementCount === 0 && ["L", "UR", "SR", "R", "PC", "C"].includes(d.textContent.trim()));
  const row = [...main.querySelectorAll("div")].find((d) => d.children.length === 3 && d.children[0].tagName === "BUTTON" && d.children[2].tagName === "BUTTON");
  const [prev, , next] = row.children;
  const cont = [...main.querySelectorAll("button")].find((b) => b.textContent.trim() === "Continuer");
  window.__timeline = [];
  window.__robotClicked = false;
  let i = 0;
  const show = () => {
    const [t, d, r] = DECK[i];
    main.querySelector("h3").textContent = t;
    main.querySelector("h3").nextElementSibling.textContent = d;
    badge.textContent = r;
    counter.textContent = String(i + 1);
    prev.disabled = i === 0;
    next.disabled = i === DECK.length - 1;
    window.__timeline.push({ card: i + 1, t: Date.now(), robot: !!document.getElementById("robot") });
  };
  show();
  next.addEventListener("click", () => setTimeout(() => {
    i++;
    show();
    if (PARAMS.has("robot") && i === 2) {
      const box = document.createElement("div");
      box.id = "robot";
      box.setAttribute("role", "dialog");
      box.innerHTML = '<label><input type="checkbox" id="robot-check"> Je ne suis pas un robot</label>';
      box.querySelector("input").addEventListener("click", () => (window.__robotClicked = true));
      document.body.append(box);
      setTimeout(() => {
        window.__robotTimeline = window.__timeline.length;
        box.remove();
      }, 3000);
    }
  }, 250));
  cont.addEventListener("click", () => setTimeout(() => {
    window.__continued = Date.now();
    main.innerHTML = pullsMain(9, "9:58");
  }, 250));
})();
