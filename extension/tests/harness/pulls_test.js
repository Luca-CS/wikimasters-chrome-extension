// Scénarios de la page Paquets (sauf ?state=chain, piloté de l'extérieur par cdp.mjs avec de
// vrais clics). Résultat JSON dans <pre id="wmt-out"> (lu par run.py).
(async function () {
  if (PARAMS.has("open") || STATE === "chain") return;
  const out = { state: STATE };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const shadow = () => document.getElementById("wmt-host") && document.getElementById("wmt-host").shadowRoot;
  const until = async (f, ms = 10000) => {
    const t = Date.now();
    while (Date.now() - t < ms) {
      if (f()) return true;
      await sleep(100);
    }
    return false;
  };
  const snap = () => ({
    texts: [...shadow().querySelectorAll(".big, .muted")].map((e) => e.textContent).filter(Boolean),
    pulled: [...shadow().querySelectorAll(".pull")].map((e) => e.textContent),
    highlighted: [...document.querySelectorAll("[data-wmt]")].map((e) => e.querySelector("h3").textContent),
    stored: window.__store.packs ? { count: window.__store.packs.count, max: window.__store.packs.max, nextMs: window.__store.packs.nextMs } : null,
  });
  try {
    out.mounted = await until(() => shadow());
    await sleep(1500);
    out.dom = { packs: WMT.dom.packs(), reveal: WMT.dom.reveal() };
    out.first = snap();
    if (STATE === "pingpong") {
      // Un « autre onglet » resté sur une page périmée réécrit 10/10 : l'extension ne doit pas répondre.
      const realSet = chrome.storage.local.set;
      let external = 0;
      let total = 0;
      chrome.storage.local.set = async (obj) => {
        if ("packs" in obj) total++;
        return realSet(obj);
      };
      for (let k = 0; k < 6; k++) {
        external++;
        await chrome.storage.local.set({ packs: { count: 10, max: 10, at: Date.now(), nextMs: null } });
        await sleep(700);
      }
      await sleep(1000);
      out.pingpong = { externalWrites: external, extensionWrites: total - external };
    }
    if (STATE === "auto") {
      await until(() => window.__continued, 60000);
      await sleep(1500);
      out.timeline = window.__timeline.map((x) => x.card);
      out.robotPausedAt = window.__robotTimeline || null;
      out.robotClicked = window.__robotClicked;
      out.continued = !!window.__continued;
      out.end = snap();
    }
    if (STATE === "reveal") {
      // Carte suivante : même composant, autre contenu (comme le fait React).
      const main = document.querySelector("main");
      main.querySelector("h3").textContent = "Sydney Park";
      main.querySelector("h3").nextElementSibling.textContent =
        "Sydney Park, née le 31 octobre 1997 à Los Angeles, est une actrice américaine. Elle commence sa carrière enfant.";
      [...main.querySelectorAll("span")].find((s) => s.textContent.trim() === "Carte").nextElementSibling.textContent = "2";
      await sleep(1000);
      out.second = snap();
      main.innerHTML = pullsMain(9, ""); // fin de l'ouverture : un paquet de moins
      await sleep(1500);
      out.after = snap();
    }
  } catch (e) {
    out.error = String((e && e.stack) || e);
  }
  const pre = document.createElement("pre");
  pre.id = "wmt-out";
  pre.textContent = JSON.stringify(out);
  document.body.append(pre);
})();
