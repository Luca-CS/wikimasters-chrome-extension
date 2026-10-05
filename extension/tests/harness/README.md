# Banc de test de l'extension

Teste le content script, la page Paquets et le service worker dans un vrai navigateur
(Edge ou Chrome, sans interface), sans toucher au vrai site : les pages sont reconstruites
en local à partir de tes exports, avec les scripts du site retirés.

```
python extension/tests/harness/run.py            # tous les scénarios
python extension/tests/harness/run.py chain      # seulement ceux dont le nom contient « chain »
```

Il faut Node.js, et Edge ou Chrome. Pour forcer le navigateur, renseigne la variable
d'environnement `WMT_BROWSER`.

## Pages réelles utilisées (dans `input/`, jamais versionnées)

Les fichiers sont reconnus par leur contenu, quel que soit leur nom :

- **Snapshot de la page Collection** : avec F12, puis `copy(location.href + "\n" + document.documentElement.outerHTML)`,
  ou avec « Exporter la page » du panneau.
- **Export de l'écran d'ouverture d'un paquet** (« Carte X / 5 », « Continuer ») : Ctrl+S
  pendant une ouverture, ou « Exporter la page ».
- **CSS du site** (facultatif, seulement pour les captures) : `*.css` sous `input/`. Un
  enregistrement « page complète » (Ctrl+S) les met dans `input/…_files/`.

Les scénarios dont une page manque sont sautés.

## Scénarios

| Nom | Ce qui est vérifié |
| --- | --- |
| `collection` | panneau et proposition d'analyse, surlignage, couleur reprise du jeu, surlignage retiré quand l'étiquette est posée, analyse des 4 pages (fausse pagination), demande de catégorisation |
| `collection-autotag` | étiquetage automatique des 4 pages : mode sélection, barre, fenêtre « Appliquer une étiquette » simulés ; plus rien à poser à la fin, étiquettes absentes du jeu (Ski, Shiny) sautées, « Défausser » jamais touché |
| `collection-sell` | vente des SR sans étiquette sur toutes les pages : filtres « Sans étiquette » et rareté, « Tout sélectionner », confirmation de défausse simulés ; les R, favoris et la carte shiny restent, filtres remis à zéro |
| `pulls-full`, `pulls-regen` | lecture du compteur « 10 / 10 » et du minuteur « Prochain dans 1:43 » |
| `pulls-reveal` | écran d'ouverture reconnu, suggestion sur la carte affichée, retour à 9/10 |
| `pulls-auto-robot` | défilement des 5 cartes, pause sur la vérification « robot » (jamais cochée), « Continuer » |
| `pulls-pingpong` | un autre onglet qui réécrit 10/10 en boucle ne déclenche aucune réécriture |
| `chain-*` | enchaînement piloté avec de vrais clics et touches (`cdp.mjs`, protocole DevTools) : cas normal, bouton qui réagit à l'appui, bouton désactivé un instant, vérification « robot », reprise en main, annonce plein écran de 20 s (« Ouvrir » grisé), erreur réseau à l'ouverture, toast fermé par toi, sanction anti-triche, mouvements du curseur, touche Alt, site qui n'accepte que les clics humains |
| `service-worker` | extension chargée pour de vrai : alarmes, badge, compte Pro, stock plein, notification de test |

## Fichiers

- **`build.py`** : construit `out/`, qui est ignoré par git.
- **`run.py`** : sert `out/` en local, lance les scénarios et vérifie les résultats.
- **`shim.js`** : faux `chrome.*` (stockage en mémoire, runtime).
- **`collection_*.js`, `pulls_*.js`, `chain_sim.js`** : la mise en place des pages et les scénarios.
- **`cdp.mjs`** : envoie les vrais clics et lance l'auto-test du service worker.
- **`selftest.js`** : la page d'auto-test du service worker.

Pour faire une capture, lance `run.py`, puis sers `out/` (`python -m http.server -d extension/tests/harness/out`)
et ouvre par exemple `/pulls/?state=reveal&open&card2` ou `/collection/?open`.
