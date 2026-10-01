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
            )
        )
    return rules


@dataclass
class Match:
    tag: str
    score: int
    hits: list[str]


def match_card(card: Card, rules: list[TagRule], extra_text: str = "") -> list[Match]:
    """Renvoie les étiquettes qui matchent, triées par score décroissant
    (puis ordre du fichier de règles)."""
    desc = norm(card.description)
    extra = norm(extra_text)
    title = norm(card.title)
    out = []
    for rule in rules:
        hits = []
        for p in rule.keywords:
            m = p.search(desc) or (p.search(extra) if extra else None)
            if m:
                hits.append(m.group(0))
        for p in rule.title_keywords:
            m = p.search(title)
            if m:
                hits.append(f"titre:{m.group(0)}")
        if hits:
            out.append(Match(rule.name, len(set(hits)), sorted(set(hits))))
    out.sort(key=lambda m: -m.score)  # tri stable => ordre du fichier en cas d'égalité
    return out


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


def agreement(cards: list[Card], rules: list[TagRule], wikidata_text: dict[str, str]):
    """Compare les suggestions aux étiquettes que tu as déjà posées à la main.
    Renvoie (n_cartes_étiquetées, n_d'accord, liste des désaccords)."""
    active = {r.name for r in rules}
    tagged = [c for c in cards if any(t in active for t in c.tags)]
    ok, misses = 0, []
    for c in tagged:
        pred = {m.tag for m in match_card(c, rules, wikidata_text.get(c.title, ""))}
        real = {t for t in c.tags if t in active}
        if real & pred:
            ok += 1
        else:
            misses.append((c, sorted(real), sorted(pred)))
    return len(tagged), ok, misses
