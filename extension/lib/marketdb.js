// Données de la collecte du marché (IndexedDB « wmt-market », partagée par le service worker et la
// page Config) : enchères suivies, historiques de prix des cartes, file des cartes à lire, journal
// des requêtes. Trop volumineux pour chrome.storage.local.
//   auctions : {id, card, base, …, w, due, state: "wait" | "done" | "gone", detail?}
//   cards    : {id, title, sales: [[prix, rareté, date, id d'enchère]], at}
//   todo     : {id (carte), at}
//   log      : {t, kind, status, ms}
(function (root) {
  const WMT = (root.WMT = root.WMT || {});
  const NAME = "wmt-market";
  const LOG_MAX = 5000;
  let opening = null;

  const req = (r) => new Promise((ok, ko) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });

  function open() {
    if (opening) return opening;
    opening = new Promise((ok, ko) => {
      const r = indexedDB.open(NAME, 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        const a = db.createObjectStore("auctions", { keyPath: "id" });
        a.createIndex("due", ["state", "due"]);
        db.createObjectStore("cards", { keyPath: "id" });
        db.createObjectStore("todo", { keyPath: "id" });
        db.createObjectStore("log", { autoIncrement: true });
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => {
        opening = null;
        ko(r.error);
      };
    });
    return opening;
  }

  async function tx(stores, mode, fn) {
    const db = await open();
    const t = db.transaction(stores, mode);
    const done = new Promise((ok, ko) => {
      t.oncomplete = ok;
      t.onerror = () => ko(t.error);
      t.onabort = () => ko(t.error);
    });
    const out = await fn(...[].concat(stores).map((s) => t.objectStore(s)));
    await done;
    return out;
  }

  const get = (store, id) => tx(store, "readonly", (s) => req(s.get(id)));
  const put = (store, value) => tx(store, "readwrite", (s) => req(s.put(value)));
  const del = (store, id) => tx(store, "readwrite", (s) => req(s.delete(id)));

  /** Ajoute les enchères pas encore suivies ; renvoie le nombre ajouté. */
  function addAuctions(list) {
    return tx("auctions", "readwrite", async (s) => {
      let n = 0;
      for (const a of list) {
        if (await req(s.getKey(a.id))) continue;
        s.put(a);
        n++;
      }
      return n;
    });
  }

  /** Ce qu'il faut pour choisir la prochaine requête (voir market.nextTask). */
  function queue(now) {
    return tx(["auctions", "todo"], "readonly", async (a, t) => {
      const due = await req(a.index("due").getKey(IDBKeyRange.bound(["wait", 0], ["wait", now])));
      const waiting = await req(a.index("due").count(IDBKeyRange.bound(["wait", 0], ["wait", Infinity])));
      const todo = await req(t.getKey(IDBKeyRange.lowerBound("")));
      return { due: due || null, waiting, todo: todo || null };
    });
  }

  function log(entry) {
    return tx("log", "readwrite", async (s) => {
      s.add(entry);
      const n = await req(s.count());
      if (n <= LOG_MAX) return;
      const keys = await req(s.getAllKeys(null, n - LOG_MAX));
      for (const k of keys) s.delete(k);
    });
  }

  async function stats() {
    return tx(["auctions", "cards", "todo", "log"], "readonly", async (a, c, t, l) => {
      const idx = a.index("due");
      const [waiting, done, gone, cards, todo, last] = await Promise.all([
        req(idx.count(IDBKeyRange.bound(["wait", 0], ["wait", Infinity]))),
        req(idx.count(IDBKeyRange.bound(["done", 0], ["done", Infinity]))),
        req(idx.count(IDBKeyRange.bound(["gone", 0], ["gone", Infinity]))),
        req(c.count()),
        req(t.count()),
        new Promise((ok, ko) => {
          const out = [];
          const r = l.openCursor(null, "prev");
          r.onerror = () => ko(r.error);
          r.onsuccess = () => {
            const cur = r.result;
            if (!cur || out.length >= 8) return ok(out);
            out.push(cur.value);
            cur.continue();
          };
        }),
      ]);
      return { waiting, done, gone, cards, todo, last };
    });
  }

  function exportAll() {
    return tx(["auctions", "cards", "log"], "readonly", async (a, c, l) => ({
      auctions: await req(a.getAll()),
      cards: await req(c.getAll()),
      log: await req(l.getAll()),
    }));
  }

  function clear() {
    return tx(["auctions", "cards", "todo", "log"], "readwrite", async (...stores) => {
      for (const s of stores) s.clear();
    });
  }

  WMT.marketdb = { open, get, put, del, addAuctions, queue, log, stats, exportAll, clear };
})(globalThis);
