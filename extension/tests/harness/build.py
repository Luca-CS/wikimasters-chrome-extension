"""Construit les pages du banc de test dans extension/tests/harness/out/ (ignoré par git).

Les pages réelles du site viennent de input/ (données perso, jamais versionnées) :
  - snapshot de la page Collection : fichier HTML contenant « Page X / Y » et des cartes ;
  - export de l'écran d'ouverture d'un paquet : fichier contenant « Continuer » et « Carte » ;
  - CSS du site (facultatif, pour les captures) : *.css sous input/ (ex. WikiMasters_files/).
Les fichiers sont reconnus par leur contenu, pas par leur nom.

Pages produites (servies par run.py, chemins identiques au site pour que l'extension s'y active) :
  out/collection/index.html   page Collection + fausse pagination + scénario
  out/pulls/index.html        page Paquets (états via ?state=…, voir pulls_setup.js)
  out/ext/                     copie de l'extension
  out/ext_selftest/            copie de l'extension + page d'auto-test du service worker
"""
import json
import re
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
INPUT = ROOT / "input"
OUT = HERE / "out"

EXT_SCRIPTS = ["lib/store.js", "lib/packs.js", "lib/rhythm.js", "lib/dom.js", "content/content.js"]


def find_input(test) -> Path | None:
    for f in sorted(INPUT.glob("*.html")):
        text = f.read_text(encoding="utf-8", errors="ignore")
        if test(text):
            return f
    return None


def strip_site(html: str) -> str:
    """Retire les scripts du site (on ne fait jamais tourner son code) et le préchargement."""
    if html.startswith("http"):
        html = html.split("\n", 1)[1]
    html = re.sub(r"<script\b[^>]*>.*?</script>", "", html, flags=re.S | re.I)
    html = re.sub(r"<link[^>]+(preload|modulepreload)[^>]*>", "", html)
    return re.sub(r'<link[^>]+rel="stylesheet"[^>]*>', "", html)


def css_links(css_files) -> str:
    return "".join(f'<link rel="stylesheet" href="/css/{f.name}">' for f in css_files)


def scripts(*paths) -> str:
    return "\n".join(f'<script src="{p}"></script>' for p in paths)


def extension_block(test_script: str) -> str:
    return "\n".join([
        '<link rel="stylesheet" href="/ext/content/content.css">',
        scripts(*[f"/ext/{s}" for s in EXT_SCRIPTS]),
        scripts(test_script),
    ])


def main() -> dict:
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir(parents=True)
    shutil.copytree(ROOT / "extension", OUT / "ext", ignore=shutil.ignore_patterns("tests"))
    for f in ("shim.js", "collection_setup.js", "collection_test.js", "pulls_setup.js", "chain_sim.js", "pulls_test.js"):
        (OUT / "harness").mkdir(exist_ok=True)
        shutil.copy(HERE / f, OUT / "harness" / f)

    css = sorted(INPUT.rglob("*.css"))
    (OUT / "css").mkdir()
    for f in css:
        shutil.copy(f, OUT / "css" / f.name)

    built = {}
    head_scripts = scripts("/harness/shim.js", "/ext/lib/core.js", "/ext/lib/defaults.js")

    collection = find_input(lambda t: re.search(r"Page\s+\d+\s*/\s*\d+", t) and "isolate group" in t)
    if collection:
        html = strip_site(collection.read_text(encoding="utf-8"))
        html = html.replace("</head>", css_links(css) + "</head>", 1)
        body = "\n".join([head_scripts, scripts("/harness/collection_setup.js"), extension_block("/harness/collection_test.js")])
        (OUT / "collection").mkdir()
        (OUT / "collection" / "index.html").write_text(html.replace("</body>", body + "\n</body>"), encoding="utf-8")
        built["collection"] = collection.name

    reveal = find_input(lambda t: re.search(r">\s*Continuer\s*<", t) and re.search(r">\s*Carte\s*<", t))
    reveal_main = ""
    if reveal:
        src = reveal.read_text(encoding="utf-8")
        reveal_main = src[src.index("<main"):src.index("</main>")]
        reveal_main = re.sub(r"<script\b.*?</script>", "", reveal_main[reveal_main.index(">") + 1:], flags=re.S)
        built["reveal"] = reveal.name
    (OUT / "pulls").mkdir()
    (OUT / "pulls" / "reveal.js").write_text(f"window.REVEAL = {json.dumps(reveal_main)};\n", encoding="utf-8")
    page = "\n".join([
        '<!doctype html><html lang="fr" class="h-full"><head><meta charset="utf-8">',
        css_links(css),
        '</head><body class="min-h-full flex flex-col antialiased">',
        '<div class="flex h-dvh max-h-dvh flex-col overflow-hidden md:flex-row"><main class="min-h-0 flex-1 overflow-y-auto md:pt-0"></main></div>',
        scripts("/pulls/reveal.js", "/harness/pulls_setup.js", "/harness/chain_sim.js"),
        head_scripts,
        extension_block("/harness/pulls_test.js"),
        "</body></html>",
    ])
    (OUT / "pulls" / "index.html").write_text(page, encoding="utf-8")
    built["pulls"] = True

    shutil.copytree(ROOT / "extension", OUT / "ext_selftest", ignore=shutil.ignore_patterns("tests"))
    shutil.copy(HERE / "selftest.js", OUT / "ext_selftest" / "pages" / "_selftest.js")
    (OUT / "ext_selftest" / "pages" / "_selftest.html").write_text(
        '<!doctype html><html><head><meta charset="utf-8"></head><body>…<script src="_selftest.js"></script></body></html>',
        encoding="utf-8")
    built["css"] = len(css)
    return built


if __name__ == "__main__":
    print(main())
