# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Personal tool that suggests tags ("étiquettes") for cards in a WikiMasters collection (wiki-masters.com, a card game built from French Wikipedia articles). It exists in two forms that share the same classification logic:

- **Chrome extension** (`extension/`, the main tool): reads the Collection page DOM, pages through the collection by clicking « Suivant → », categorises the cards, highlights the cards to tag on the page, and shows a report.
- **Python CLI** (`wmtag/`): parses text the user pastes from the Collection page into `input/*.txt` and writes reports to `output/`.

Hard rule: nothing ever applies tags in the game. Tagging stays manual, and the extension only reads the page and clicks the pagination buttons. The only third-party network access is the optional Wikidata enrichment.

User-facing text, comments, config and output are in French, so keep that language. Python 3.11+ (`tomllib`) and vanilla JS with no build step. There are no dependencies.

The code is hosted on GitHub at `Luca-CS/wikimasters-chrome-extension`, a private repo. Work on feature branches and open PRs into `main`. `input/` (the user's pasted pages and the `collection.html` DOM snapshot), `cache/` and `output/` are personal data and gitignored, so never commit them.

## Commands

```
python -m unittest -v              # all tests, including the JS/Python parity test (needs node)
python -m unittest tests.test_wmtag.TestClassify.test_rules   # single test
python extension/build_defaults.py # regenerate extension/lib/defaults.js from rules/themes/config.toml
node --check extension/content/content.js                     # quick syntax check of a JS file
python -m wmtag                    # CLI: read input/*.txt and write output/
python -m wmtag --wikidata | --no-wikidata | --no-open | --min-count 2 --input DIR --output DIR
```

To try the extension, open `chrome://extensions`, enable developer mode and use "Load unpacked" on `extension/`. After editing, reload it there and reload the WikiMasters tab, because content scripts are not re-injected into open tabs.

On a Windows cp1252 console, `wmtag.main()` reconfigures stdout/stderr with `errors="replace"`. Set `PYTHONUTF8=1` for readable piped output. Tests must not hit the network or depend on `config.toml` network settings: the end-to-end test passes `--no-wikidata --no-open`, and the Wikidata tests mock `_get`.

## Classification (shared by both forms)

`wmtag/classify.py` and `extension/lib/core.js` are a faithful port of each other. `TestExtensionParity` runs `extension/tests/run_core.js` through node on the same cards and asserts identical matches, hits, themes, recurring words and agreement. Change both sides together.

- Text is compared after `norm()`: lowercase, accents stripped, `œ`→`oe`, apostrophes unified. Rule patterns are normalised too, then wrapped as `(?<![\w])(?:…)(?![\w])` for whole-word matching (in JS, `[\p{L}\p{N}_]` with the `u` flag, falling back to ASCII if `u` rejects the pattern). `keywords` match the description **or** the Wikidata text, and `title_keywords` (`titleKeywords` in JS) match the title. Score = number of distinct hits, and ties keep rule order.
- There are two rule sets with different roles. **Active rules** (`rules.toml` / config `rules`) are the only tags ever suggested. **Candidate themes** (`themes.toml` / config `themes`) are only counted on untagged, unmatched cards to propose new tags once they reach `min_count`.
- Cards that already carry a tag get no suggestion. `agreement()` measures how well the rules reproduce the user's manual tags, counting only active tag names. The CLI end-to-end test expects `16/16` on `tests/sample_page.txt`, so editing `rules.toml` can break tests.
- Tag names must match the in-game names exactly, and the user cannot rename tags in the game. `Mythologie` deliberately covers all of Antiquity.

## Extension (`extension/`, Manifest V3)

Classic scripts attach to a global `WMT` namespace, with no ES modules, so the same files load in content scripts, extension pages and Node: `lib/core.js` (classification), `lib/defaults.js` (generated, so don't edit it), `lib/store.js` (`chrome.storage.local` keys `config`, `scan`, `scanMeta`, `wd`, `done`, `lastRun`), `lib/dom.js` (WikiMasters DOM), `lib/wikidata.js`.

- **`lib/dom.js`** is the only file that knows the site's markup, captured from a real DOM snapshot on 01/10/2026. A card is found by climbing from its `<h3>` title to the lowest ancestor that contains a rarity-badge leaf (`L|UR|SR|R|PC|C`). The root is that ancestor's parent (`div.relative.isolate.group`). In-game tags are leaf `span`s with `rounded-full` and an inline `background-color`, and their colour is read from the style. Attack and defense are the numeric leaf spans. The pager is the leaf matching `Page X / Y`, and its parent holds the Précédent/Suivant buttons. Pagination is client-side: the URL stays `/collection`.
- **`content/content.js`** runs on every wiki-masters.com page. It polls `location.pathname` because of Next.js client-side routing, and mounts on `/collection`. It builds a Shadow DOM panel with `adoptedStyleSheets` and `createElement` only, so there is no `innerHTML`, for CSP and Trusted Types safety. It uses the site's CSS variables, so the panel follows the site's dark or light theme.
  - **Scan:** go back to page 1, then forward, waiting each time until both the pager number and the card titles have changed. `settings.pageDelay` sets the pause before each click.
  - **Highlighting:** live classification of the visible cards, memoised, through a `MutationObserver` that ignores the extension's own nodes. Highlights use `data-wmt*` attributes plus an appended `.wmt-flags` node, never `className`, because React re-renders would wipe classes. In-game tag colours are synced into `config.rules[].color` unless `colorLocked`.
- **`background.js`** opens or focuses `pages/report.html`, because content scripts cannot use `chrome.tabs`.
- **`pages/`** holds `report` (opened with `?run=1` by the panel: Wikidata enrichment, then `core.analyze`, then three tabs), `options` (rule and theme editors, tester, settings, import/export) and `popup`. MV3 CSP forbids inline scripts, so each page has its own `.js` file. `ui.css` holds the shared WikiMasters theme: dark by default, emerald `#34d399`, Outfit and Inter, rarity colours `--C`…`--L`.
- The contact e-mail for Wikidata's `Api-User-Agent` lives only in the extension settings and is never written to `defaults.js`.

## Python CLI (`wmtag/`)

The pipeline is `read_cards` → `match_card` → `classement.csv` (`;`, utf-8-sig), `a_etiqueter.md`, `suggestions.md` and `rapport.html` (`report.py`, self-contained HTML with embedded JSON). Paths default to the repo root.

`parser.py` is a line-based parser of the pasted text. A card is: alt line, rarity, title, optional description, optional blank line and tag lines, then two consecutive number lines. `Page N / M` sets the page. Numeric titles such as « 1954 » are valid. `wikidata.py` uses the same API calls as `lib/wikidata.js`, without `maxlag` (it tracks query-service lag and blocks reads almost permanently). The cache format `{titles, labels}` is the same as the extension's `wd` key.
