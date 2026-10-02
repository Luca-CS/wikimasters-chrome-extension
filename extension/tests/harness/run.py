"""Banc de test de l'extension dans un vrai navigateur (Edge ou Chrome sans interface).

    python extension/tests/harness/run.py              # tous les scénarios
    python extension/tests/harness/run.py chain        # seulement ceux dont le nom contient « chain »

Construit les pages (build.py), les sert en local, puis :
  - scénarios « page » : le scénario tourne dans la page, cdp.mjs attend son résultat ;
  - scénarios « cdp » : vrais clics/touches envoyés par cdp.mjs (enchaînement des paquets) ;
  - auto-test du service worker dans l'extension chargée (--load-extension).
Nécessite Node.js et Edge ou Chrome (chemin forçable avec WMT_BROWSER). Les scénarios dont
les pages réelles manquent dans input/ sont sautés.
"""
import contextlib
import functools
import http.server
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build  # noqa: E402

BROWSERS = [
    os.environ.get("WMT_BROWSER", ""),
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
]
BASE_ARGS = ["--headless=new", "--disable-gpu", "--no-first-run", "--window-size=1300,950"]


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass  # les 404 des images du site (non copiées) n'intéressent personne


@contextlib.contextmanager
def serve(root: Path):
    handler = functools.partial(QuietHandler, directory=str(root))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", free_port()), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()


def browser_path() -> str:
    for b in BROWSERS:
        if b and Path(b).exists():
            return b
    sys.exit("Ni Edge ni Chrome trouvé : renseigne WMT_BROWSER.")


def cdp(browser, url, mode, extra=()) -> dict:
    """Lance le navigateur avec le débogage distant et laisse cdp.mjs piloter la page."""
    port = free_port()
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as profile:
        proc = subprocess.Popen([browser, *BASE_ARGS, f"--remote-debugging-port={port}",
                                 f"--user-data-dir={profile}", *extra, "about:blank"],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            res = subprocess.run(["node", str(HERE / "cdp.mjs"), str(port), url, mode],
                                 capture_output=True, timeout=240, encoding="utf-8")
            line = (res.stdout.strip().splitlines() or ["{}"])[-1]
            return json.loads(line) if line.startswith("{") else {"error": res.stderr[-500:] or "pas de sortie"}
        except subprocess.TimeoutExpired:
            return {"error": "délai dépassé"}
        finally:
            proc.kill()
            proc.wait(timeout=30)


# --- Vérifications -------------------------------------------------------------------------

def check(name, ok_list, out):
    failed = [label for label, ok in ok_list if not ok]
    status = "✓" if not failed and "error" not in out else "✗"
    print(f"{status} {name}")
    if "error" in out:
        print("    erreur :", str(out["error"])[:400])
    for label in failed:
        print("    échec :", label)
    if status == "✗":
        print("    résultat :", json.dumps(out, ensure_ascii=False)[:1500])
    return status == "✓"


def opens(out):
    return (out.get("sim") or {}).get("opens", [])


CHAIN_DONE = lambda o: [  # noqa: E731
    ("3 paquets ouverts : ton clic + 2 automatiques", len(opens(o)) == 3 and opens(o)[0].startswith("humain") and all(x.startswith("auto") for x in opens(o)[1:])),
    ("enchaînement terminé", any("Enchaînement terminé" in t for t in o.get("panel", []))),
]

SCENARIOS = [
    # (nom, type, url, mode/budget, vérifications)
    ("collection", "page", "/collection/", None, lambda o: [
        ("panneau monté et proposition d'analyse", o.get("mounted") and o.get("promptVisible")),
        ("cartes surlignées", o.get("highlighted", 0) > 0),
        ("couleur Maths reprise du jeu", o.get("mathsColor") != "#000000"),
        ("surlignage retiré quand l'étiquette est posée", (o.get("afterTagging") or {}).get("stillHighlighted") is False),
        ("carte shiny reconnue, Shiny seule suggérée", (o.get("shiny") or {}).get("detected") is True
            and (o.get("shiny") or {}).get("flags") == ["Shiny"] and len((o.get("shiny") or {}).get("rarity") or "") <= 2),
        ("4 pages lues, 200 cartes, positions exactes", o.get("scanCards") == 200 and o.get("positionsOk") and o.get("clicks") == 4),
        ("catégorisation demandée", (o.get("msgs") or [{}])[0].get("page") == "report"),
    ]),
    ("pulls-full", "page", "/pulls/?state=full", None, lambda o: [
        ("compteur 10/10 lu", o.get("dom", {}).get("packs") == {"count": 10, "max": 10, "nextMs": None}),
        ("relevé enregistré", (o.get("first", {}).get("stored") or {}).get("count") == 10),
    ]),
    ("pulls-regen", "page", "/pulls/?state=regen", None, lambda o: [
        ("minuteur « 1:43 » lu", (o.get("dom", {}).get("packs") or {}).get("nextMs") == 103000),
    ]),
    ("pulls-reveal", "page", "/pulls/?state=reveal", "reveal", lambda o: [
        ("écran d'ouverture reconnu", bool(o.get("dom", {}).get("reveal"))),
        ("2e carte suggérée en Cinéma", any("Sydney Park" in p and "Cinéma" in p for p in o.get("second", {}).get("pulled", []))),
        ("retour à 9/10 enregistré", (o.get("after", {}).get("stored") or {}).get("count") == 9),
    ]),
    ("pulls-auto-robot", "page", "/pulls/?state=auto&robot", "reveal", lambda o: [
        ("5 cartes défilées dans l'ordre", o.get("timeline") == [1, 2, 3, 4, 5]),
        ("pause pendant la vérification (carte 3)", o.get("robotPausedAt") == 3),
        ("vérification jamais touchée", o.get("robotClicked") is False),
        ("« Continuer » cliqué", o.get("continued") is True),
        ("carte shiny : Shiny suggérée en plus de Royauté", any("Ptolémée II" in p and "Shiny" in p and "Royauté" in p
                                                             for p in (o.get("end") or {}).get("pulled", []))),
    ]),
    ("pulls-pingpong", "page", "/pulls/?state=pingpong", None, lambda o: [
        ("aucune réécriture face à un autre onglet", (o.get("pingpong") or {}).get("extensionWrites") == 0),
    ]),
    ("chain-normal", "cdp", "/pulls/?state=chain", "normal", CHAIN_DONE),
    ("chain-opendown", "cdp", "/pulls/?state=chain&opendown", "normal", CHAIN_DONE),
    ("chain-disabledflash", "cdp", "/pulls/?state=chain&disabledflash", "normal", CHAIN_DONE),
    ("chain-robot", "cdp", "/pulls/?state=chain&robot", "robot", lambda o: [
        ("aucune ouverture pendant la vérification", o.get("opensWhileRobot") == 1),
        ("validée par toi, puis enchaînement terminé", (o.get("sim") or {}).get("robotTrusted") is True and len(opens(o)) == 3),
    ]),
    ("chain-takeover", "cdp", "/pulls/?state=chain", "takeover", lambda o: [
        ("arrêt quand tu cliques ailleurs", len(opens(o)) == 2 and "pris la main" in (o.get("noteJustAfter") or "")),
        ("message effacé tout seul", o.get("noteAfter10s") == ""),
    ]),
    ("chain-popup", "cdp", "/pulls/?state=chain&popup", "normal", lambda o: CHAIN_DONE(o) + [
        ("pause affichée pendant l'annonce", any("Pause" in t for t in o.get("panelLog", []))),
    ]),
    ("chain-openerror", "cdp", "/pulls/?state=chain&openerror", "normal", CHAIN_DONE),
    ("chain-toast", "cdp", "/pulls/?state=chain&toast", "toast", CHAIN_DONE),
    ("chain-sanction", "cdp", "/pulls/?state=chain&sanction", "sanction", lambda o: [
        ("aucune ouverture pendant la sanction", len(opens(o)) == 1),
        ("arrêt expliqué", any("sanction" in t for t in o.get("panel", []))),
    ]),
    ("chain-move", "cdp", "/pulls/?state=chain", "move", lambda o: [("mouvements du curseur sans effet", len(opens(o)) == 3)]),
    ("chain-alt", "cdp", "/pulls/?state=chain", "alt", lambda o: [("touche Alt seule sans effet", len(opens(o)) == 3)]),
    ("chain-trustedonly", "cdp", "/pulls/?state=chain&trustedonly", "trustedonly", lambda o: [
        ("aucun forçage : message et bouton en focus", (o.get("afterFirst") or {}).get("focused") is True
            and any("clique sur « Ouvrir »" in t for t in (o.get("afterFirst") or {}).get("panel", []))),
        ("ton Entrée relance", (o.get("afterEnter") or {}).get("opens", [])[:2] == [True, True]),
    ]),
    ("service-worker", "selftest", None, "selftest", lambda o: [
        ("badge et alarme « plein » (gratuit : 24 min)", o.get("free", {}).get("badge") == "7"
            and any(a["name"] == "wmt-full" and 23 <= a["inMin"] <= 25 for a in o.get("free", {}).get("alarms", []))),
        ("compte Pro : plein en 10 min, prochain en 4", any(a["name"] == "wmt-full" and 9 <= a["inMin"] <= 11 for a in o.get("pro", {}).get("alarms", []))
            and any(a["name"] == "wmt-next" and 3 <= a["inMin"] <= 5 for a in o.get("pro", {}).get("alarms", []))),
        ("stock plein : badge 10, plus d'alarme d'ouverture", o.get("full", {}).get("badge") == "10"
            and not any(a["name"] in ("wmt-full", "wmt-next") for a in o.get("full", {}).get("alarms", []))),
        ("bouton de test de notification", (o.get("testNotif") or {}).get("ok") is True),
    ]),
]


def main(argv):
    built = build.main()
    browser = browser_path()
    if not shutil.which("node"):
        sys.exit("Node.js introuvable.")
    print(f"Pages construites : {built}\nNavigateur : {browser}\n")
    wanted = argv[1:] or [""]
    results = []
    with serve(build.OUT) as base:
        for name, kind, path, mode, checks in SCENARIOS:
            if not any(w in name for w in wanted):
                continue
            if name == "collection" and "collection" not in built:
                print(f"- {name} : sauté (aucun snapshot de la page Collection dans input/)")
                continue
            if (mode == "reveal" or kind == "cdp") and "reveal" not in built:
                print(f"- {name} : sauté (aucun export de l'écran d'ouverture dans input/)")
                continue
            if kind == "page":
                out = cdp(browser, base + path, "page")
            elif kind == "cdp":
                out = cdp(browser, base + path, mode)
            else:
                extra = ["--disable-features=DisableLoadExtensionCommandLineSwitch", f"--load-extension={build.OUT / 'ext_selftest'}"]
                out = cdp(browser, "", "selftest", extra)
            results.append(check(name, checks(out), out))
    print(f"\n{sum(results)} / {len(results)} scénarios réussis.")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
