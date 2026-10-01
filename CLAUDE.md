# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Personal script that suggests tags ("étiquettes") for cards in a WikiMasters collection. The user copies the Collection page (Ctrl+A / Ctrl+C) into `input/*.txt`; the script parses it and writes reports to `output/`. It never talks to WikiMasters, and the user applies the tags in the game by hand. The only network access is the optional Wikidata enrichment.

Python 3.11+ (`tomllib`), standard library only. No dependencies and no packaging files. User-facing text, comments, config and output are in French, so keep that language.

## Commands

```
python -m wmtag                    # read input/*.txt and write output/
python -m wmtag --wikidata         # also query Wikidata (P31 nature, P106 occupation), cached in cache/wikidata.json
python -m wmtag --no-wikidata      # override wikidata = true from config.toml
python -m wmtag --no-open          # don't open output/rapport.html in the browser (open_report in config.toml)
python -m wmtag --min-count 2 --input DIR --output DIR --rules FILE --themes FILE
python -m unittest -v              # all tests (run from repo root)
python -m unittest tests.test_wmtag.TestClassify.test_rules   # single test
```

On a Windows cp1252 console, `main()` reconfigures stdout/stderr with `errors="replace"`, so `→` and accented characters may print as `?`/`�` when output is piped. Set `PYTHONUTF8=1` for readable output. Tests must not depend on `config.toml` network settings, so the end-to-end test passes `--no-wikidata`.

VS Code launch configs (`.vscode/launch.json`): `wmtag`, `wmtag + Wikidata`, `tests`.

## Architecture

Pipeline in `wmtag/__main__.py`: `read_cards` → `match_card` per card → write 4 outputs (`classement.csv` with `;` separators and utf-8-sig encoding for Excel, `a_etiqueter.md`, `suggestions.md`, and `rapport.html`, which is the main one for the user). Paths default to the repo root (`ROOT`), not the cwd.

- **`parser.py`**: a heuristic, line-based parser for the pasted page text. A card is: alt-text line, rarity (`L|UR|SR|R|PC|C`), title, optional description lines, optional blank line followed by tag lines, then **two consecutive number lines** (attack, defense, possibly with thousands separators, including the narrow/nbsp spaces normalised by `_SPACES`). `Page N / M` lines set the page number, and position resets per page. A card is abandoned if no number pair appears within 14 lines or if it reaches the pagination markers. Several pages may be concatenated in one file, and duplicates `(page, position, title)` are dropped in `read_cards`. Any change to the pasted format of the site breaks this file first. `tests/sample_page.txt` is the real-format fixture (50 cards, 16 already tagged).
- **`classify.py`**: everything is matched on `norm()` text (lowercase, accents stripped, `œ`→`oe`, apostrophes unified). Rule patterns are normalised too, then wrapped in `(?<![\w])…(?![\w])` (whole-word, not `\b`). `keywords` match the description **or** the Wikidata extra text, and `title_keywords` match the title. Score = number of distinct hits, and the stable sort keeps file order on ties.
- **Two rule files with different roles** (same TOML format, `[tags."Name"]`):
  - `rules.toml` holds the active tags. These are the **only** tags ever suggested on cards.
  - `themes.toml` holds candidate themes. They are used only by `suggest_themes` on untagged and unmatched cards to propose new tags once they reach `min_count`, and are never assigned to cards. `suggestions.md` emits a ready-to-paste TOML block (`toml_block`), and the end-to-end test checks that these blocks parse as valid TOML.
- `agreement()` measures how well the rules reproduce the tags the user already set by hand, counting only tags present in `rules.toml`. The end-to-end test expects `16/16` on the sample, so changing `rules.toml` can break tests.
- `head_word()` crudely lemmatises the first significant word of the description (feminine→masculine, drops plural `s`) for the "mots récurrents" section.
- **`report.py`**: builds a self-contained `rapport.html`. Python serialises the data to JSON in a `<script type="application/json">` tag, and inline vanilla JS renders three tabs (to tag / reliability / new themes). Checked cards are kept in `localStorage`, and `#todo`, `#check` or `#themes` in the URL opens that tab. The theme copies wiki-masters.com: dark by default, emerald accent `#34d399`, Outfit and Inter from Google Fonts, rarity colours `--C`…`--L`. Any field added to the JSON must also be handled in the JS, and the end-to-end test parses the embedded JSON.
- Tag names in `rules.toml` must match the in-game tag names exactly; the user cannot rename tags in the game. `Mythologie` deliberately covers all of Antiquity.
- **`wikidata.py`**: `wbgetentities` on `frwiki` titles in batches of 50, without `maxlag` (it tracks query-service lag and blocks reads almost permanently), with retry and pause. On failure, `main` carries on without Wikidata, and an identifiable User-Agent from `config.toml`. Titles that are not found are cached as `{"qid": None}` so they are never re-queried. The cache is saved in `finally`. Tests mock `WikidataClient._get`, and tests must not hit the network.

`config.toml` holds `min_count`, `wikidata` (default for the flag) and `user_agent`. `output/`, `cache/` and `input/*.txt` are gitignored.
