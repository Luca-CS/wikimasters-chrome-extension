# WikiMasters Tagger

Propose des étiquettes pour ta collection WikiMasters à partir du texte que tu
copies toi-même depuis la page Collection. Le script n'envoie **aucune requête à
WikiMasters** : il lit des fichiers texte en local. Poser les étiquettes dans le
jeu reste manuel.

Python 3.11+ requis, aucune dépendance externe.

## Utilisation

1. Sur WikiMasters, ouvre ta collection, fais Ctrl+A puis Ctrl+C, et colle le
   contenu dans `input/page01.txt`. Pour les pages suivantes, tu peux créer un
   fichier par page ou tout coller à la suite dans un seul fichier : le numéro de
   page est détecté automatiquement.
2. Lance le script :
   ```
   python -m wmtag
   ```
   (dans VS Code : F5 avec la config « wmtag », ou bien « wmtag + Wikidata »)
3. Lis les résultats dans `output/` :
   - `a_etiqueter.md` : les cartes à étiqueter, groupées par étiquette et triées
     dans l'ordre d'affichage (p.3 #12 = page 3, 12e carte). Les cases à cocher
     permettent de suivre ta progression ;
   - `suggestions.md` : la fiabilité des règles par rapport à tes étiquettes
     manuelles, les nouvelles thématiques qui reviennent souvent (avec le bloc à
     coller dans `rules.toml`) et les mots récurrents ;
   - `classement.csv` : tout le détail (séparateur `;`, s'ouvre dans Excel) ;
   - `rapport.html` : la même chose en version mise en forme (s'ouvre tout seul dans le navigateur, `--no-open` pour l'éviter). Les cases cochées y sont mémorisées.

## Fichiers à modifier

- `rules.toml` contient tes étiquettes actives et leurs mots-clés, et ce sont les
  seules étiquettes suggérées. Les mots-clés sont des regex comparées sans
  accents ni majuscules, sur des mots entiers.
- `themes.toml` contient les thématiques candidates. Elles servent uniquement à
  détecter un thème récurrent, jamais à étiqueter.
- `config.toml` contient le seuil `min_count` et le réglage Wikidata.

## Option Wikidata

`python -m wmtag --wikidata` ajoute, pour chaque carte, sa nature (« être
humain », « film », « commune de France »…) et son occupation (« acteur »,
« footballeur »…) via l'API publique de Wikidata, ce qui améliore le classement
quand la description est vide ou vague. Les résultats sont mis en cache dans
`cache/wikidata.json`, donc seuls les nouveaux titres sont interrogés. Avant de
l'activer, mets ton e-mail dans `user_agent` (`config.toml`) : c'est une règle de
politesse demandée par Wikimedia.

## Tests

```
python -m unittest -v
```
