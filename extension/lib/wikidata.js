// Enrichissement Wikidata (portage de wmtag/wikidata.py), utilisé par la page Rapport.
// Pour chaque titre de carte (= article de Wikipédia FR) : P31 « nature » et P106
// « occupation », avec leurs libellés français. Le cache a le même format que
// cache/wikidata.json : {titles: {titre: {qid, P31, P106}}, labels: {qid: libellé}}.
// Politesse Wikimedia : lots de 50, une pause entre les requêtes, en-tête Api-User-Agent.
(function (root) {
  const WMT = (root.WMT = root.WMT || {});
  const API = "https://www.wikidata.org/w/api.php";
  const PROPS = ["P31", "P106"];
  const BATCH = 50;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function get(params, userAgent) {
    const url = API + "?" + new URLSearchParams({ ...params, format: "json", formatversion: "2" });
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await fetch(url, { headers: { "Api-User-Agent": userAgent } });
      if (r.status === 429 || r.status >= 500) {
        await sleep(5000 * (attempt + 1));
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const code = data.error && data.error.code;
      if (code === "maxlag" || code === "ratelimited") {
        await sleep(5000 * (attempt + 1));
        continue;
      }
      if (data.error) throw new Error(data.error.info || code);
      await sleep(1000);
      return data;
    }
    throw new Error("Wikidata surchargé, réessaie plus tard.");
  }

  /**
   * Complète `cache` (modifié sur place) pour les titres absents.
   * onProgress(phase, fait, total) ; save() est appelé après chaque lot.
   */
  async function enrich(titles, cache, userAgent, onProgress = () => {}, save = async () => {}) {
    cache.titles = cache.titles || {};
    cache.labels = cache.labels || {};
    const todo = [...new Set(titles)].filter((t) => !(t in cache.titles)).sort();
    for (let i = 0; i < todo.length; i += BATCH) {
      const chunk = todo.slice(i, i + BATCH);
      const data = await get({
        action: "wbgetentities", sites: "frwiki", titles: chunk.join("|"),
        props: "claims|sitelinks", sitefilter: "frwiki",
      }, userAgent);
      const found = new Set();
      for (const ent of Object.values(data.entities || {})) {
        if ("missing" in ent) continue;
        const title = ent.sitelinks && ent.sitelinks.frwiki && ent.sitelinks.frwiki.title;
        if (!title) continue;
        const e = { qid: ent.id };
        for (const p of PROPS) {
          e[p] = ((ent.claims || {})[p] || [])
            .filter((c) => c.mainsnak && c.mainsnak.datavalue)
            .map((c) => c.mainsnak.datavalue.value.id);
        }
        cache.titles[title] = e;
        found.add(title);
      }
      // Titres introuvables (redirection, homonymie...) : mémorisés vides pour ne pas redemander.
      for (const t of chunk) if (!found.has(t) && !(t in cache.titles)) cache.titles[t] = { qid: null };
      onProgress("titles", Math.min(i + BATCH, todo.length), todo.length);
      await save();
    }

    const qids = [...new Set(titles.flatMap((t) => PROPS.flatMap((p) => (cache.titles[t] || {})[p] || [])))]
      .filter((q) => !(q in cache.labels))
      .sort();
    for (let i = 0; i < qids.length; i += BATCH) {
      const chunk = qids.slice(i, i + BATCH);
      const data = await get({ action: "wbgetentities", ids: chunk.join("|"), props: "labels", languages: "fr|en" }, userAgent);
      for (const [qid, ent] of Object.entries(data.entities || {})) {
        const labels = ent.labels || {};
        cache.labels[qid] = (labels.fr || labels.en || {}).value || qid;
      }
      onProgress("labels", Math.min(i + BATCH, qids.length), qids.length);
      await save();
    }
    return cache;
  }

  WMT.wikidata = { enrich };
})(globalThis);
