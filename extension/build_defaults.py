"""Génère extension/lib/defaults.js à partir de rules.toml, themes.toml et config.toml.

Ces valeurs servent à la première installation de l'extension et au bouton
« Réinitialiser » de sa page Config. Relance ce script après avoir modifié les
fichiers TOML :

    python extension/build_defaults.py

L'adresse e-mail de config.toml n'est volontairement pas copiée (le fichier généré
est versionné) : elle se renseigne dans la page Config de l'extension.
"""
import json
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Couleurs relevées dans le jeu. Les autres étiquettes prennent une couleur de la palette,
# remplacée automatiquement par celle du jeu dès que l'extension la voit sur une carte.
GAME_COLORS = {"Automobile": "#86efac", "Maths": "#01c7fc", "Mythologie": "#fb7185", "Musique": "#5eead4"}
PALETTE = ["#fbbf24", "#a78bfa", "#f472b6", "#60a5fa", "#fb923c", "#a3e635", "#f87171", "#22d3ee",
           "#e879f9", "#facc15", "#4ade80", "#38bdf8", "#c084fc", "#2dd4bf", "#fda4af", "#93c5fd"]


def rules(path: Path, offset: int = 0) -> list[dict]:
    tags = tomllib.loads(path.read_text(encoding="utf-8")).get("tags", {})
    return [{"name": name,
             "color": GAME_COLORS.get(name, PALETTE[(i + offset) % len(PALETTE)]),
             "keywords": spec.get("keywords", []),
             "titleKeywords": spec.get("title_keywords", [])}
            for i, (name, spec) in enumerate(tags.items())]


def main():
    cfg = tomllib.loads((ROOT / "config.toml").read_text(encoding="utf-8"))
    config = {
        "version": 1,
        "rules": rules(ROOT / "rules.toml"),
        "themes": rules(ROOT / "themes.toml", offset=5),
        "settings": {
            "minCount": cfg.get("min_count", 3),
            "wikidata": cfg.get("wikidata", False),
            "contact": "",
            "pageDelay": 1000,
            "highlight": True,
            "highlightStyle": "ring",
            "autoPrompt": True,
            # Rappels de paquets : 1 paquet / 10 min en gratuit, / 3 min en Pro, jusqu'à 10.
            "accountType": "free",
            "notifyFull": True,
            "notifyEach": False,
            "emailFull": False,
            "ntfyToken": "",
            "ntfyTopic": "",
            # Écran d'ouverture : défilement des cartes puis « Continuer » (après ton clic sur Ouvrir).
            "autoReveal": True,
            "revealDelay": 1500,
        },
    }
    body = json.dumps(config, ensure_ascii=False, indent=2).replace("\n", "\n  ")
    js = ("// Généré par extension/build_defaults.py à partir de rules.toml, themes.toml et config.toml.\n"
          "// Ne pas modifier à la main : relancer `python extension/build_defaults.py`.\n"
          "(function (root) {\n"
          "  const WMT = (root.WMT = root.WMT || {});\n"
          f"  const DEFAULTS = {body};\n"
          "  WMT.defaults = { config: () => JSON.parse(JSON.stringify(DEFAULTS)) };\n"
          "})(globalThis);\n")
    out = ROOT / "extension" / "lib" / "defaults.js"
    out.write_text(js, encoding="utf-8")
    print(f"{out.relative_to(ROOT)} : {len(config['rules'])} étiquettes, {len(config['themes'])} thèmes.")


if __name__ == "__main__":
    main()
