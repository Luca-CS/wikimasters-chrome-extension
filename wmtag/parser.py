"""Parse le texte obtenu par Ctrl+A / Ctrl+C sur la page Collection de WikiMasters.

Structure observée d'une carte (une info par ligne) :

    <texte alt de l'image, ou "WikiMasters" si pas d'image>
    <rareté : L | UR | SR | R | PC | C>
    <titre>
    [description]          (optionnelle)
    [ligne vide]           (optionnelle)
    [étiquette(s)]         (optionnelles, après la ligne vide)
    <attaque>              ex. "8 820"
    <défense>              ex. "6 382"

Plusieurs pages peuvent être collées à la suite dans un même fichier.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

RARITIES = ("L", "UR", "SR", "R", "PC", "C")
RARITY_SET = set(RARITIES)

_NUM_RE = re.compile(r"^\d{1,3}(?: \d{3})*$|^\d+$")
_PAGE_RE = re.compile(r"^Page\s+(\d+)\s*/\s*(\d+)$")
_SPACES = str.maketrans({" ": " ", " ": " ", " ": " "})


@dataclass
class Card:
    title: str
    rarity: str
    description: str = ""
    tags: list[str] = field(default_factory=list)  # étiquettes déjà posées
    attack: int = 0
    defense: int = 0
    page: int | None = None
    position: int = 0  # rang sur la page (1 = en haut à gauche)
    source: str = ""


def _clean(line: str) -> str:
    return line.translate(_SPACES).strip()


def _is_num(line: str) -> bool:
    return bool(_NUM_RE.match(line))


def _to_int(line: str) -> int:
    return int(line.replace(" ", ""))


def _try_card(lines: list[str], i: int) -> tuple[Card, int] | None:
    """Essaie de lire une carte qui commence à la ligne i (ligne alt).
    Renvoie (carte, index de la ligne suivante) ou None."""
    if i + 2 >= len(lines):
        return None
    alt, rarity, title = lines[i], lines[i + 1], lines[i + 2]
    if not alt or rarity not in RARITY_SET or not title or title in RARITY_SET:
        return None
    # Un titre peut être purement numérique (ex. « 1954 ») : on ne le rejette pas.

    desc_lines: list[str] = []
    tag_lines: list[str] = []
    seen_blank = False
    j = i + 3
    # Une carte fait au plus ~10 lignes ; au-delà on considère que ce n'est pas une carte.
    while j < len(lines) and j < i + 14:
        cur = lines[j]
        if _is_num(cur) and j + 1 < len(lines) and _is_num(lines[j + 1]):
            card = Card(
                title=title,
                rarity=rarity,
                description=" ".join(desc_lines),
                tags=tag_lines,
                attack=_to_int(cur),
                defense=_to_int(lines[j + 1]),
            )
            return card, j + 2
        if cur in ("← Précédent", "Suivant →") or _PAGE_RE.match(cur):
            return None
        if cur == "":
            seen_blank = True
        elif seen_blank:
            tag_lines.append(cur)
        else:
            desc_lines.append(cur)
        j += 1
    return None


def parse_text(text: str, source: str = "") -> list[Card]:
    lines = [_clean(l) for l in text.splitlines()]
    cards: list[Card] = []
    page: int | None = None
    pos = 0
    i = 0
    while i < len(lines):
        m = _PAGE_RE.match(lines[i])
        if m:
            new_page = int(m.group(1))
            if new_page != page:
                page, pos = new_page, 0
            i += 1
            continue
        got = _try_card(lines, i)
        if got is None:
            i += 1
            continue
        card, i = got
        pos += 1
        card.page, card.position, card.source = page, pos, source
        cards.append(card)
    return cards
