# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Personal tool that suggests tags ("étiquettes") for cards in a WikiMasters collection (wiki-masters.com, a card game built from French Wikipedia articles). It exists in two forms that share the same classification logic:

- **Chrome extension** (`extension/`, the main tool): reads the Collection page DOM, pages through the collection by clicking « Suivant → », categorises the cards, highlights the cards to tag on the page, and shows a report.
- **Python CLI** (`wmtag/`): parses text the user pastes from the Collection page into `input/*.txt` and writes reports to `output/`.

Hard rule: the extension acts in the game only in the three ways the user explicitly asked for, and only when they start it. It never interacts with the site's « je ne suis pas un robot » check, never creates tags, never touches trades, never bids or lists on the market, and only clicks « Défausser » inside the sale described below. On the market it only reads (collection described below).

Market data collection (asked for on 06/10/2026 for an academic project; Luca says the WikiMasters team allowed it by e-mail) is read-only and off by default.
- **What:** GET requests on the market API from the service worker, switched on in the Config (« Marché »), to backtest a strategy and help Luca decide. Every bid stays Luca's own click.
- **Why the safeguards matter:** the site's rules (`/rules` §3) forbid bots and scripts, and the API answered `403 {"code":"automation_limit"}` to bulk reads on 06/10/2026 (about 110 list pages in 13 min, ~8 requests/min).
- **Safeguards (keep them, in `lib/market.js`):** at most one request per `everySec` (60 s by default, jittered), a daily cap, active hours (no requests at night), a 24 h pause and halved rate on a 403, a full stop on a second 403 within 7 days or when the site shows « Sanction anti-triche active ».

The sale (asked for on 05/10/2026) works like this:
- **Start:** the user picks rarities with the panel's chips, clicks « Vendre les cartes sans étiquette… », then confirms once in the panel.
- **Filters:** it sets the site filters to « Sans étiquette » plus those rarities.
- **Loop:** on the current page it uses « Tout sélectionner (page) », deselects favourites and shiny cards (setting `sellKeep`, on by default), then clicks « Défausser (+N) » and the site's confirmation. Sold cards disappear and the next ones move up, so it sells the same page again. It moves to the next page only when a page holds nothing but kept cards, and it stops when nothing sellable is left on any remaining page.
- **Safeguards:** before each sale every card on screen is checked to be untagged and of a chosen rarity, and the confirmation's count must equal the number of cards to sell; otherwise nothing is sold and the run stops.
- **End:** the filters are restored afterwards. Otherwise it only reads the page and clicks navigation buttons: the collection's pagination and, on the pack reveal screen, next card and « Continuer ».

Auto-tagging (asked for on 02/10/2026) is started by the panel's « Étiqueter toute la collection » button. It runs through every page without asking for confirmation and applies every suggested tag (all matches, not only the top one). It applies only tags that already exist in the game, which are read from the « Appliquer une étiquette » dialog; missing ones such as « Shiny » are skipped and listed in the summary.

Packs are opened only inside a chain that the user starts with their own trusted click on « Ouvrir », and only up to the stock available at that moment. Packs that regenerate during the chain are never opened. This is the scope the user agreed to: resources are cooldown-limited, so the chain saves clicks without gaining packs.

Out of scope, so never add any of these:
- opening packs on a timer or unattended;
- watching the stock in order to open packs;
- interacting with the robot check;
- bidding, listing or repricing on the market automatically.

The chain pauses on that check until the user validates it, pauses while any site popup is shown or the tab is hidden, and stops on any trusted input outside the panel (closing a site popup does not count). It stops for good, without retrying, when the page shows « Sanction anti-triche active » or an opening error that mentions cheating, bots or a block. The only third-party network call is the optional Wikidata enrichment (the ntfy.sh e-mail reminder was removed in 0.4.0).

User-facing text, comments, config and output are in French, so keep that language. Python 3.11+ (`tomllib`) and vanilla JS with no build step. There are no dependencies.

The code is hosted on GitHub at `Luca-CS/wikimasters-chrome-extension`, a private repo. Work on feature branches and open PRs into `main`. `input/` (the user's pasted pages and the `collection.html` DOM snapshot), `cache/` and `output/` are personal data and gitignored, so never commit them.

## Commands

```
python -m unittest -v              # all tests, including the JS/Python parity test (needs node)
python extension/tests/harness/run.py [filter]   # browser harness: 21 scenarios (~13 min) in headless Edge/Chrome (see its README); set PYTHONUTF8=1 on Windows
python -m unittest tests.test_wmtag.TestClassify.test_rules   # single test
python extension/build_defaults.py # regenerate extension/lib/defaults.js from rules/themes/config.toml
node --check extension/content/content.js                     # quick syntax check of a JS file
node --test extension/tests/       # Node unit tests (packs, rhythm, store, market, strategy, backtest)
node market/backtest.js [collecte.json] > output/backtest-marche.md   # backtest on the market export
node market/watch.js [--loop] [--target 1000]                 # watcher: notifies when the collection is done / blocked / stale
python -m wmtag                    # CLI: read input/*.txt and write output/
python -m wmtag --wikidata | --no-wikidata | --no-open | --min-count 2 --input DIR --output DIR
```

To try the extension, open `chrome://extensions`, enable developer mode and use "Load unpacked" on `extension/`. After editing, reload it there and reload the WikiMasters tab, because content scripts are not re-injected into open tabs.

On a Windows cp1252 console, `wmtag.main()` reconfigures stdout/stderr with `errors="replace"`. Set `PYTHONUTF8=1` for readable piped output. Tests must not hit the network or depend on `config.toml` network settings: the end-to-end test passes `--no-wikidata --no-open`, and the Wikidata tests mock `_get`.

## Classification (shared by both forms)

`wmtag/classify.py` and `extension/lib/core.js` are a faithful port of each other. `TestExtensionParity` runs `extension/tests/run_core.js` through node on the same cards and asserts identical matches, hits, themes, recurring words and agreement. Change both sides together.

- Text is compared after `norm()`: lowercase, accents stripped, `œ`→`oe`, apostrophes unified. Rule patterns are normalised too, then wrapped as `(?<![\w])(?:…)(?![\w])` for whole-word matching (in JS, `[\p{L}\p{N}_]` with the `u` flag, falling back to ASCII if `u` rejects the pattern). Lookbehinds must stay fixed-width for Python.
- `keywords` match the description **or** the title's trailing qualifier in parentheses (`qualifier()`: « Couplage (théorie des graphes) »); these are the card's own clues, as are `title_keywords` (`titleKeywords` in JS), which match the whole title. Wikidata only completes: if any rule has an own clue, rules matched only through Wikidata are dropped. Without own clues, the fallback uses Wikidata; when the card has a description, only its nature (P31, `nature_text` / `wdNature`), because occupations (P106) are noisy (writers listed as « scénariste »). Score = number of distinct hits, and ties keep rule order.
- There are two rule sets with different roles. **Active rules** (`rules.toml` / config `rules`) are the only tags ever suggested. **Candidate themes** (`themes.toml` / config `themes`) are only counted on untagged, unmatched cards to propose new tags once they reach `min_count`.
- A rule with `shiny = true` (`Shiny`) has no keywords: it matches every shiny card (`card.shiny`), always after the categories. `suggest()` gives what to apply: categories only when the card has no category tag yet, plus the shiny tag on a shiny card that lacks it, even if already classified. A Shiny tag alone does not classify a card (`category_tags()` / `categoryTags()`).
- A rule with `cross = true` is a transversal tag. Since 0.7.1 the only one is `Plateau de Saclay` (asked for on 06/10/2026), which covers schools, labs, plateau communes with the department required when the name is ambiguous, rivers, transport and named people.
  - **Matching:** only on the card's own clues (description, qualifier, title), never Wikidata, and listed after the categories and before Shiny.
  - **Suggestion:** like Shiny, it is suggested even on an already classified card, does not classify a card and is left out of `agreement()`. `shiny_names()` / `shinyNames()` return shiny and cross names.
  - **Titles:** card descriptions rarely say « Saclay », so the rule relies on anchored titles (`^orsay( \(essonne\))?$`, not `orsay`, which would match « Musée d'Orsay »).
- `agreement()` measures how well the rules reproduce the user's manual tags, counting only active non-shiny tag names. The CLI end-to-end test expects `16/16` on `tests/sample_page.txt`, so editing `rules.toml` can break tests. Rules were last tuned on the 1,263 cards of `input/page01.txt` with its Wikidata cache: dump matched and unmatched cards and read them before changing patterns.
- Tag names must match the in-game names exactly, and the game's « Gérer les étiquettes… » dialog (last option of the tag filter, seen 06/10/2026) can create, rename, recolour and delete tags. A tag renamed there must be renamed in the rules too. `Mythologie` deliberately covers all of Antiquity.
- Three categories were added on 06/10/2026, all created in the game by Luca. `Finance` covers market finance: concepts, banks, exchanges, insurers and the people in finance. `Physique` covers physics concepts, particles, effects and physicists. `Substances` covers molecules, chemical compounds, medicines and drugs, legal or not.
  - **Patterns avoided on purpose:** `ine$` in titles and `heroine` (the heroine of a story), `electron\w*` (« électronique »), `audit` and `investi\w*` (« audition », « investiture »), and `loi de` (« loi de finances »).
  - **Escaping:** on this Windows machine, Git Bash heredocs turn `\\` into `\`, which corrupted `rules.toml` once. Edit TOML patterns with the editor or a script file, not a heredoc.

## Extension (`extension/`, Manifest V3)

Classic scripts attach to a global `WMT` namespace, with no ES modules, so the same files load in content scripts, extension pages and Node: `lib/core.js` (classification), `lib/defaults.js` (generated, so don't edit it), `lib/store.js` (config migrations by `config.version`, currently 5: v2 moved the old 1500 ms reveal delay to 200 ms; v3 replaces default rules the user never edited, detected by `fingerprint()` against `V2_RULES`, merges new patterns into edited ones, adds the Shiny rule and deletes the e-mail settings; v4 inserts only the rules listed in `NEW_IN_V4` (Finance, Physique, Substances) before Shiny when missing, so a default rule the user deleted never comes back; v5 does the same with `NEW_IN_V5` (Plateau de Saclay); `chrome.storage.local` keys `config`, `scan`, `scanMeta`, `wd`, `done`, `lastRun`, `packs`, `packsNotified`, `market`), `lib/dom.js` (WikiMasters DOM), `lib/packs.js` (pack estimate), `lib/rhythm.js` (reveal pacing), `lib/wikidata.js`.

- **`lib/dom.js`** is the only file that knows the site's markup, captured from a real DOM snapshot on 01/10/2026. A card is found by climbing from its `<h3>` title to the lowest ancestor that contains a rarity badge: a leaf `L|UR|SR|R|PC|C`, or on shiny cards (seen 02/10/2026) a non-leaf `div.shiny-badge` = text `L` + `<span>✦</span>` + `<span class="sr-only"> shiny</span>`, which sets `card.shiny`. The root is that ancestor's parent (`div.relative.isolate.group`). In-game tags are leaf `span`s with `rounded-full` and an inline `background-color`, and their colour is read from the style. Attack and defense are the numeric leaf spans. The pager is the leaf matching `Page X / Y`, and its parent holds the Précédent/Suivant buttons. Pagination is client-side: the URL stays `/collection`.
- **`content/content.js`** runs on every wiki-masters.com page. It polls `location.pathname` because of Next.js client-side routing, and mounts on `/collection`. It builds a Shadow DOM panel with `adoptedStyleSheets` and `createElement` only, so there is no `innerHTML`, for CSP and Trusted Types safety. It uses the site's CSS variables, so the panel follows the site's dark or light theme.
  - **Collection reloads (driver rule).** Every action that changes the list (page turn, filter, tag applied, discard) reloads it, seen live on 07/10/2026.
    - **Sequence:** first a short delay with no sign at all (old cards still shown and clickable), then 2 to 3 s of loading. During loading the grid has `opacity-40 pointer-events-none`, the pager shows a spinner and « Chargement… » instead of « Page X / Y » with every button disabled, and the selection bar shows « Actualisation… » with « Étiqueter » disabled. `dom.collectionLoading()` detects this.
    - **Rule:** only read or click a collection at rest. Every reloading click goes through `reloadAfter(job, action, what, failed)`, which watches the start of the reload with a `MutationObserver` (so even a brief one is seen), waits for its end, and returns false if `failed()` shows a site error instead.
    - **What broke without it:** on the real site, reading during the quiet delay gave stale cards (the sale stopped on the unfiltered page 1). Acting during loading met disabled pager buttons or a null `dom.pager()` (auto-tag stopped with « Bouton de pagination introuvable » or a TypeError).
    - **Page count:** the total comes from a separate `/api/my-collection/stats` request, made only for page 1 and arriving up to a few seconds after the cards. So « Page X / Y » and « Suivant » can be stale right after a page-1 reload. `hasNextPage()` therefore uses the card count first (a page shorter than `PAGE_SIZE` = 50 is the last), then waits up to 10 s for « Suivant » to enable. Never use `p.total` to decide whether to continue.
    - **No pager:** `pageInfo()` treats a missing pager as a single page, unless « Sélectionner » is missing too, which means the site failed to load the total; it then says to reload.
    - **Navigation:** `turnPage(job, ±1)` and `goToPage()` move one page at a time, since the site has only Précédent and Suivant.
  - **Scan:** go back to page 1 (reading on the way), then forward while `hasNextPage()`. `settings.pageDelay` sets the pause before each page click.
  - **Auto-tagging** (`runAutoTag`)
    - **Run order.** It refuses to start while a filter is active, unless the user confirms. Otherwise it starts at page 1, or resumes an interrupted run. For each page it computes a plan `tag -> [{pos, title}]` from `suggestionsFor()` before applying anything, because once a card is tagged `suggest()` stops proposing other categories for it.
    - **Resume.** After each finished page it saves `tagRun = {next, total, at}` in storage. A run started within 24 h on a collection with the same page count resumes at `next`. The panel button then reads « Reprendre l'étiquetage (page X / Y) », and « Recommencer depuis la page 1 » ignores the saved state. `tagRun` is removed when a run completes. Without this, a relaunch walked back page by page to page 1, then forward again, which looked erratic on 60 pages.
    - **Per tag:** `enterSelection` → `card.h3.click()` on each card → wait for `dom.selectionBar()` to show the count → its « Étiqueter » → `dom.tagModal()` → the tag's button through `reloadAfter` (the site applies it, shows « N cartes étiquetées » and reloads the list) → « Terminé » → `leaveSelection` (« Quitter la sélection »). Selection mode is left before each page turn.
    - **Stopping.** Any trusted click or key outside the panel stops it (`stopTagging`). `unmount` aborts it too.
    - **Selection markup**, seen live on 02/10/2026: the bar and the dialog are body-level portals, and the dialog has no role.
    - **Harness.** Covered by the `collection-autotag` scenario, whose `collection_setup.js` simulates selection mode, the bar (with a « Défausser » trap) and the dialog, with only 7 of the 9 tags existing. The scenario stops the run during page 2 with the panel's « Arrêter » button, then checks the « Reprendre » label and that the resumed run never goes backwards.
  - **Sale** (`runSell`, `sellPage`)
    - **Site markup** (`dom.js`, seen live on 05/10/2026): the tag filter is `button[aria-label="Filtrer par étiquette"]`, which opens a body-level `ul[role=listbox]` of `button[role=option]`. Rarity chips are `main` buttons, `opacity-50` when off and `ring-2` when on. The confirmation is a body-level portal, h3 « Défausser N cartes ? », with « Annuler » and « Défausser »; after it the site shows « N cartes défaussées (+N wikibidous). », empties the selection and reloads. A favourite has a `button[aria-label="Retirer des favoris"]`, which is hidden in selection mode, so favourites are read before entering it.
    - **Cleanup.** `leaveSelection()` cancels an open confirmation, and never confirms it.
    - **Harness.** The `collection-sell` scenario covers it. `collection_setup.js` keeps an inventory where filters and sales apply, and hides the pager at one page, like the site. Every 5th card becomes an R that must survive a sale of SR, and favourites and the shiny card must be kept.
    - **Simulator reloads.** The simulator reproduces the site's reloads for every action, with the timings measured live: `QUIET` 500 ms with no sign, then `LOAD` 1.5 s of loading with the real markers, then the new cards, the latest request winning. It also delays the page total by `STATS_LAG` after page-1 reloads. The 0.6.0 code fails `collection-autotag` and `collection-sell` against it, exactly as on the real site. Keep these timings realistic: shorter ones hid the bug.
  - **Highlighting:** live classification of the visible cards, memoised, through a `MutationObserver` that ignores the extension's own nodes. Highlights use `data-wmt*` attributes plus an appended `.wmt-flags` node, never `className`, because React re-renders would wipe classes. In-game tag colours are synced into `config.rules[].color` unless `colorLocked`.
- **Packs page (`/pulls`):**
  - **Counter.** `dom.packs()` reads the counter box `div.card-frame`: « 7 / 10 », « paquets disponibles », and below 10 « Prochain dans <span class="font-mono">1:43</span> ». `parseDuration` reads the `m:ss` timer, and also « N min N s » as a fallback.
  - **Auto-advance.** `autoReveal()` waits for each card, clicks the next arrow, and at « Carte N / N » clicks « Continuer ».
    - The wait is `delay(revealDelay, card)`: the base delay (200 ms by default, floored at 100 ms) times `lib/rhythm.js`'s factor (when `naturalRhythm` is on), plus `bonusMs(card)` (+250 ms for UR and L). The factor is log-normal with mean 1, driven by an AR(1) process on the log scale and clamped to [0.6, 1.8]. Each card is captured with `capturePulled(card, true)` before advancing, even mid-animation.
    - `dom.revealNav()` locates the controls: a row `[button, div of dot buttons, button]` and the « Continuer » button.
  - **Chain.** If `autoChain` is on, a trusted `pointerdown` on « Ouvrir », or Enter/Space on the focused button, calls `startChain()` and creates `chain = {left, total}` from the stock shown at that moment. It listens to `pointerdown` in capture phase, not `click`, because the site may open the pack on press and replace the DOM before any `click`, which was the « Continuer clicked but nothing reopens » bug. After « Continuer », `chainNext()` waits up to 15 s for an enabled « Ouvrir » button, pauses `CHAIN_PAUSE` (300 ms) times the rhythm factor, and clicks it. If nothing happens within 1.5 s, it tries a full synthetic press (`pointerdown`/`mousedown`/`pointerup`/`mouseup`/`click`). If the site still ignores it, for example because it requires `isTrusted`, it stops, focuses the button and asks the user to click. Never try to forge trusted input, for example with `chrome.debugger`. Every stop logs its reason to the console with the prefix `[WikiMasters Tagger]` and shows it in the panel.
  - **Panel messages.** `note(text, kind, action, ttl)` auto-clears after `ttl`. End-of-chain and stop messages expire, while « clique sur Ouvrir » stays until `startChain()` or a new reveal, both of which clear notes. The panel header shows the extension version. If `chrome.runtime.id` disappears because the extension was reloaded without a tab reload, the orphaned script sets `orphaned`, stops all automation and asks for F5. Chrome does not re-inject content scripts into open tabs, so an old script can otherwise keep running stale logic.
  - **Pausing and stopping.** `dom.blockingDialog()` detects a dialog role, « robot » text, or `dom.overlay()`: a fixed body-level element covering half the screen that takes clicks (the Legendary particle burst is `pointer-events-none` and doesn't count). `waitReady()` pauses while one is shown or `document.hidden`. `waitActive(job, test, ms)` only counts time while not paused, so a popup that greys out « Ouvrir » for longer than the timeout no longer ends the chain (the real bug, reproduced by `chain-popup`). The chain decrements `left` only once the reveal screen appears. After a click that opens nothing, it reads `dom.packError()` (the site's red box): it retries after 3 s, then 8 s, unless the message matches `REFUSAL`. `dom.sanction()` (« Sanction anti-triche active ») stops everything for good with `stopForSanction()`. A trusted `pointerdown` or `keydown` outside the panel stops everything through `stopAll()`, unless `handsOff()`, i.e. a site popup is shown or the click lands in a body-level portal outside `<main>` (toast, announcement), or the key is Escape during a pause. Mouse moves never stop it, and neither do modifier-only or media keys (`SILENT_KEYS`), so Alt+Tab is safe. On L cards `waitCardAnimation()` lets the flip finish so a shiny L is read as shiny.
  - **Tests.** The chain is verified with real CDP mouse clicks in `extension/tests/harness/` (`cdp.mjs` uses `Input.dispatchMouseEvent` and `dispatchKeyEvent`), because synthetic clicks are not trusted.
- **Browser harness (`extension/tests/harness/`).** `build.py` rebuilds pages in `out/` (gitignored) from the user's real exports in `input/`, which it recognises by content, with the site's scripts stripped. `run.py` serves them and drives the browser only through the DevTools protocol. On Windows `msedge.exe` is a launcher that returns immediately, so `--dump-dom` and process waits are unreliable. The local server needs a large `request_queue_size`: with Python's default of 5, Windows sometimes refused one of the page's many parallel requests, so a random extension script went missing and scenarios failed at random. `cdp.mjs` attaches the page console and exceptions to each result, and `run.py` prints the last lines on failure. Add a scenario there for any new page feature.
  - **Reveal screen.** It shows « Carte X / N » (three adjacent spans, no spaces, read by `dom.reveal()`) above one large card that uses the collection's card component. Its `<p>` holds the full Wikipedia extract, so suggestions use `dom.firstSentence()` only.
  - **Content script on this page.** It records `packs` = `{count, max, at, nextMs}` in storage, but only from the visible tab and only when that tab's own reading changes (`packsSeen`). Otherwise a second tab left on a stale /pulls page (for example 10/10) rewrites its value on every storage change and the badge flips between 10 and 5. Without a timer only count and max are compared, so the estimate does not slide forward with time. It accumulates the revealed cards of the current pack in the panel, and analyses a card only once `checkVisibility()` passes, to avoid spoilers.
- **`lib/packs.js`** estimates the pack count. The cooldown depends on `settings.accountType`: `free` is 10 min, `pro` is 3 min, and stock caps at the page's max of 10. With no visible timer, the estimate is conservative: a full cooldown before the next pack, so "full" never fires early. It is unit-tested in `extension/tests/packs.test.js` with `node --test`, which runs from `TestExtensionParity`.
- **`background.js`** imports `lib/defaults.js`, `lib/store.js` and `lib/packs.js` with `importScripts`.
  - **Pages.** It opens or focuses `pages/report.html`, and `options.html#…`, because content scripts cannot use `chrome.tabs`.
  - **Alarms.** It reschedules `chrome.alarms` whenever `packs` or `config` changes. `wmt-full` fires when the stock is full and `wmt-next` when the next pack arrives. `wmt-badge` refreshes the icon badge every minute.
  - **Alerts.** It sends Chrome notifications only (the e-mail reminder was removed). `packsNotified` makes sure there is one alert per refill.
  - **Testing.** The `testNotify` message backs the Config test buttons.
- The panel's « Exporter la page » saves `<main>` without scripts or highlights. That is how DOM snapshots like `input/collection.html` are collected.
- **`pages/`** holds `report` (opened with `?run=1` by the panel: Wikidata enrichment, then `core.analyze`, then three tabs), `options` (rule and theme editors, tester, settings, import/export) and `popup`. MV3 CSP forbids inline scripts, so each page has its own `.js` file. `ui.css` holds the shared WikiMasters theme: dark by default, emerald `#34d399`, Outfit and Inter, rarity colours `--C`…`--L`.
- The contact e-mail for Wikidata's `Api-User-Agent` lives only in the extension settings and is never written to `defaults.js`.

## Marketplace (`/marketplace`): read-only collection and the « starting-price snipe » strategy

Observed read-only on 02/10 and 06/10/2026. The extension only reads the market (scope in the hard rule above); any new market feature needs Luca's explicit scope first, written into that rule.

- **Collector (0.7.0).**
  - **Method:** `lib/market.js` (pure, tested) samples page 1 of `sort=recent` at most every 15 min: all L, UR and shiny, `pRest` = 15 % of the others, with weight `w = 1/p`. It reads each sampled auction's detail **once, 3–8 min after its end** (the bids are timestamped, so the whole history can be rebuilt without watching the end live), then the card's `/sales` once (refreshed only if older than 6 h before the end).
  - **Priority** (`nextTask`): due detail > list > sales. No new listings while 300 auctions wait.
  - **Storage:** `lib/marketdb.js` is IndexedDB `wmt-market` (`auctions`, `cards`, `todo`, `log` of every request with status and latency); `chrome.storage.local` key `market` holds settings and state.
  - **Requests:** `background.js` makes them with `credentials: "include"` (host permission on wiki-masters.com); on a 401 it asks an open WikiMasters tab (`marketGet` message, `/api/marketplace` paths only).
  - **Export:** every 3 h to `Downloads/wikimasters-marche/collecte.json`, through `pages/offscreen.html`, because a service worker cannot create blob URLs.
  - **Sanction:** `content.js` checks `dom.sanction()` every ~15 s and sends `marketStop`.
- **Strategy (`lib/strategy.js`, pure, tested).**
  - **Decision:** made at T−12 s on auctions with no bid at that moment, at the starting price in force then (`priceAt` handles repricing). If anyone else bids afterwards, we abandon: no bidding war, and the bid is refunded.
  - **Value:** only the card's own sales at the same rarity (cards of one rarity differ by 5–10×, so never pool them), at least 5 sales in 60 days, half-life 14 days, decide on the 25 % weighted quantile.
  - **Resale model π:** a binary regression fitted by Newton/IRLS, with the cloglog link by default. It is exactly Poisson bid arrivals with Avellaneda–Stoikov intensity `A·e^(−kδ)`.
- **Tools (`market/`, Node, no dependencies).**
  - `backtest.js`: π on the oldest 60 %, strategy simulated on the rest, scenario A = the next real sale (optimistic), scenario B = π at V then discard (prudent).
  - `watch.js`: Windows toast when the collection reaches its target (then it writes `output/backtest-marche.md`), is blocked or stopped, or the export is older than 8 h. Its state and log are in `cache/market/`.
- **List API.** The page calls `GET /api/marketplace?page&limit&sort&mine`, which returns `{auctions[], page, limit, hasMore, selling, bidding, history, won, maxConcurrentAuctions, mine}`.
  - `sort` is `recent`, `price_asc`, `price_desc` or `ending_soon`; `rarity=L` filters. Without a session every endpoint answers 401.
  - Pagination is unstable (pages overlap, `ending_soon` is not monotonic and starts with a backlog of ended but unsettled auctions that are still `active`), so the full stock cannot be listed.
  - About 800 new listings per minute were measured around noon on a weekday, from ~4,000 different sellers; the most common starting price is 10.
  - An auction has `id, seller_id, card_id, base_amount, current_bid, current_bidder_id, effective_bid, listing_base_amount, base_repriced_at, end_at, status ("active"…), winner_id, final_price, created_at, settled_at, snapshot_rarity, snapshot_atk, snapshot_def, is_shiny, seller, current_bidder, winner, card, owned`.
  - `card` has `id, rarity, atk, def, pageviews, q_score, category, wikipedia_title, image_url, is_shiny…`. Rarity comes from monthly Wikipedia pageviews: C < 50, PC 50+, R 250+, SR 1 000+, UR 5 000+, L 20 000+.
- **Other endpoints.**
  - `GET /api/marketplace/cards/{cardId}/sales` returns `{wikipedia_title, sales: [{id (= auction id), final_price, settled_at, rarity}]}` for every copy of the card, without a shiny flag. It answered for Luca's account on 06/10/2026 (it once answered `{code: "pro_required"}`). It is slow (5–8 s) and backs the « Vue du marché » (chart icon on the detail page: count, last, mean, min and max at the current rarity, a chart and the last 10 sales).
  - `GET /api/marketplace/{auctionId}` returns `{auction, bids: [{amount, placed_at, bidder_id, bidder}]}`, also after the end: `status` becomes `settled_sold` / `settled_unsold` 30 s to a few minutes after `end_at`.
  - Durations are 10, 30, 60, 180, 360 and 720 min.
  - `GET /api/marketplace/mine` returns `sellingCount` and `maxConcurrentAuctions` (10 for a regular account, « Mes ventes (0/10) »).
  - Detail page: `/marketplace/{auctionId}`.
- **Page (DOM).**
  - **Tabs** are client-side buttons: Parcourir, « Mes ventes (n/10) », Mes enchères, « Gagnées (n) », « Historique (n) ».
  - **Filters:** search `input[type=search]` « Rechercher une carte… », a sort `<select>` (Récemment listées / Mise la plus basse / Mise la plus haute / Fin imminente), and L…C rarity chips.
  - **Grid:** 50 `a.card-frame` per batch with « Charger la suite » (no « Page X / Y »). Each wraps the collection's card component, then a footer: « Mise de départ » / « Achetée pour » / « Non vendue » + price, « Durée » + timer (« 9m 12s », « 5h 58m », « Terminée »), « Vendu par X ». Owned cards carry a « Possédée » badge.
  - **Detail page:** full extract, « Se termine dans … », a numeric bid input with `min` = minimum bid, « Miser », and « Historique des mises (N) ».
- **Rules shown by the site.**
  - A bid is debited from the wikibidou balance immediately and refunded in full if outbid.
  - A bid in the last 10 s extends the auction by 60 s (site text; Luca observed 30 s).
  - Minimum bid: the starting price without a bid, otherwise `max(ceil(1.1 × current), current + 1)` computed in floating point like the site (100 → 111).
  - No seller fee: the seller gets 100 % of the final price. The starting price is lowered only by the seller, prompted by « Enchère sans mise ».
  - Selling through « Défausser » gives 1 wikibidou per card, which is a floor value.
  - Notifications exist for `marketplace_outbid`, `_auction_won`, `_auction_sold`, `_auction_unsold`, `_auction_midpoint_nudge` (« Enchère sans mise », together with `base_repriced_at`: the starting price is lowered when nobody bids) and `_wishlist_listed` (« Liste de souhaits »).
- **Anti-cheat.** The site has an anti-cheat system: notification types `admin_cheat_warning` (« Contrôle anti-triche ») and `admin_sanction`, plus « Sanction anti-triche active », which restricts packs, trades **and the market**. Automated bidding is the kind of behaviour such systems target and it competes against other players. So prefer read-only tooling (price estimates, undervalued listings, alerts, a ranked shortlist) and leave every bid to Luca's own click unless he explicitly decides otherwise.
  - **Read rate:** bulk reads trigger `403 automation_limit`. Never page through the whole market; keep reads under the collector's limits.

## Python CLI (`wmtag/`)

The pipeline is `read_cards` → `match_card` → `classement.csv` (`;`, utf-8-sig), `a_etiqueter.md`, `suggestions.md` and `rapport.html` (`report.py`, self-contained HTML with embedded JSON). Paths default to the repo root.

`parser.py` is a line-based parser of the pasted text. A card is: alt line, rarity, title, optional description, optional blank line and tag lines, then two consecutive number lines. `Page N / M` sets the page. Numeric titles such as « 1954 » are valid. `wikidata.py` uses the same API calls as `lib/wikidata.js`, without `maxlag` (it tracks query-service lag and blocks reads almost permanently). The cache format `{titles, labels}` is the same as the extension's `wd` key.
