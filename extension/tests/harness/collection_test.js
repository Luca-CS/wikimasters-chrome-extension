// Scénario Collection : proposition d'analyse, surlignage, filtre par étiquette, étiquette posée
// à la main (le surlignage doit partir), analyse des 4 pages, demande de catégorisation.
// Résultat JSON dans <pre id="wmt-out"> (lu par run.py). ?open = panneau ouvert, sans scénario.
(async function () {
  if (location.search.includes("open")) {
    sessionStorage.setItem("wmt-open-collection", "1");
    return;
  }
  const out = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const shadow = () => document.getElementById("wmt-host") && document.getElementById("wmt-host").shadowRoot;
  const btn = (re) => [...shadow().querySelectorAll("button")].find((b) => re.test(b.textContent));
  const until = async (f, ms = 90000) => {
    const t = Date.now();
    while (Date.now() - t < ms) {
      if (f()) return true;
      await sleep(100);
    }
    return false;
  };
  try {
    out.mounted = await until(() => shadow(), 10000);
    await sleep(800);
    if (location.search.includes("sell")) {
      // Vente des SR sans étiquette (les R restent), favoris et shiny gardés, sur toutes les pages.
      const tagsOfRoot = (root) => [...root.querySelectorAll("span.rounded-full")].map((s) => s.textContent.trim());
      const tpl = [...document.querySelectorAll("div.relative.isolate.group")];
      const byBase = new Map(tpl.map((r) => [r.querySelector("h3").textContent.trim(), r]));
      const base = (t) => t.replace(/ ·\d$/, "");
      const protectedTitle = (t) => {
        const r = byBase.get(base(t));
        // La 1re carte est rendue shiny par le simulateur (sur sa copie, pas sur cette page).
        return !!r.querySelector('button[aria-label="Retirer des favoris"]') || r === tpl[0];
      };
      const eligible = window.__inventory.filter((it) => it.rarity === "SR" && !tagsOfRoot(byBase.get(base(it.title))).length);
      out.expected = eligible.filter((it) => !protectedTitle(it.title)).map((it) => it.title).sort();
      out.protectedCount = eligible.length - out.expected.length;
      const chip = (r) => [...shadow().querySelectorAll(".rchip")].find((c) => c.textContent === r);
      chip("SR").click();
      await sleep(400);
      out.chipsOn = [...shadow().querySelectorAll(".rchip.on")].map((c) => c.textContent);
      btn(/^Vendre les cartes sans étiquette/).click();
      await sleep(300);
      btn(/^Oui, vendre ces cartes$/).click();
      out.finished = await until(() => {
        const stop = btn(/Arrêter la vente/);
        const note = shadow().querySelector(".note");
        return stop && stop.hidden && note && !note.hidden && /vendue/.test(note.textContent);
      }, 140000);
      out.note = shadow().querySelector(".note").textContent;
      out.sold = window.__sold.flatMap((s) => s.titles).sort();
      out.missing = out.expected.filter((t) => !out.sold.includes(t));
      out.extra = out.sold.filter((t) => !out.expected.includes(t));
      out.counts = [out.expected.length, out.sold.length];
      delete out.expected;
      delete out.sold;
      out.rounds = window.__sold.map((s) => `p${s.page}:${s.titles.length}`);
      out.filtersReset = !window.__filters.untagged && window.__filters.rarities.size === 0;
      out.clean = !!WMT.dom.selectButton() && !WMT.dom.selectionBar() && !WMT.dom.discardDialog();
    } else if (location.search.includes("autotag")) {
      // Étiquetage automatique des 4 pages, puis vérification page par page.
      const t0 = Date.now();
      btn(/Étiqueter toute la collection/).click();
      await until(() => !shadow().querySelector(".progress, [hidden]") || true, 100);
      out.finished = await until(() => {
        const stop = btn(/Arrêter l'étiquetage/);
        const note = shadow().querySelector(".note");
        return stop && stop.hidden && note && !note.hidden && /posée/.test(note.textContent);
      }, 140000);
      out.seconds = Math.round((Date.now() - t0) / 1000);
      out.note = shadow().querySelector(".note").textContent;
      out.applied = window.__applied.map((a) => `${a.page}:${a.tag}:${a.titles.length}`);
      out.discarded = window.__discarded;
      out.selectionLeft = !!WMT.dom.selectButton() && !WMT.dom.selectionBar() && !WMT.dom.tagModal();
      const rules = WMT.core.compileRules(window.__store.config.rules);
      const known = new Set(window.__store.config.rules.map((r) => r.name));
      out.remaining = [];
      out.pages = [];
      for (const p of [1, 2, 3, 4]) {
        window.__showPage(p);
        await sleep(300);
        const cards = WMT.dom.cards(document, known);
        out.pages.push(cards.length);
        for (const c of cards) {
          for (const m of WMT.core.suggest(c, rules)) if (window.__gameTags.includes(m.tag)) out.remaining.push(`${p}:${c.title}:${m.tag}`);
        }
      }
    } else {
    out.promptVisible = !shadow().querySelector(".prompt").hidden;
    out.highlighted = document.querySelectorAll("[data-wmt]").length;
    out.mathsColor = window.__store.config.rules.find((r) => r.name === "Maths").color;

    const chip = shadow().querySelector(".chip");
    chip.click();
    await sleep(400);
    out.focus = { tag: chip.textContent, highlighted: document.querySelectorAll("[data-wmt]").length };
    chip.click();
    await sleep(400);

    // Étiquette posée à la main sur la 1re carte surlignée.
    const first = document.querySelector("[data-wmt]");
    const tag = first.querySelector(".wmt-chip").textContent;
    const zone = first.querySelector("h3").parentElement.querySelector("div.mt-auto");
    const wrap = document.createElement("div");
    wrap.innerHTML = `<span class="inline-block rounded-full border" style="background-color: rgba(1, 199, 252, 0.38); border-color: rgba(1, 199, 252, 0.52);">${tag}</span>`;
    zone.prepend(wrap);
    await sleep(500);
    out.afterTagging = { stillHighlighted: first.hasAttribute("data-wmt"), highlighted: document.querySelectorAll("[data-wmt]").length };

    // Carte shiny déjà étiquetée : seule l'étiquette Shiny doit lui être suggérée.
    const shinyRoot = first;
    const badge = [...shinyRoot.querySelectorAll("div, span")].find((e) => e.childElementCount === 0 && /^(L|UR|SR|R|PC|C)$/.test(e.textContent.trim()));
    badge.classList.add("shiny-badge");
    badge.innerHTML = `${badge.textContent.trim()}<span aria-hidden="true">✦</span><span class="sr-only"> shiny</span>`;
    await sleep(500);
    const card = WMT.dom.cards(document).find((c) => c.root === shinyRoot);
    out.shiny = {
      detected: !!card && card.shiny,
      rarity: card && card.rarity,
      flags: [...shinyRoot.querySelectorAll(".wmt-chip")].map((c) => c.textContent),
    };

    btn(/Lancer l'analyse/).click();
    out.scanOk = await until(() => window.__store.scanMeta);
    const cs = (window.__store.scan || {}).cards || [];
    out.scanCards = cs.length;
    out.positionsOk = [1, 2, 3, 4].every((p) =>
      cs.filter((c) => c.page === p).map((c) => c.pos).join() === Array.from({ length: 50 }, (_, i) => i + 1).join());
    out.clicks = window.__clicks;
    out.note = shadow().querySelector(".note").textContent;
    btn(/Catégoriser/).click();
    await sleep(200);
    out.msgs = window.__msgs;
    }
  } catch (e) {
    out.error = String((e && e.stack) || e);
  }
  const pre = document.createElement("pre");
  pre.id = "wmt-out";
  pre.textContent = JSON.stringify(out);
  document.body.append(pre);
})();
