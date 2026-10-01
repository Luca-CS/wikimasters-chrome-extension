// Estimation des paquets disponibles (lecture seule : l'extension n'ouvre jamais de paquet).
// Un paquet se recharge toutes les 10 min (compte gratuit) ou 3 min (compte Pro), jusqu'à 10.
// Le relevé {count, max, at, nextMs} est fait sur la page Paquets ; nextMs = temps avant le
// prochain paquet s'il est affiché, sinon null (on suppose alors une recharge complète, ce qui
// donne une estimation prudente : jamais « plein » avant l'heure).
(function (root) {
  const WMT = (root.WMT = root.WMT || {});
  const COOLDOWN_MIN = { free: 10, pro: 3 };

  const cooldownMs = (settings) => (COOLDOWN_MIN[settings && settings.accountType] || COOLDOWN_MIN.free) * 60000;

  /** {count, max, nextAt, fullAt, exact} à l'instant `now`, ou null sans relevé. */
  function estimate(state, cooldown, now = Date.now()) {
    if (!state || !state.max) return null;
    const { count, max, at } = state;
    if (count >= max) return { count: max, max, nextAt: null, fullAt: at, exact: true };
    const first = at + (state.nextMs != null ? state.nextMs : cooldown);
    const fullAt = first + (max - count - 1) * cooldown;
    if (now < first) return { count, max, nextAt: first, fullAt, exact: state.nextMs != null };
    const gained = 1 + Math.floor((now - first) / cooldown);
    const n = Math.min(max, count + gained);
    return { count: n, max, nextAt: n >= max ? null : first + gained * cooldown, fullAt, exact: state.nextMs != null };
  }

  const fmtTime = (t) => new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  function fmtDelay(ms) {
    const min = Math.max(0, Math.round(ms / 60000));
    if (min < 1) return "moins d'une minute";
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
  }

  /** Phrase courte : « plein vers 15:42 (dans 1 h 10) » ou « plein ». */
  function describe(est, now = Date.now()) {
    if (!est) return "pas encore de relevé : passe sur la page Paquets";
    if (est.count >= est.max) return "plein : ouvre-les pour ne pas perdre de temps de recharge";
    return `plein vers ${fmtTime(est.fullAt)} (dans ${fmtDelay(est.fullAt - now)})`;
  }

  WMT.packs = { COOLDOWN_MIN, cooldownMs, estimate, fmtTime, fmtDelay, describe };
  if (typeof module !== "undefined") module.exports = WMT.packs;
})(globalThis);
