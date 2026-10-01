// Rythme de défilement « naturel » pour l'écran d'ouverture des paquets.
//
// délai = base × facteur + temps de lecture
//  - facteur : log-normal de moyenne 1, piloté par un processus AR(1) sur l'échelle log
//    (z ← φ·z + √(1−φ²)·σ·N(0,1)). Les délais successifs sont corrélés : le rythme dérive
//    doucement au lieu de sauter au hasard comme un bruit blanc. Borné à [0,6 ; 1,8] × base.
//  - temps de lecture : un peu plus long pour les textes longs, et pour les cartes UR / L.
// Coût : un tirage gaussien (Box-Muller) par carte.
(function (root) {
  const WMT = (root.WMT = root.WMT || {});

  function gaussian(rng) {
    let u = 0;
    while (!u) u = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  }

  /** Générateur de délais. rng injectable (tests) ; sigma = dispersion, phi = mémoire du rythme. */
  function createRhythm({ sigma = 0.2, phi = 0.65, rng = Math.random } = {}) {
    let z = sigma * gaussian(rng); // état stationnaire dès le départ
    return {
      factor() {
        z = phi * z + Math.sqrt(1 - phi * phi) * sigma * gaussian(rng);
        return Math.min(1.8, Math.max(0.6, Math.exp(z - (sigma * sigma) / 2)));
      },
    };
  }

  /** Temps de lecture ajouté selon la carte : texte long, rareté. */
  function readingMs(card) {
    if (!card) return 0;
    const chars = (card.title || "").length + Math.min(240, (card.desc || "").length);
    const reading = Math.min(1200, Math.max(0, chars - 60) * 8);
    const rare = card.rarity === "L" ? 3000 : card.rarity === "UR" ? 2500 : 0;
    return reading + rare;
  }

  WMT.rhythm = { createRhythm, readingMs, gaussian };
  if (typeof module !== "undefined") module.exports = WMT.rhythm;
})(globalThis);
