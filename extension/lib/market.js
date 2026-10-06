// Collecte du marché en lecture seule, pour l'aide à la décision (accord de l'équipe WikiMasters
// pour un projet académique, 06/10/2026). Aucune enchère n'est jamais placée.
//
// Méthode : on tire les annonces les plus récentes (un échantillon du flux), puis on lit chacune
// une seule fois après sa fin. Le détail d'une enchère terminée donne tout son déroulé (prix de
// départ, baisse éventuelle, mises horodatées, vendue ou non), ce qui évite de surveiller les fins
// d'enchères en direct. L'historique de prix d'une carte n'est lu qu'une fois par carte.
//
// Logique pure (testée sous Node) : échantillonnage, choix de la prochaine requête, réaction aux
// limites du site. background.js fait les requêtes, marketdb.js stocke.
(function (root) {
  const WMT = (root.WMT = root.WMT || {});
  const MIN = 60000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  const DEFAULTS = {
    on: false,
    everySec: 60, // au plus une requête par intervalle
    dailyCap: 1000, // requêtes par jour (date locale)
    pRest: 0.15, // part des C, PC, R et SR suivies ; les L, UR et shiny le sont toujours
    listEveryMin: 15, // au plus une lecture des nouvelles annonces par intervalle
    maxWaiting: 300, // pas de nouvelles annonces tant que ce nombre attend sa fin
    salesMaxAgeH: 6, // historique de prix considéré à jour s'il a été lu moins de 6 h avant la fin
    hours: [9, 24], // heures actives (heure locale) : pas de requêtes la nuit
    exportEveryH: 3, // copie des données dans Téléchargements/wikimasters-marche/collecte.json
  };

  const BASE = "https://www.wiki-masters.com";
  const url = {
    list: () => `${BASE}/api/marketplace?page=1&limit=50&sort=recent`,
    detail: (id) => `${BASE}/api/marketplace/${id}`,
    sales: (cardId) => `${BASE}/api/marketplace/cards/${cardId}/sales`,
  };

  /** Mise minimale acceptée par le site (son code, 06/10/2026) : +10 % arrondi au-dessus, +1 au moins. */
  const minBid = (current, base) => (current == null ? base : Math.max(Math.ceil(1.1 * current), current + 1));

  /** Probabilité de suivre une annonce : toujours les L, UR et shiny, une part `pRest` des autres. */
  const watchProb = (rarity, shiny, pRest) => (shiny || rarity === "L" || rarity === "UR" ? 1 : pRest);

  const time = (iso) => (iso ? Date.parse(iso) : null);

  /** Annonce de la liste réduite à ce qui sert à l'analyse. */
  function listing(a, now) {
    const c = a.card || {};
    return {
      id: a.id,
      card: a.card_id,
      seller: a.seller_id,
      base: a.base_amount,
      lbase: a.listing_base_amount,
      bid: a.current_bid,
      cr: time(a.created_at),
      end: time(a.end_at),
      rarity: a.snapshot_rarity,
      shiny: !!a.is_shiny,
      atk: a.snapshot_atk,
      def: a.snapshot_def,
      title: c.wikipedia_title || null,
      cardRarity: c.rarity || null,
      pageviews: c.pageviews ?? null,
      q: c.q_score ?? null,
      category: c.category || null,
      seenAt: now,
    };
  }

  /**
   * Annonces à suivre parmi une page de la liste, avec leur poids (1 / probabilité de tirage, pour
   * des statistiques non biaisées) et l'heure à laquelle lire leur résultat : 3 à 8 min après la fin,
   * le temps que le site règle l'enchère.
   */
  function sample(auctions, opts, now, rand = Math.random) {
    const out = [];
    for (const a of auctions || []) {
      const p = watchProb(a.snapshot_rarity, !!a.is_shiny, opts.pRest);
      if (rand() >= p) continue;
      const rec = listing(a, now);
      if (!rec.id || !rec.end) continue;
      out.push({ ...rec, w: 1 / p, due: rec.end + 3 * MIN + Math.round(rand() * 5 * MIN), state: "wait", tries: 0 });
    }
    return out;
  }

  /** Détail d'une enchère réduit à son déroulé. */
  function detail(d) {
    const x = (d && d.auction) || {};
    return {
      status: x.status,
      final: x.final_price,
      winner: x.winner_id,
      settledAt: time(x.settled_at),
      end: time(x.end_at),
      base: x.base_amount,
      lbase: x.listing_base_amount,
      repricedAt: time(x.base_repriced_at),
      bids: ((d && d.bids) || []).map((b) => [b.amount, time(b.placed_at), b.bidder_id]),
    };
  }

  /** Enchère suivie après lecture de son détail : terminée, ou relue 5 min plus tard si pas encore réglée. */
  function afterDetail(rec, d, now) {
    const det = detail(d);
    const settled = det.status && det.status !== "active";
    if (!settled && rec.tries < 5) return { ...rec, tries: rec.tries + 1, due: now + 5 * MIN };
    return { ...rec, state: "done", doneAt: now, detail: det };
  }

  /** Faut-il (re)lire l'historique de prix de la carte d'une enchère terminée ? */
  const needsSales = (card, rec, opts) => !card || card.at < rec.end - opts.salesMaxAgeH * HOUR;

  /** Historique de prix d'une carte, tel que l'affiche la « Vue du marché ». */
  function cardSales(cardId, s, now) {
    return {
      id: cardId,
      title: (s && s.wikipedia_title) || null,
      sales: ((s && s.sales) || []).map((x) => [x.final_price, x.rarity, time(x.settled_at), x.id]),
      at: now,
    };
  }

  /**
   * Nature d'une réponse. Un 403 du site veut dire « trop de requêtes automatisées »
   * (code automation_limit, vu le 06/10/2026) : on s'arrête net.
   */
  function classify(status) {
    if (status >= 200 && status < 300) return "ok";
    if (status === 403) return "blocked";
    if (status === 429) return "slow";
    if (status === 401) return "auth";
    if (status === 404) return "gone";
    return "error";
  }

  const dayKey = (now) => new Date(now).toDateString();

  /** Peut-on faire une requête maintenant ? {ok, why}. */
  function canRequest(s, now) {
    if (!s.on) return { ok: false, why: "off" };
    if (s.backoffUntil && now < s.backoffUntil) return { ok: false, why: "pause" };
    const hour = new Date(now).getHours();
    if (hour < s.hours[0] || hour >= s.hours[1]) return { ok: false, why: "hours" };
    const used = s.today && s.today.day === dayKey(now) ? s.today.n : 0;
    if (used >= s.dailyCap) return { ok: false, why: "cap" };
    if (s.lastAt && now - s.lastAt < s.everySec * 1000 * 0.8) return { ok: false, why: "spacing" };
    return { ok: true, why: null };
  }

  /** État après une réponse : compteur du jour, pause et rythme. */
  function account(s, kind, now) {
    const day = dayKey(now);
    const n = s.today && s.today.day === day ? s.today.n + 1 : 1;
    const next = { ...s, lastAt: now, today: { day, n }, lastKind: kind };
    if (kind === "ok" || kind === "gone") return { ...next, errors: 0, lastError: null };
    if (kind === "blocked") {
      if (s.blockedAt && now - s.blockedAt < 7 * DAY) {
        return stop(next, "Deuxième blocage « trop de requêtes automatisées » en moins de 7 jours : collecte arrêtée. Relance-la à la main si tu le décides.", now);
      }
      return {
        ...next,
        backoffUntil: now + DAY,
        everySec: Math.min(s.everySec * 2, 600),
        blockedAt: now,
        lastError: "Le site a répondu « trop de requêtes automatisées » : pause de 24 h, puis deux fois moins de requêtes.",
      };
    }
    if (kind === "slow") {
      return { ...next, backoffUntil: now + 30 * MIN, everySec: Math.min(s.everySec * 2, 600), lastError: "Le site demande de ralentir (429) : pause de 30 min, rythme divisé par deux." };
    }
    if (kind === "auth") {
      return { ...next, backoffUntil: now + 10 * MIN, lastError: "Pas connecté à WikiMasters (401) : connecte-toi sur le site, nouvel essai dans 10 min." };
    }
    const errors = (s.errors || 0) + 1;
    return {
      ...next,
      errors,
      backoffUntil: errors >= 3 ? now + Math.min(errors * 5 * MIN, HOUR) : s.backoffUntil,
      lastError: `Erreur du site ou du réseau (${errors} de suite).`,
    };
  }

  /** Arrêt complet de la collecte (seul toi peux la relancer, depuis la config). */
  const stop = (s, reason, now) => ({ ...s, on: false, stoppedAt: now, lastError: reason });

  /**
   * Prochaine requête à faire, ou null. Priorité : résultat d'une enchère terminée, puis nouvelles
   * annonces (si la file d'attente n'est pas pleine), puis historique de prix d'une carte.
   * queue = {due: id d'une enchère à relire | null, waiting: nombre en attente, todo: id de carte | null}.
   */
  function nextTask(queue, s, now) {
    if (queue.due) return { kind: "detail", id: queue.due };
    const listDue = !s.lastListAt || now - s.lastListAt >= s.listEveryMin * MIN;
    if (listDue && queue.waiting < s.maxWaiting) return { kind: "list" };
    if (queue.todo) return { kind: "sales", id: queue.todo };
    return null;
  }

  const urlFor = (task) => (task.kind === "list" ? url.list() : task.kind === "detail" ? url.detail(task.id) : url.sales(task.id));

  WMT.market = {
    DEFAULTS, BASE, url, urlFor, minBid, watchProb, listing, sample, detail, afterDetail,
    needsSales, cardSales, classify, canRequest, account, stop, nextTask, dayKey,
  };
  if (typeof module !== "undefined") module.exports = WMT.market;
})(globalThis);
