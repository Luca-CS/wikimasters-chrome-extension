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
from wmtag.classify import agreement, head_word, load_rules, match_card, suggest_themes
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
        cards = parse_text(SAMPLE)
        rules, themes = load_rules(ROOT / "rules.toml"), load_rules(ROOT / "themes.toml")
        wd = {"titles": {"Lee Pace": {"qid": "Q1", "P31": ["Q5"], "P106": ["Q33999"]},
                         "Trullo": {"qid": "Q2", "P31": ["Q3"], "P106": []}},
              "labels": {"Q5": "être humain", "Q33999": "acteur", "Q3": "maison"}}
        wd_labels = {c.title: [wd["labels"][q] for p in ("P31", "P106")
                               for q in wd["titles"].get(c.title, {}).get(p, [])] for c in cards}
        wd_text = {t: " ; ".join(labs) for t, labs in wd_labels.items()}
        js_rule = lambda r: {"name": r.name, "keywords": r.raw_keywords, "titleKeywords": r.raw_title_keywords}
        payload = {
            "cards": [{"title": c.title, "desc": c.description, "tags": c.tags, "rarity": c.rarity} for c in cards],
            "rules": [js_rule(r) for r in rules], "themes": [js_rule(t) for t in themes],
            "minCount": 2, "wd": wd,
        }
        proc = subprocess.run(["node", str(ROOT / "extension" / "tests" / "run_core.js")],
                              input=json.dumps(payload), capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        out = json.loads(proc.stdout)

        for c, got in zip(cards, out["matches"], strict=True):
            want = [{"tag": m.tag, "hits": m.hits} for m in match_card(c, rules, wd_text[c.title])]
            self.assertEqual(got, want, c.title)
        self.assertEqual(out["headWords"], [head_word(c.description) for c in cards])

        unmatched = [c for c in cards if not c.tags and not match_card(c, rules, wd_text[c.title])]
        rep = suggest_themes(unmatched, themes, {r.name for r in rules}, 2, wd_text, wd_labels)
        self.assertEqual(out["themes"], [[n, k] for n, k, _, _ in rep.candidate_themes])
        self.assertEqual(out["words"], [[w, n] for w, n, _ in rep.recurring_words])
        # Python itère un set pour les libellés Wikidata : l'ordre des ex aequo n'est pas fixé.
        self.assertEqual(dict(out["wdWords"]), {w: n for w, n, _ in rep.recurring_wikidata})
        n_tagged, n_ok, misses = agreement(cards, rules, wd_text)
        self.assertEqual(out["agreement"], [n_tagged, n_ok, [c.title for c, _, _ in misses]])


if __name__ == "__main__":
    unittest.main()
