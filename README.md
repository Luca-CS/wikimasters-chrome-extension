# WikiMasters Tagger

Propose des étiquettes pour ta collection WikiMasters. Deux façons de l'utiliser :

- **l'extension Chrome** (recommandé) : elle lit ta collection directement sur le
  site, propose les étiquettes et surligne les cartes à étiqueter ;
- **le script Python**, à partir du texte que tu copies toi-même depuis la page
  Collection.

Avec l'extension, tu peux aussi faire poser les étiquettes suggérées dans le jeu
(« Étiqueter toute la collection »), uniquement quand tu le lances.

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

4. **Étiquetage automatique** : le bouton « Étiqueter toute la collection » du
   panneau pose dans le jeu toutes les étiquettes suggérées, page par page, sans
   demander de confirmation. Il passe en mode « Sélectionner », coche les cartes
   d'une étiquette, clique sur « Étiqueter » puis sur l'étiquette, et recommence
   pour la suivante. Seules les étiquettes qui existent déjà dans le jeu sont
   posées : les autres (par exemple « Shiny » tant que tu ne l'as pas créée)
   sont sautées et listées à la fin. « Défausser » n'est jamais touché. Un clic
   ou une touche ailleurs que dans le panneau arrête tout. Garde l'onglet
   visible : Chrome ralentit fortement les onglets en arrière-plan. Si tu
   l'arrêtes, le bouton devient « Reprendre l'étiquetage (page X / Y) » et
   repart de la page où il s'était arrêté (« Recommencer depuis la page 1 »
   pour tout refaire). Chaque action recharge la collection côté site (2 à 3 s) :
   l'extension attend la fin de chaque rechargement avant de continuer.

5. **Vente des cartes sans étiquette** : choisis une ou plusieurs raretés avec
   les puces du panneau, clique sur « Vendre les cartes sans étiquette… » puis
   confirme. L'extension règle les filtres du site (« Sans étiquette » + ces
   raretés), puis sélectionne chaque page avec « Tout sélectionner (page) » et
   la défausse (1 wikibidou par carte), jusqu'à la dernière page. C'est
   **irréversible**. Les favoris et les cartes shiny sont gardés (réglable), et
   avant chaque vente elle vérifie que chaque carte affichée est bien sans
   étiquette et de la bonne rareté, sinon elle s'arrête sans rien vendre. Les
   filtres sont remis à zéro à la fin.

La page **Config** (lien du panneau ou clic droit sur l'icône → Options)
rassemble les étiquettes, leurs mots-clés et couleurs, les thèmes candidats, les
réglages (Wikidata, pause entre les pages, style du surlignage…) et un testeur de
règles. Renseigne ton e-mail avant d'utiliser Wikidata : c'est une règle de
politesse demandée par Wikimedia.

Les noms d'étiquettes doivent être **exactement ceux du jeu**. Les couleurs sont
reprises automatiquement du jeu dès qu'une étiquette apparaît sur une carte.

### Paquets : rappels et cartes tirées

L'extension n'ouvre de paquet qu'après ton propre clic sur « Ouvrir » (voir
l'enchaînement plus bas), et jamais au-delà du stock disponible à ce moment-là.

- **Rappels.** Chaque fois que tu passes sur la page Paquets, l'extension relève
  ton compteur (« 7 / 10 paquets disponibles »). Elle en déduit quand ton stock
  sera plein, selon ton type de compte : 1 paquet toutes les 10 min en gratuit,
  toutes les 3 min en Pro, jusqu'à 10. Le nombre estimé s'affiche sur l'icône de
  l'extension, et tu reçois une notification quand c'est plein. Il y a aussi une
  option pour être prévenu à chaque nouveau paquet. C'est une estimation : si tu
  ouvres des paquets depuis un autre appareil, elle se recale à ta prochaine
  visite de la page Paquets dans ce navigateur. Chrome doit être ouvert pour
  recevoir les rappels.
- **Cartes tirées.** Pendant l'ouverture d'un paquet, chaque carte affichée est
  analysée. Le panneau récapitule les cartes du paquet avec leurs étiquettes
  suggérées, et la carte à l'écran est surlignée. Une carte n'est analysée
  qu'une fois visible, donc pas de divulgâchage.
- **Défilement automatique** (désactivable dans le panneau ou la Config). Après
  ton clic sur « Ouvrir », l'extension fait défiler les cartes du paquet, puis
  clique sur « Continuer ». Elle compte environ 0,2 s par carte, soit un paquet
  en une seconde environ, et 0,25 s de plus pour les UR et L. Avec le **rythme
  naturel**, ce temps varie légèrement et dérive doucement d'une carte à
  l'autre.
- **Enchaînement des paquets** (désactivable). Ton clic sur « Ouvrir », ou la
  touche Entrée quand le bouton est sélectionné, lance l'enchaînement.
  L'extension rouvre ensuite un par un les paquets qui étaient disponibles à ce
  moment-là, jamais ceux qui se rechargent entre-temps. Si le site refuse un
  jour les clics automatiques, l'extension ne force rien : elle te demande de
  cliquer, et l'enchaînement reprend.
- **Dans les deux cas**, si la vérification « je ne suis pas un robot »
  s'affiche, tout se met en pause sans y toucher et reprend une fois que tu
  l'as validée. Pareil pour toute fenêtre du site (annonce, toast…), même si
  elle grise le bouton « Ouvrir » un moment, et si l'onglet n'est plus visible.
  Si une ouverture échoue avec un message d'erreur du site, l'extension
  réessaie deux fois en laissant passer quelques secondes.
- **Ce qui arrête tout** : un clic souris ou une touche du clavier ailleurs que
  dans le panneau. Fermer une fenêtre du site (clic dessus, Échap) ne compte
  pas. Les mouvements du curseur et les touches seules comme Alt (Alt+Tab),
  Ctrl ou Windows n'arrêtent rien. Une « sanction anti-triche » affichée par
  le site arrête tout définitivement, sans réessayer.
- **Étiquette Shiny.** Les cartes shiny (✦ à côté de la rareté) se voient
  proposer l'étiquette « Shiny » en plus de leur catégorie, même si elles sont
  déjà classées. Crée l'étiquette « Shiny » dans le jeu pour l'utiliser.

Si le site change et que quelque chose ne marche plus, le lien **« Exporter la
page »** du panneau enregistre le HTML de la page, sans tes identifiants. Il
suffit de le déposer dans `input/` pour adapter l'extension.

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
