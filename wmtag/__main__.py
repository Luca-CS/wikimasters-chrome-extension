"""python -m wmtag [--wikidata] [--min-count N]

Lit input/*.txt (texte copié depuis la page Collection), propose des étiquettes
et écrit les résultats dans output/.
"""
from __future__ import annotations

import argparse
import csv
import sys
import tomllib
import webbrowser
from pathlib import Path

from .classify import agreement, load_rules, match_card, suggest_themes
from .parser import Card, parse_text
from .report import card_json, write_html

ROOT = Path(__file__).resolve().parent.parent


def load_config() -> dict:
    p = ROOT / "config.toml"
    return tomllib.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def read_cards(input_dir: Path) -> list[Card]:
    cards, seen = [], set()
    files = sorted(input_dir.glob("*.txt"))
    if not files:
        sys.exit(f"Aucun fichier .txt dans {input_dir}. Colle le contenu d'une page de ta collection dedans.")
    for f in files:
        for c in parse_text(f.read_text(encoding="utf-8"), source=f.name):
            key = (c.page, c.position, c.title)
            if key in seen:  # même page collée deux fois
                continue
            seen.add(key)
            cards.append(c)
    cards.sort(key=lambda c: (c.page or 0, c.position))
    return cards


def _toml_str(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def toml_block(name: str, rule) -> str:
    out = [f"[tags.{_toml_str(name)}]",
           "keywords = [" + ", ".join(_toml_str(k) for k in rule.raw_keywords) + "]"]
    if rule.raw_title_keywords:
        out.append("title_keywords = [" + ", ".join(_toml_str(k) for k in rule.raw_title_keywords) + "]")
    return "\n".join(out)


def ref(c: Card) -> str:
    p = f"p.{c.page}" if c.page else c.source
    return f"{p} #{c.position:<2} {c.title} ({c.rarity})"


def main(argv=None):
    # Console Windows (cp1252) : évite le crash sur « → » quand la sortie est redirigée.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    cfg = load_config()
    ap = argparse.ArgumentParser(prog="wmtag", description=__doc__)
    ap.add_argument("--input", type=Path, default=ROOT / "input")
    ap.add_argument("--output", type=Path, default=ROOT / "output")
    ap.add_argument("--rules", type=Path, default=ROOT / "rules.toml")
    ap.add_argument("--themes", type=Path, default=ROOT / "themes.toml")
    ap.add_argument("--min-count", type=int, default=cfg.get("min_count", 3),
                    help="nb de cartes à partir duquel un thème est suggéré")
    ap.add_argument("--wikidata", action=argparse.BooleanOptionalAction,
                    default=cfg.get("wikidata", False),
                    help="enrichit avec Wikidata (nature, occupation). Nécessite internet.")
    ap.add_argument("--open", action=argparse.BooleanOptionalAction,
                    default=cfg.get("open_report", False),
                    help="ouvre output/rapport.html dans le navigateur à la fin")
    args = ap.parse_args(argv)

    cards = read_cards(args.input)
    rules = load_rules(args.rules)
    themes = load_rules(args.themes)
    active = {r.name for r in rules}
    print(f"{len(cards)} cartes lues, {len(rules)} étiquettes actives.")

    wd_text: dict[str, str] = {}
    wd_labels: dict[str, list[str]] = {}
    if args.wikidata:
        from .wikidata import WikidataClient
        ua = cfg.get("user_agent") or "WikiMastersTagger/0.1 (script perso)"
        client = WikidataClient(ROOT / "cache" / "wikidata.json", ua)
        try:
            info = client.enrich([c.title for c in cards])
        except (OSError, RuntimeError) as e:  # réseau coupé, Wikidata indisponible...
            print(f"⚠ Wikidata indisponible ({e}) : on continue sans.")
            info = {}
        for t, d in info.items():
            labs = d["P31"] + d["P106"]
            wd_labels[t] = labs
            wd_text[t] = " ; ".join(labs)

    args.output.mkdir(parents=True, exist_ok=True)

    # 1. Suggestions carte par carte
    rows, todo = [], {r.name: [] for r in rules}
    todo_json = {r.name: [] for r in rules}
    untagged_unmatched: list[Card] = []
    for c in cards:
        matches = match_card(c, rules, wd_text.get(c.title, ""))
        already = bool(c.tags)
        if not already:
            for m in matches:
                todo[m.tag].append((c, len(matches) > 1))
                todo_json[m.tag].append(card_json(
                    c, hits=m.hits, others=[o.tag for o in matches if o.tag != m.tag],
                    wikidata=wd_text.get(c.title, "")))
            if not matches:
                untagged_unmatched.append(c)
        rows.append({
            "page": c.page, "position": c.position, "rarete": c.rarity, "titre": c.title,
            "description": c.description, "etiquettes_actuelles": " | ".join(c.tags),
            "suggestion": "" if already else (matches[0].tag if matches else ""),
            "autres_suggestions": "" if already else " | ".join(m.tag for m in matches[1:]),
            "motifs": "" if already else " ; ".join(f"{m.tag}: {', '.join(m.hits)}" for m in matches),
            "wikidata": wd_text.get(c.title, ""),
            "attaque": c.attack, "defense": c.defense,
        })

    with open(args.output / "classement.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), delimiter=";")
        w.writeheader()
        w.writerows(rows)

    # 2. Liste de travail : quoi étiqueter, dans l'ordre d'affichage
    lines = ["# Cartes à étiqueter", "",
             "Ordre = ordre d'affichage dans ta collection. ⚠ = la carte matche plusieurs étiquettes.",
             "Les cartes déjà étiquetées ne sont pas listées.", ""]
    total = 0
    for tag, items in todo.items():
        if not items:
            continue
        total += len(items)
        lines += [f"## {tag} ({len(items)})", ""]
        lines += [f"- [ ] {ref(c)}{'  ⚠' if multi else ''}" for c, multi in items]
        lines.append("")
    if total == 0:
        lines.append("Rien à étiqueter avec les règles actuelles.")
    (args.output / "a_etiqueter.md").write_text("\n".join(lines), encoding="utf-8")

    # 3. Thèmes récurrents + fiabilité des règles
    untagged = [c for c in cards if not c.tags]
    rep = suggest_themes(untagged_unmatched, themes, active, args.min_count, wd_text, wd_labels)
    n_tagged, n_ok, misses = agreement(cards, rules, wd_text)

    s = ["# Suggestions", ""]
    s += [f"- {len(cards)} cartes, {len(cards) - len(untagged)} déjà étiquetées, "
          f"{sum(1 for r in rows if r['suggestion'])} avec une suggestion, "
          f"{len(untagged_unmatched)} sans étiquette ni suggestion.", ""]

    s += ["## Fiabilité des règles sur tes étiquettes manuelles", ""]
    if n_tagged:
        s.append(f"Les règles retrouvent ton étiquette sur **{n_ok}/{n_tagged}** cartes que tu as déjà classées.")
        if misses:
            s += ["", "Ratés (à corriger dans rules.toml) :", ""]
            s += [f"- {ref(c)} — « {c.description} » : toi = {', '.join(r)}, script = {', '.join(p) or 'rien'}"
                  for c, r, p in misses]
    else:
        s.append("Aucune carte étiquetée pour comparer.")
    s.append("")

    s += [f"## Nouvelles thématiques possibles (≥ {args.min_count} cartes non classées)", ""]
    if rep.candidate_themes:
        for name, n, cs, rule in rep.candidate_themes:
            ex = ", ".join(c.title for c in cs[:6]) + (" …" if n > 6 else "")
            s += [f"### {name} — {n} cartes", "", f"Exemples : {ex}", "",
                  "Pour l'activer, colle ceci à la fin de `rules.toml` :", "", "```toml",
                  toml_block(name, rule), "```", ""]
    else:
        s += ["Aucune pour l'instant.", ""]

    s += [f"## Mots qui reviennent dans les descriptions non classées (≥ {args.min_count})", "",
          "Utile pour repérer un thème que themes.toml ne connaît pas encore.", ""]
    s += [f"- **{w}** ({n}) : " + ", ".join(c.title for c in cs[:5]) for w, n, cs in rep.recurring_words] or ["Rien de notable."]
    s.append("")
    if args.wikidata:
        s += [f"## Natures / occupations Wikidata récurrentes (≥ {args.min_count})", ""]
        s += [f"- **{w}** ({n}) : " + ", ".join(c.title for c in cs[:5]) for w, n, cs in rep.recurring_wikidata] or ["Rien de notable."]
        s.append("")
    (args.output / "suggestions.md").write_text("\n".join(s), encoding="utf-8")

    # 4. Rapport HTML (même contenu, mis en forme)
    html = args.output / "rapport.html"
    write_html(html, {
        "wikidata": bool(args.wikidata), "min_count": args.min_count,
        "stats": {"cards": len(cards), "tagged": len(cards) - len(untagged),
                  "unmatched": len(untagged_unmatched)},
        "todo": [{"tag": t, "items": items} for t, items in todo_json.items()],
        "agreement": {"ok": n_ok, "total": n_tagged, "misses": [
            card_json(c, real=r, pred=p) for c, r, p in misses]},
        "themes": [{"name": name, "n": n, "examples": [c.title for c in cs[:8]],
                    "toml": toml_block(name, rule)} for name, n, cs, rule in rep.candidate_themes],
        "words": [{"word": w, "n": n, "examples": [c.title for c in cs[:5]]} for w, n, cs in rep.recurring_words],
        "wd_words": [{"word": w, "n": n, "examples": [c.title for c in cs[:5]]} for w, n, cs in rep.recurring_wikidata],
    })

    print(f"Règles d'accord avec toi sur {n_ok}/{n_tagged} cartes déjà étiquetées.")
    print(f"{total} étiquettes à poser, {len(rep.candidate_themes)} nouvelle(s) thématique(s) suggérée(s).")
    print(f"Rapport : {html.resolve().as_uri()}")
    if args.open:
        webbrowser.open(html.resolve().as_uri())


if __name__ == "__main__":
    main()
