"""Classement des cartes par règles (rules.toml) et détection de thèmes récurrents."""
from __future__ import annotations

import re
import tomllib
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from .parser import Card


def norm(s: str) -> str:
    """minuscules, sans accents, apostrophes unifiées, espaces compactés."""
    s = s.replace("’", "'").replace("œ", "oe").replace("Œ", "oe")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s.lower()).strip()


@dataclass
class TagRule:
    name: str
    keywords: list[re.Pattern] = field(default_factory=list)
    title_keywords: list[re.Pattern] = field(default_factory=list)
    raw_keywords: list[str] = field(default_factory=list)
    raw_title_keywords: list[str] = field(default_factory=list)
    shiny: bool = False  # étiquette posée sur toutes les cartes shiny, en plus de leur catégorie


def _compile(patterns: list[str]) -> list[re.Pattern]:
    # \b ne gère pas bien les tirets/apostrophes en bord de motif : on borne par "non-lettre".
    # Le groupe (?:...) garde les bornes sur toutes les alternatives de "acteur|actrice".
    return [re.compile(rf"(?<![\w])(?:{norm(p)})(?![\w])") for p in patterns]


def load_rules(path: Path) -> list[TagRule]:
    if not path.exists():
        return []
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    rules = []
    for name, spec in (data.get("tags") or {}).items():
        kw = spec.get("keywords", [])
        rules.append(
            TagRule(
                name=name,
                keywords=_compile(kw),
                title_keywords=_compile(spec.get("title_keywords", [])),
                raw_keywords=kw,
                raw_title_keywords=spec.get("title_keywords", []),
                shiny=bool(spec.get("shiny", False)),
            )
        )
    return rules


@dataclass
class Match:
    tag: str
    score: int
    hits: list[str]


_QUALIFIER = re.compile(r"\(([^()]*)\)\s*$")


def qualifier(title: str) -> str:
    """Précision entre parenthèses en fin de titre : « Couplage (théorie des graphes) »."""
    m = _QUALIFIER.search(title)
    return m.group(1) if m else ""


def match_card(card: Card, rules: list[TagRule], extra_text: str = "",
               nature_text: str | None = None) -> list[Match]:
    """Étiquettes qui matchent, triées par score décroissant (puis ordre des règles).

    Indices propres à la carte : description, précision du titre entre parenthèses,
    motifs de titre. Wikidata (extra_text = nature + occupations) ne fait que compléter :
    si une règle a un indice propre, les règles qui n'ont que Wikidata sont écartées.
    Sans indice propre, on se rabat sur Wikidata ; si la carte a une description, seulement
    sur sa nature (nature_text, P31) : les occupations (P106) y sont trop bruitées
    (un écrivain « scénariste » à ses heures). Les règles shiny matchent les cartes shiny.
    """
    desc = norm(card.description)
    qual = norm(qualifier(card.title))
    title = norm(card.title)
    extra = norm(extra_text)
    nature = extra if nature_text is None or not desc else norm(nature_text)
    own_found, wd_found, shiny = [], [], []
    for rule in rules:
        if rule.shiny:
            if card.shiny:
                shiny.append(Match(rule.name, 1, ["shiny"]))
            continue
        own, wd, fallback = set(), set(), set()
        for p in rule.keywords:
            m = p.search(desc) or (p.search(qual) if qual else None)
            if m:
                own.add(m.group(0))
                continue
            m = p.search(extra) if extra else None
            if m:
                wd.add(m.group(0))
                m = p.search(nature) if nature else None
                if m:
                    fallback.add(m.group(0))
        for p in rule.title_keywords:
            m = p.search(title)
            if m:
                own.add(f"titre:{m.group(0)}")
        if own:
            hits = sorted(own | wd)
            own_found.append(Match(rule.name, len(hits), hits))
        elif fallback:
            wd_found.append(Match(rule.name, len(fallback), sorted(fallback)))
    out = own_found or wd_found
    out.sort(key=lambda m: -m.score)  # tri stable => ordre du fichier en cas d'égalité
    return out + shiny


def shiny_names(rules: list[TagRule]) -> set[str]:
    return {r.name for r in rules if r.shiny}


def category_tags(card: Card, rules: list[TagRule]) -> list[str]:
    """Étiquettes posées qui classent la carte (toutes sauf les étiquettes shiny)."""
    special = shiny_names(rules)
    return [t for t in card.tags if t not in special]


def suggest(card: Card, rules: list[TagRule], extra_text: str = "",
            nature_text: str | None = None) -> list[Match]:
    """Étiquettes à poser : la catégorie si la carte n'en a pas encore, et l'étiquette shiny
    sur une carte shiny qui ne l'a pas, même déjà classée."""
    special = shiny_names(rules)
    classified = bool(category_tags(card, rules))
    return [m for m in match_card(card, rules, extra_text, nature_text)
            if m.tag not in card.tags and (m.tag in special or not classified)]


# --- Motifs récurrents (mot de tête de la description) -----------------------

_STOP = {
    "le", "la", "les", "l", "un", "une", "des", "de", "du", "d", "et", "en", "a",
    "ancien", "ancienne", "anciens", "anciennes", "grand", "grande", "petit", "petite",
    "celebre", "premier", "premiere", "page", "terme", "nom", "type",
}

_FEM = [
    ("trice", "teur"), ("euse", "eur"), ("ienne", "ien"), ("ière", "ier"),
    ("iere", "ier"), ("enne", "en"),
]


def head_word(description: str) -> str | None:
    """Premier mot significatif de la description, au masculin singulier approx.
    ex. 'actrice britannique' -> 'acteur', 'footballeur belge' -> 'footballeur'."""
    for tok in re.findall(r"[a-z][a-z'-]*", norm(description)):
        tok = tok.split("'")[-1]
        if tok in _STOP or len(tok) < 3:
            continue
        for fem, masc in _FEM:
            if tok.endswith(fem) and len(tok) > len(fem) + 1:
                tok = tok[: -len(fem)] + masc
                break
        if tok.endswith("s") and len(tok) > 4 and not tok.endswith("ss"):
            tok = tok[:-1]
        return tok
    return None


@dataclass
class Report:
    candidate_themes: list[tuple[str, int, list[Card], TagRule]]  # (thème, n, cartes, règle)
    recurring_words: list[tuple[str, int, list[Card]]]
    recurring_wikidata: list[tuple[str, int, list[Card]]]


def suggest_themes(
    untagged: list[Card],
    themes: list[TagRule],
    active_tags: set[str],
    min_count: int,
    wikidata_text: dict[str, str] | None = None,
    wikidata_labels: dict[str, list[str]] | None = None,
) -> Report:
    wikidata_text = wikidata_text or {}
    by_theme: dict[str, list[Card]] = defaultdict(list)
    for c in untagged:
        for m in match_card(c, themes, wikidata_text.get(c.title, "")):
            by_theme[m.tag].append(c)
    rule_by_name = {t.name: t for t in themes}
    cand = [
        (name, len(cs), cs, rule_by_name[name])
        for name, cs in by_theme.items()
        if len(cs) >= min_count and norm(name) not in {norm(t) for t in active_tags}
    ]
    cand.sort(key=lambda x: -x[1])

    words: dict[str, list[Card]] = defaultdict(list)
    for c in untagged:
        hw = head_word(c.description)
        if hw:
            words[hw].append(c)
    rec = sorted(((w, len(cs), cs) for w, cs in words.items() if len(cs) >= min_count),
                 key=lambda x: -x[1])

    wd: dict[str, list[Card]] = defaultdict(list)
    if wikidata_labels:
        for c in untagged:
            for lab in set(wikidata_labels.get(c.title, [])):
                wd[lab].append(c)
    rec_wd = sorted(((w, len(cs), cs) for w, cs in wd.items() if len(cs) >= min_count),
                    key=lambda x: -x[1])
    return Report(cand, rec, rec_wd)


def agreement(cards: list[Card], rules: list[TagRule], wikidata_text: dict[str, str],
              wikidata_nature: dict[str, str] | None = None):
    """Compare les suggestions aux étiquettes que tu as déjà posées à la main
    (catégories seulement : l'étiquette shiny ne dit rien des règles).
    Renvoie (n_cartes_étiquetées, n_d'accord, liste des désaccords)."""
    active = {r.name for r in rules if not r.shiny}
    tagged = [c for c in cards if any(t in active for t in c.tags)]
    ok, misses = 0, []
    for c in tagged:
        nature = wikidata_nature.get(c.title, "") if wikidata_nature is not None else None
        pred = {m.tag for m in match_card(c, rules, wikidata_text.get(c.title, ""), nature)
                if m.tag in active}
        real = {t for t in c.tags if t in active}
        if real & pred:
            ok += 1
        else:
            misses.append((c, sorted(real), sorted(pred)))
    return len(tagged), ok, misses
