// Pilote un navigateur lancé avec --remote-debugging-port (protocole Chrome DevTools) :
// - modes d'enchaînement : VRAIS clics souris / touches (Input.dispatch*), seuls à être « isTrusted » ;
// - mode selftest : ouvre la page d'auto-test de l'extension chargée (alarmes, badge, notifications).
// Usage : node cdp.mjs <port> <url> <mode>
//   modes : page | normal | robot | takeover | move | alt | toast | sanction | trustedonly | selftest
//   (page : attend le résultat que le scénario de la page écrit dans <pre id="wmt-out">)
// Écrit un objet JSON sur stdout (analysé par run.py).
const [port, url, mode] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(path, method = "GET") {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}${path}`, { method });
      if (r.ok) return r.json();
    } catch {}
    await sleep(250);
  }
  throw new Error("DevTools injoignable");
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let seq = 0;
  const call = (method, params = {}) => new Promise((resolve) => {
    const id = ++seq;
    ws.addEventListener("message", function on(event) {
      const msg = JSON.parse(event.data);
      if (msg.id === id) {
        ws.removeEventListener("message", on);
        resolve(msg.result);
      }
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
  return { ws, call };
}

const out = { mode };
let page = null;
try {
  await http("/json/version");
  let target = url;
  if (mode === "selftest") {
    // Identifiant de l'extension chargée : celui de son service worker.
    let sw = null;
    for (let i = 0; i < 40 && !sw; i++) {
      sw = (await http("/json/list")).find((t) => t.type === "service_worker" && t.url.endsWith("/background.js"));
      if (!sw) await sleep(250);
    }
    if (!sw) throw new Error("service worker de l'extension introuvable");
    target = sw.url.replace("/background.js", "/pages/_selftest.html");
  }
  const tab = await http(`/json/new?${encodeURIComponent(target)}`, "PUT");
  page = await connect(tab.webSocketDebuggerUrl);
  const { call } = page;
  // Onglet au premier plan et considéré comme actif : sinon Chrome le traite comme masqué
  // (document.hidden, minuteurs ralentis) et l'extension se met en pause comme prévu.
  await call("Page.bringToFront");
  await call("Emulation.setFocusEmulationEnabled", { enabled: true });
  // Journal de la console (exceptions comprises), joint au résultat en cas d'échec.
  out.console = [];
  page.ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === "Runtime.consoleAPICalled") {
      out.console.push(msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200));
    } else if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      out.console.push("EXCEPTION " + ((d.exception && d.exception.description) || d.text).slice(0, 300));
    }
  });
  await call("Runtime.enable");
  const ev = async (expr) => (await call("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  const until = async (expr, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await ev(expr)) return true;
      await sleep(100);
    }
    return false;
  };
  const clickOn = async (expr) => {
    const pt = await ev(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    if (!pt) throw new Error("élément introuvable : " + expr);
    for (const type of ["mousePressed", "mouseReleased"]) {
      await call("Input.dispatchMouseEvent", { type, x: pt[0], y: pt[1], button: "left", clickCount: 1 });
    }
  };
  const key = async (k, code, vk) => {
    const text = k === "Enter" ? { text: String.fromCharCode(13) } : {};
    await call("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, ...text });
    await call("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk });
  };
  const panel = () => ev(`[...document.getElementById("wmt-host").shadowRoot.querySelectorAll(".note, .muted")].map((e) => e.textContent).filter(Boolean)`);
  const done = `__sim.count === 0 && !WMT.dom.reveal() && __sim.continues === 3`;

  out.visibility = await ev(`document.visibilityState`);
  if (mode === "selftest" || mode === "page") {
    await until(`!!document.getElementById("wmt-out")`, 150000);
    Object.assign(out, JSON.parse(await ev(`document.getElementById("wmt-out").textContent`)));
  } else {
    await until(`!!document.getElementById("wmt-host") && !!window.WMT_openButton && !!WMT_openButton()`, 15000);
    // Journal des messages du panneau (ceux qui s'effacent seraient sinon perdus).
    await ev(`(() => { window.__panelLog = []; setInterval(() => {
      const n = document.getElementById("wmt-host").shadowRoot.querySelector(".note");
      const t = n && !n.hidden ? n.textContent : "";
      if (t && __panelLog[__panelLog.length - 1] !== t) __panelLog.push(t);
    }, 200); })()`);
    await sleep(600);
    await clickOn("WMT_openButton()"); // TON clic sur « Ouvrir »
    if (mode === "robot") {
      await until(`!!document.getElementById("robot-check")`, 60000);
      await sleep(1500);
      out.opensWhileRobot = await ev(`__sim.opens.length`);
      await clickOn(`document.getElementById("robot-check")`); // tu valides la vérification
    }
    if (mode === "takeover") {
      await until(`__sim.opens.length >= 2 && !!WMT.dom.reveal() && WMT.dom.reveal().index >= 2`, 60000);
      await clickOn(`[...document.querySelectorAll("main span")].find((s) => s.textContent.trim() === "Carte").parentElement`);
      await sleep(1000);
      out.noteJustAfter = await ev(`document.getElementById("wmt-host").shadowRoot.querySelector(".note").textContent`);
      await sleep(9000);
      out.noteAfter10s = await ev(`(() => { const n = document.getElementById("wmt-host").shadowRoot.querySelector(".note"); return n.hidden ? "" : n.textContent; })()`);
    } else if (mode === "move" || mode === "alt") {
      // Pendant tout l'enchaînement : mouvements du curseur (ou Alt seul) toutes les 150 ms.
      const end = Date.now() + 60000;
      let i = 0;
      while (Date.now() < end && !(await ev(done))) {
        if (mode === "move") await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 200 + (i % 40) * 15, y: 150 + (i % 25) * 20 });
        else await key("Alt", "AltLeft", 18);
        i++;
        await sleep(150);
      }
      out.inputs = i;
      await sleep(1500);
    } else if (mode === "toast") {
      await until(`!!document.getElementById("toast-close")`, 60000);
      await sleep(400);
      await clickOn(`document.getElementById("toast-close")`); // tu fermes le toast
      await until(done, 90000);
      await sleep(1500);
    } else if (mode === "sanction") {
      await until(`!!__sim.extraShown`, 60000);
      await sleep(8000);
    } else if (mode === "trustedonly") {
      await until(`__sim.continues >= 1 && __sim.ignored >= 1`, 60000);
      await until(`(window.__panelLog || []).some((t) => t.includes("clique sur « Ouvrir »"))`, 20000);
      await sleep(500);
      out.afterFirst = { opens: await ev(`__sim.opens.length`), focused: await ev(`document.activeElement === WMT_openButton()`), panel: await panel() };
      await key("Enter", "Enter", 13); // tu appuies sur Entrée : clic humain sur « Ouvrir »
      await until(`__sim.opens.length >= 2`, 5000);
      await sleep(2500);
      out.afterEnter = { opens: await ev(`__sim.opens.map((o) => o.trusted)`) };
    } else {
      await until(done, 90000);
      await sleep(1500);
    }
    out.sim = await ev(`({ count: __sim.count, opens: __sim.opens.map((o) => (o.trusted ? "humain" : "auto") + ":" + o.type), continues: __sim.continues, robotTrusted: __sim.robotTrusted ?? null })`);
    const cards = await ev(`__sim.cards`);
    out.cardDelaysMs = cards.slice(1).map((c, i) => (c.card === 1 ? null : `${cards[i].rarity}:${c.t - cards[i].t}`)).filter(Boolean);
    out.panel = await panel();
    out.panelLog = await ev(`window.__panelLog`);
  }
} catch (e) {
  out.error = String((e && e.stack) || e);
}
console.log(JSON.stringify(out));
try {
  const version = await http("/json/version");
  const browser = await connect(version.webSocketDebuggerUrl);
  browser.ws.send(JSON.stringify({ id: 1, method: "Browser.close" }));
  await sleep(500);
} catch {}
process.exit(0);
