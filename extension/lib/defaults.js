// Généré par extension/build_defaults.py à partir de rules.toml, themes.toml et config.toml.
// Ne pas modifier à la main : relancer `python extension/build_defaults.py`.
(function (root) {
  const WMT = (root.WMT = root.WMT || {});
  const DEFAULTS = {
    "version": 1,
    "rules": [
      {
        "name": "Cinéma/Séries/Acteurs",
        "color": "#fbbf24",
        "keywords": [
          "acteur",
          "actrice",
          "comedien",
          "comedienne",
          "cineaste",
          "realisateur",
          "realisatrice",
          "scenariste",
          "film",
          "telefilm",
          "serie televisee",
          "serie de television",
          "serie d'animation",
          "franchise mediatique",
          "metteur en scene",
          "producteur de cinema",
          "societe de production"
        ],
        "titleKeywords": [
          "\\(film\\)",
          "\\(serie televisee\\)",
          "\\(telefilm\\)"
        ]
      },
      {
        "name": "Royauté",
        "color": "#a78bfa",
        "keywords": [
          "roi",
          "reine",
          "prince",
          "princesse",
          "monarque",
          "monarchie",
          "dauphin",
          "empereur",
          "imperatrice",
          "dynastie",
          "souverain",
          "souveraine",
          "tsar",
          "tsarine",
          "sultan",
          "pharaon",
          "duc",
          "duchesse",
          "infante?"
        ],
        "titleKeywords": []
      },
      {
        "name": "Musique",
        "color": "#5eead4",
        "keywords": [
          "chanteur",
          "chanteuse",
          "musicien",
          "musicienne",
          "projet musical",
          "groupe de (musique|rock|pop|rap|metal|jazz|variete)\\w*",
          "album",
          "chanson",
          "single",
          "compositeur",
          "compositrice",
          "rappeur",
          "rappeuse",
          "pianiste",
          "guitariste",
          "batteur",
          "batteuse",
          "violoniste",
          "orchestre",
          "opera",
          "auteur-compositeur",
          "dj"
        ],
        "titleKeywords": [
          "\\(album\\)",
          "\\(chanson\\)",
          "\\(groupe\\)"
        ]
      },
      {
        "name": "Mythologie",
        "color": "#fb7185",
        "keywords": [
          "mytholog\\w*",
          "divinite",
          "dieu",
          "deesse",
          "titan",
          "titanide",
          "nymphe",
          "heros grec",
          "filles? de zeus",
          "creature legendaire",
          "antiquite",
          "antique",
          "grece antique",
          "rome antique",
          "egypte antique",
          "ancienne egypte",
          "empire romain",
          "republique romaine",
          "consul romain",
          "empereur romain",
          "cite (grecque|antique)",
          "hellenisti\\w*",
          "grec ancien",
          "athenes",
          "athenien\\w*",
          "sparte",
          "spartiate",
          "acropole",
          "(roi|reine|pharaon) d'egypte",
          "site archeologique",
          "romaine?s?",
          "grecque? antique",
          "pharaon",
          "pyramide",
          "hieroglyphe\\w*",
          "mesopotami\\w*",
          "babylon\\w*",
          "sumer\\w*",
          "assyri\\w*",
          "hittite\\w*",
          "perse antique",
          "achemenide\\w*",
          "carthag\\w*",
          "etrusque\\w*",
          "gaulois\\w*",
          "macedoine antique",
          "legion romaine",
          "legionnaire romain",
          "gladiateur\\w*",
          "(philosophe|poete|poetesse|dramaturge|historien|orateur|general|homme politique|sculpteur|mathematicien) (grec|romain|athenien|carthaginois)",
          "amphitheatre",
          "theatre antique",
          "oracle",
          "troie",
          "iliade",
          "odyssee",
          "heros de la mythologie",
          "age du (bronze|fer)",
          "paleochretien\\w*"
        ],
        "titleKeywords": [
          "^ptolemee",
          "^cleopatre",
          "^ramses",
          "^alexandre le grand",
          "^jules cesar",
          "^neron",
          "^caligula",
          "^hadrien",
          "^trajan",
          "^auguste$",
          "^nefertiti",
          "^toutankhamon",
          "^pericles",
          "^hannibal",
          "^vercingetorix",
          "^marches de trajan"
        ]
      },
      {
        "name": "Maths",
        "color": "#01c7fc",
        "keywords": [
          "mathemati\\w*",
          "entier",
          "nombres?",
          "theoreme",
          "geometri\\w*",
          "algebr\\w*",
          "equation",
          "conjecture",
          "polynome",
          "integrale"
        ],
        "titleKeywords": []
      },
      {
        "name": "Automobile",
        "color": "#86efac",
        "keywords": [
          "automobile",
          "automobiles",
          "voiture",
          "voitures",
          "vehicule",
          "supercar",
          "constructeur automobile",
          "marque automobile",
          "modele d'automobile",
          "pilote (automobile|de course|de rallye|de formule \\w+)",
          "formule 1",
          "formule un",
          "rallye",
          "course automobile",
          "endurance automobile",
          "nascar",
          "karting"
        ],
        "titleKeywords": [
          "\\(automobile\\)",
          "^formule 1",
          "^grand prix (automobile|de formule)"
        ]
      },
      {
        "name": "Roumanie",
        "color": "#f87171",
        "keywords": [
          "roumain\\w*",
          "roumanie",
          "bucarest",
          "transylvan\\w*",
          "valachie",
          "valaque",
          "dobroudja",
          "carpates"
        ],
        "titleKeywords": [
          "roumanie",
          "bucarest"
        ]
      },
      {
        "name": "Ski",
        "color": "#22d3ee",
        "keywords": [
          "ski",
          "skis",
          "skieur",
          "skieuse",
          "ski alpin",
          "ski de fond",
          "saut a ski",
          "station de ski",
          "slalom",
          "slalom geant",
          "super-g",
          "biathl\\w*",
          "combine nordique",
          "snowboard\\w*"
        ],
        "titleKeywords": [
          "^ski ",
          "coupe du monde de ski"
        ]
      }
    ],
    "themes": [
      {
        "name": "Sport",
        "color": "#a3e635",
        "keywords": [
          "footballeur",
          "footballeuse",
          "cycliste",
          "perchiste",
          "grimpeur",
          "grimpeuse",
          "athlete",
          "joueur de \\w+",
          "joueuse de \\w+",
          "tennisman",
          "tenniswoman",
          "boxeur",
          "boxeuse",
          "nageur",
          "nageuse",
          "rugbyman",
          "basketteur",
          "basketteuse",
          "handballeur",
          "handballeuse",
          "pilote (automobile|de course|de moto)",
          "skieur",
          "skieuse",
          "judoka",
          "entraineur",
          "entraineuse",
          "sportif",
          "sportive",
          "club de \\w+",
          "equipe de \\w+",
          "championnat",
          "coupe du monde",
          "jeux olympiques",
          "stade"
        ],
        "titleKeywords": [
          "^equipe de",
          "championnat",
          "coupe du monde",
          "jeux olympiques"
        ]
      },
      {
        "name": "Politique",
        "color": "#f87171",
        "keywords": [
          "homme politique",
          "femme politique",
          "personnalite politique",
          "parti politique",
          "depute",
          "deputee",
          "senateur",
          "senatrice",
          "ministre",
          "president",
          "presidente",
          "premier ministre",
          "maire",
          "diplomate",
          "politico\\w*",
          "election",
          "syndicat\\w*"
        ],
        "titleKeywords": []
      },
      {
        "name": "Littérature",
        "color": "#22d3ee",
        "keywords": [
          "ecrivain",
          "ecrivaine",
          "romancier",
          "romanciere",
          "poete",
          "poetesse",
          "dramaturge",
          "essayiste",
          "livre",
          "roman",
          "recueil",
          "nouvelle",
          "bande dessinee",
          "manga",
          "auteur",
          "autrice"
        ],
        "titleKeywords": []
      },
      {
        "name": "Géographie/Lieux",
        "color": "#e879f9",
        "keywords": [
          "commune",
          "ville",
          "village",
          "capitale",
          "pays",
          "region",
          "departement",
          "province",
          "ile",
          "archipel",
          "fleuve",
          "riviere",
          "lac",
          "montagne",
          "massif",
          "volcan",
          "desert",
          "quartier",
          "arrondissement",
          "canton",
          "etat (federe|des etats-unis)"
        ],
        "titleKeywords": []
      },
      {
        "name": "Histoire/Militaire",
        "color": "#facc15",
        "keywords": [
          "bataille",
          "guerre",
          "siege",
          "traite",
          "revolution",
          "armee",
          "militaire",
          "general",
          "marechal",
          "helicoptere",
          "avion de (chasse|combat)",
          "char d'assaut",
          "navire",
          "cuirasse",
          "porte-avions",
          "espion",
          "espionne",
          "resistant",
          "resistante"
        ],
        "titleKeywords": []
      },
      {
        "name": "Sciences",
        "color": "#4ade80",
        "keywords": [
          "physicien\\w*",
          "chimiste",
          "biologiste",
          "astronome",
          "astrophysicien\\w*",
          "ingenieur\\w*",
          "scientifique",
          "chercheur",
          "chercheuse",
          "medecin",
          "element chimique",
          "molecule",
          "planete",
          "etoile",
          "galaxie",
          "theorie",
          "aerospatial\\w*",
          "physique",
          "chimie",
          "biologie"
        ],
        "titleKeywords": []
      },
      {
        "name": "Philosophie",
        "color": "#38bdf8",
        "keywords": [
          "philosophe",
          "philosophi\\w*",
          "courant (philosophique|de pensee)",
          "doctrine",
          "ideologie"
        ],
        "titleKeywords": []
      },
      {
        "name": "Nature/Animaux",
        "color": "#c084fc",
        "keywords": [
          "espece",
          "genre (de|d') \\w+",
          "famille de \\w+",
          "oiseau",
          "insecte",
          "mammifere",
          "poisson",
          "reptile",
          "plante",
          "arbre",
          "champignon",
          "animal\\w*",
          "race de \\w+"
        ],
        "titleKeywords": []
      },
      {
        "name": "Tech/Informatique",
        "color": "#2dd4bf",
        "keywords": [
          "logiciel",
          "application",
          "systeme d'exploitation",
          "langage de programmation",
          "site web",
          "reseau social",
          "jeu video",
          "console de jeux?",
          "informatique",
          "smartphone",
          "moteur de recherche"
        ],
        "titleKeywords": [
          "playstation",
          "nintendo",
          "xbox",
          "microsoft",
          "google",
          "apple"
        ]
      },
      {
        "name": "Entreprises/Marques",
        "color": "#fda4af",
        "keywords": [
          "entreprise",
          "societe",
          "marque",
          "constructeur",
          "multinationale",
          "groupe industriel",
          "chaine de \\w+"
        ],
        "titleKeywords": []
      },
      {
        "name": "Religion",
        "color": "#93c5fd",
        "keywords": [
          "pape",
          "saint",
          "sainte",
          "eglise",
          "religion",
          "religieux",
          "religieuse",
          "eveque",
          "cathedrale",
          "abbaye",
          "monastere",
          "theolog\\w*"
        ],
        "titleKeywords": []
      },
      {
        "name": "Arts",
        "color": "#fbbf24",
        "keywords": [
          "peintre",
          "sculpteur",
          "sculptrice",
          "tableau",
          "peinture",
          "sculpture",
          "photographe",
          "architecte",
          "musee",
          "dessinateur",
          "dessinatrice",
          "illustrat\\w*"
        ],
        "titleKeywords": []
      },
      {
        "name": "Médias/TV",
        "color": "#a78bfa",
        "keywords": [
          "animateur",
          "animatrice",
          "journaliste",
          "emission de television",
          "chaine de television",
          "presentateur",
          "presentatrice",
          "youtubeur",
          "youtubeuse",
          "streameur",
          "humoriste"
        ],
        "titleKeywords": []
      },
      {
        "name": "Listes Wikipédia",
        "color": "#f472b6",
        "keywords": [
          "page de liste de wikimedia",
          "liste"
        ],
        "titleKeywords": [
          "^liste d",
          "^deces en"
        ]
      }
    ],
    "settings": {
      "minCount": 10,
      "wikidata": true,
      "contact": "",
      "pageDelay": 1000,
      "highlight": true,
      "highlightStyle": "ring",
      "autoPrompt": true
    }
  };
  WMT.defaults = { config: () => JSON.parse(JSON.stringify(DEFAULTS)) };
})(globalThis);
