# WikiMasters Tagger

Propose des étiquettes pour ta collection WikiMasters. Deux façons de l'utiliser :

- **l'extension Chrome** (recommandé) : elle lit ta collection directement sur le
  site, propose les étiquettes et surligne les cartes à étiqueter ;
- **le script Python**, à partir du texte que tu copies toi-même depuis la page
  Collection.

Dans les deux cas, **poser les étiquettes dans le jeu reste manuel** : rien n'est
jamais étiqueté automatiquement.

## Extension Chrome

### Installation

1. Ouvre `chrome://extensions` (ou `edge://extensions`) et active le **mode
   développeur**.
2. Clique sur **Charger l'extension non empaquetée** et choisis le dossier
   `extension/` de ce projet.
3. Épingle l'icône (l'étiquette verte) dans la barre d'outils.

Après une modification du code, clique sur ↻ dans `chrome://extensions` puis
recharge la page WikiMasters.

### Utilisation

1. Va sur ta **Collection** WikiMasters. Le panneau **Tagger** apparaît en bas à
   droite et propose de lancer l'analyse (ou clique sur « Analyser toute la
   collection »). L'extension lit chaque page puis clique sur « Suivant → », avec
   une pause entre deux pages (réglable). Garde l'onglet visible pendant
   l'analyse, et vérifie qu'aucun filtre (étiquette, rareté, recherche) n'est
   actif, sinon elle ne voit qu'une partie de ta collection.
2. Clique sur **Catégoriser et ouvrir le rapport**, avec ou sans Wikidata. Le
   rapport liste les cartes à étiqueter (p.3 #12 = page 3, 12e carte), la
   fiabilité des règles par rapport à tes étiquettes manuelles et les thèmes qui
   reviennent (activables en un clic).
3. Sur la page Collection, les cartes à étiqueter sont **surlignées de la couleur
   de l'étiquette suggérée**, avec une pastille à son nom. Clique sur une
   étiquette dans le panneau pour ne surligner qu'elle (pratique avec le bouton
   « Sélectionner » du jeu). Le surlignage disparaît dès que tu as posé
   l'étiquette.

La page **Config** (lien du panneau ou clic droit sur l'icône → Options)
rassemble les étiquettes, leurs mots-clés et couleurs, les thèmes candidats, les
réglages (Wikidata, pause entre les pages, style du surlignage…) et un testeur de
règles. Renseigne ton e-mail avant d'utiliser Wikidata : c'est une règle de
politesse demandée par Wikimedia.

Les noms d'étiquettes doivent être **exactement ceux du jeu**. Les couleurs sont
reprises automatiquement du jeu dès qu'une étiquette apparaît sur une carte.

## Script Python

Le script n'envoie **aucune requête à WikiMasters** : il lit des fichiers texte
en local. Python 3.11+ requis, aucune dépendance externe.

### Utilisation

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

### Fichiers à modifier

- `rules.toml` contient tes étiquettes actives et leurs mots-clés, et ce sont les
  seules étiquettes suggérées. Les mots-clés sont des regex comparées sans
  accents ni majuscules, sur des mots entiers.
- `themes.toml` contient les thématiques candidates. Elles servent uniquement à
  détecter un thème récurrent, jamais à étiqueter.
- `config.toml` contient le seuil `min_count` et le réglage Wikidata.

Ces trois fichiers servent aussi de valeurs par défaut à l'extension : après les
avoir modifiés, lance `python extension/build_defaults.py`, puis « Réinitialiser
la config » dans l'extension si tu veux y reprendre ces valeurs.

### Option Wikidata

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

Ils vérifient aussi, si Node.js est installé, que l'extension classe les cartes
exactement comme le script Python.
