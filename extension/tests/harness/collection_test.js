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
  } catch (e) {
    out.error = String((e && e.stack) || e);
  }
  const pre = document.createElement("pre");
  pre.id = "wmt-out";
  pre.textContent = JSON.stringify(out);
  document.body.append(pre);
})();
