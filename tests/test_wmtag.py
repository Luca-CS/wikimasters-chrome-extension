import json
import re
import shutil
import subprocess
import tempfile
import tomllib
import unittest
from pathlib import Path
from unittest import mock

from wmtag import __main__ as cli
from wmtag.classify import agreement, head_word, load_rules, match_card, suggest, suggest_themes
from wmtag.parser import Card, parse_text

ROOT = Path(__file__).resolve().parent.parent
SAMPLE = (ROOT / "tests" / "sample_page.txt").read_text(encoding="utf-8")


class TestParser(unittest.TestCase):
    def setUp(self):
        self.cards = parse_text(SAMPLE)

    def test_count_and_order(self):
        self.assertEqual(len(self.cards), 50)
        self.assertEqual([c.position for c in self.cards], list(range(1, 51)))
        self.assertTrue(all(c.page == 1 for c in self.cards))

    def test_fields(self):
        c = self.cards[1]
        self.assertEqual((c.title, c.rarity, c.tags), ("Camille Lellouche", "L", ["Cinéma/Séries/Acteurs"]))
        self.assertEqual((c.attack, c.defense), (8820, 6382))

    def test_card_without_description(self):
        trullo = next(c for c in self.cards if c.title == "Trullo")
        self.assertEqual((trullo.description, trullo.tags), ("", []))

    def test_numeric_title(self):
        txt = "Page 1 / 2\n1954\nR\n1954\nannée du XXe siècle\n\n5 801\n8 255\n"
        (c,) = parse_text(txt)
        self.assertEqual((c.title, c.description, c.attack, c.defense), ("1954", "année du XXe siècle", 5801, 8255))

    def test_shiny_badge(self):
        for badge in ("L✦ shiny", "L ✦ shiny", "L\n✦\nshiny"):
            (c,) = parse_text(f"Page 1 / 1\nMarie\n{badge}\nMarie Trintignant\nactrice française\n\n8 973\n6 294\n")
            self.assertEqual((c.rarity, c.shiny, c.title, c.description), ("L", True, "Marie Trintignant", "actrice française"))
        self.assertFalse(self.cards[0].shiny)

    def test_two_pages_concatenated(self):
        page2 = SAMPLE.replace("Page 1 / 25", "Page 2 / 25")
        cards = parse_text(SAMPLE + "\n" + page2)
        self.assertEqual(len(cards), 100)
        self.assertEqual(cards[50].page, 2)
        self.assertEqual(cards[50].position, 1)


class TestClassify(unittest.TestCase):
    def setUp(self):
        self.rules = load_rules(ROOT / "rules.toml")

    def tags(self, desc, title="X"):
        return [m.tag for m in match_card(Card(title=title, rarity="C", description=desc), self.rules)]

    def test_rules(self):
        self.assertEqual(self.tags("actrice britannique")[0], "Cinéma/Séries/Acteurs")
        self.assertEqual(self.tags("groupe de variété française")[0], "Musique")
        self.assertEqual(self.tags("divinité de la mythologie grecque")[0], "Mythologie")
        self.assertEqual(self.tags("footballeur belge"), [])
        self.assertEqual(self.tags("", title="Truc (film)")[0], "Cinéma/Séries/Acteurs")

    def test_whole_words_only(self):
        self.assertEqual(self.tags("roitelet huppé"), [])  # "roi" ne doit pas matcher

    def test_alternation_keeps_word_boundaries(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "r.toml"
            p.write_text('[tags."X"]\nkeywords = ["acteur|actrice"]\n', encoding="utf-8")
            rules = load_rules(p)
        card = lambda desc: Card(title="T", rarity="C", description=desc)
        self.assertEqual(match_card(card("acteurs et actrices"), rules), [])
        self.assertEqual(match_card(card("actrice belge"), rules)[0].hits, ["actrice"])

    def test_extra_text_wikidata(self):
        c = Card(title="X", rarity="C", description="")
        self.assertEqual(match_card(c, self.rules, "être humain ; acteur")[0].tag, "Cinéma/Séries/Acteurs")

    def test_reported_misses(self):
        """Ratés relevés dans le rapport de l'extension (description vide quand elle affiche « — »)."""
        cases = [("Couplage (théorie des graphes)", "", "Maths"),
                 ("F1 2014 (jeu vidéo)", "jeu vidéo de 2014", "Automobile"),
                 ("Circuit booléen", "", "Maths"),
                 ("Members Only", "groupe de hip-hop américain", "Musique"),
                 ("Pálinka de poire de Göcsej", "", "Roumanie"),
                 ("Hydre (héraldique)", "figure héraldique imaginaire", "Mythologie")]
        for title, desc, want in cases:
            self.assertEqual(self.tags(desc, title=title)[:1], [want], title)

    def test_title_qualifier_counts_as_description(self):
        self.assertEqual(self.tags("", title="Angola (chanson)"), ["Musique"])
        self.assertEqual(self.tags("", title="Ouédraogo (roi)"), ["Royauté"])

    def test_false_positives(self):
        self.assertEqual(self.tags("personnage du film La Cité de Dieu"), ["Cinéma/Séries/Acteurs"])
        self.assertEqual(self.tags("modèle de véhicule de combat"), [])
        self.assertEqual(self.tags("premier ministre après la chute de la monarchie"), [])
        self.assertEqual(self.tags("autrice, scénariste de bande dessinée"), [])
        self.assertEqual(self.tags("prince du Saint-Empire romain germanique"), ["Royauté"])

    def test_wikidata_only_completes(self):
        c = Card(title="Lee Pace", rarity="C", description="acteur américain")
        # La description dit acteur : l'occupation « musicien » de Wikidata ne suffit pas.
        self.assertEqual([m.tag for m in match_card(c, self.rules, "être humain ; acteur ; musicien")],
                         ["Cinéma/Séries/Acteurs"])
        writer = Card(title="Chris Offutt", rarity="C", description="écrivain américain")
        self.assertEqual(match_card(writer, self.rules, "être humain ; romancier ; scénariste", "être humain"), [])
        # Description vague, mais nature Wikidata parlante : on la prend.
        work = Card(title="Offertorium", rarity="C", description="œuvre de Sofia Goubaïdoulina")
        self.assertEqual([m.tag for m in match_card(work, self.rules, "œuvre ou composition musicale",
                                                    "œuvre ou composition musicale")], ["Musique"])

    def test_shiny_tag(self):
        shiny = Card(title="Marie Trintignant", rarity="L", description="actrice française", shiny=True)
        self.assertEqual([m.tag for m in suggest(shiny, self.rules)], ["Cinéma/Séries/Acteurs", "Shiny"])
        shiny.tags = ["Cinéma/Séries/Acteurs"]  # déjà classée : il ne manque que Shiny
        self.assertEqual([m.tag for m in suggest(shiny, self.rules)], ["Shiny"])
        shiny.tags = ["Shiny"]  # Shiny seule ne classe pas la carte
        self.assertEqual([m.tag for m in suggest(shiny, self.rules)], ["Cinéma/Séries/Acteurs"])
        plain = Card(title="X", rarity="C", description="actrice française", tags=["Musique"])
        self.assertEqual(suggest(plain, self.rules), [])

    def test_head_word(self):
        self.assertEqual(head_word("actrice britannique"), "acteur")
        self.assertEqual(head_word("chanteuse française"), "chanteur")
        self.assertEqual(head_word("l'élite intellectuelle"), "elite")


class TestEndToEnd(unittest.TestCase):
    def test_run_and_snippets_are_valid_toml(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "in").mkdir()
            (d / "in" / "p1.txt").write_text(SAMPLE, encoding="utf-8")
            cli.main(["--input", str(d / "in"), "--output", str(d / "out"), "--min-count", "2", "--no-wikidata", "--no-open"])
            sugg = (d / "out" / "suggestions.md").read_text(encoding="utf-8")
            self.assertIn("16/16", sugg)
            blocks = re.findall(r"```toml\n(.*?)```", sugg, re.S)
            self.assertTrue(blocks)
            for b in blocks:
                tomllib.loads(b)  # lève une erreur si le bloc n'est pas du TOML valide
            todo = (d / "out" / "a_etiqueter.md").read_text(encoding="utf-8")
            self.assertIn("Eve Ridley", todo)
            self.assertNotIn("Lee Pace", todo)  # déjà étiquetée
            html = (d / "out" / "rapport.html").read_text(encoding="utf-8")
            data = re.search(r'<script id="data" type="application/json">(.*?)</script>', html, re.S).group(1)
            data = json.loads(data)  # le JSON injecté doit rester valide
            self.assertEqual(data["agreement"], {**data["agreement"], "ok": 16, "total": 16})
            self.assertIn("Eve Ridley", [c["title"] for g in data["todo"] for c in g["items"]])


class TestWikidataMocked(unittest.TestCase):
    def test_enrich(self):
        from wmtag.wikidata import WikidataClient

        def fake_get(self, params):
            if "titles" in params:
                return {"entities": {"Q1": {
                    "id": "Q1", "sitelinks": {"frwiki": {"title": "Lee Pace"}},
                    "claims": {
                        "P31": [{"mainsnak": {"datavalue": {"value": {"id": "Q5"}}}}],
                        "P106": [{"mainsnak": {"datavalue": {"value": {"id": "Q33999"}}}}],
                    }}, "-1": {"missing": ""}}}
            return {"entities": {
                "Q5": {"labels": {"fr": {"value": "être humain"}}},
                "Q33999": {"labels": {"fr": {"value": "acteur"}}},
            }}

        with tempfile.TemporaryDirectory() as d, mock.patch.object(WikidataClient, "_get", fake_get):
            cache = Path(d) / "wd.json"
            client = WikidataClient(cache, "test")
            out = client.enrich(["Lee Pace", "Inconnu"])
            self.assertEqual(out["Lee Pace"], {"P31": ["être humain"], "P106": ["acteur"]})
            self.assertEqual(out["Inconnu"], {"P31": [], "P106": []})
            self.assertIn("Lee Pace", json.loads(cache.read_text(encoding="utf-8"))["titles"])


@unittest.skipUnless(shutil.which("node"), "node absent")
class TestExtensionParity(unittest.TestCase):
    """Le moteur JS de l'extension (extension/lib/core.js) doit classer exactement comme Python."""

    def test_same_results_as_python(self):
        cards = parse_text(SAMPLE) + [
            Card(title="Couplage (théorie des graphes)", rarity="PC"),
            Card(title="Marie Trintignant", rarity="L", description="actrice française", shiny=True),
            Card(title="Charlot", rarity="SR", description="personnage", tags=["Cinéma/Séries/Acteurs"], shiny=True),
            Card(title="Chris Offutt", rarity="C", description="écrivain américain"),
            Card(title="Offertorium", rarity="C", description="œuvre de Sofia Goubaïdoulina"),
        ]
        rules, themes = load_rules(ROOT / "rules.toml"), load_rules(ROOT / "themes.toml")
        wd = {"titles": {"Lee Pace": {"qid": "Q1", "P31": ["Q5"], "P106": ["Q33999", "Q639669"]},
                         "Trullo": {"qid": "Q2", "P31": ["Q3"], "P106": []},
                         "Chris Offutt": {"qid": "Q4", "P31": ["Q5"], "P106": ["Q28389"]},
                         "Offertorium": {"qid": "Q6", "P31": ["Q207628"], "P106": []}},
              "labels": {"Q5": "être humain", "Q33999": "acteur", "Q3": "maison", "Q639669": "musicien",
                         "Q28389": "scénariste", "Q207628": "œuvre ou composition musicale"}}
        wd_labels = {c.title: [wd["labels"][q] for p in ("P31", "P106")
                               for q in wd["titles"].get(c.title, {}).get(p, [])] for c in cards}
        wd_text = {t: " ; ".join(labs) for t, labs in wd_labels.items()}
        wd_nature = {c.title: " ; ".join(wd["labels"][q] for q in wd["titles"].get(c.title, {}).get("P31", []))
                     for c in cards}
        js_rule = lambda r: {"name": r.name, "keywords": r.raw_keywords, "titleKeywords": r.raw_title_keywords,
                             "shiny": r.shiny}
        payload = {
            "cards": [{"title": c.title, "desc": c.description, "tags": c.tags, "rarity": c.rarity, "shiny": c.shiny}
                      for c in cards],
            "rules": [js_rule(r) for r in rules], "themes": [js_rule(t) for t in themes],
            "minCount": 2, "wd": wd,
        }
        proc = subprocess.run(["node", str(ROOT / "extension" / "tests" / "run_core.js")],
                              input=json.dumps(payload), capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        out = json.loads(proc.stdout)

        pick = lambda ms: [{"tag": m.tag, "hits": m.hits} for m in ms]  # noqa: E731
        for c, got, got_sugg in zip(cards, out["matches"], out["suggestions"], strict=True):
            self.assertEqual(got, pick(match_card(c, rules, wd_text[c.title])), c.title)
            self.assertEqual(got_sugg, pick(suggest(c, rules, wd_text[c.title], wd_nature[c.title])), c.title)
        self.assertEqual(out["headWords"], [head_word(c.description) for c in cards])
        self.assertEqual([m["tag"] for m in out["suggestions"][-4]], ["Cinéma/Séries/Acteurs", "Shiny"])
        self.assertEqual(out["suggestions"][-2], [])  # écrivain : l'occupation « scénariste » ne suffit pas

        specials = {r.name for r in rules if r.shiny}
        unmatched = [c for c in cards
                     if not [t for t in c.tags if t not in specials]
                     and all(m.tag in specials for m in suggest(c, rules, wd_text[c.title], wd_nature[c.title]))]
        rep = suggest_themes(unmatched, themes, {r.name for r in rules}, 2, wd_text, wd_labels)
        self.assertEqual(out["themes"], [[n, k] for n, k, _, _ in rep.candidate_themes])
        self.assertEqual(out["words"], [[w, n] for w, n, _ in rep.recurring_words])
        # Python itère un set pour les libellés Wikidata : l'ordre des ex aequo n'est pas fixé.
        self.assertEqual(dict(out["wdWords"]), {w: n for w, n, _ in rep.recurring_wikidata})
        n_tagged, n_ok, misses = agreement(cards, rules, wd_text, wd_nature)
        self.assertEqual(out["agreement"], [n_tagged, n_ok, [c.title for c, _, _ in misses]])

    def test_js_unit_tests(self):
        """Tests Node de l'extension (estimation des paquets, minuteurs…)."""
        proc = subprocess.run(["node", "--test", "extension/tests/*.test.js"], cwd=ROOT,
                              capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(proc.returncode, 0, proc.stdout[-3000:] + proc.stderr[-2000:])


if __name__ == "__main__":
    unittest.main()
