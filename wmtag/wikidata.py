"""Enrichissement optionnel via l'API publique de Wikidata (pas WikiMasters).

Pour chaque titre de carte (= titre d'article de Wikipédia FR), récupère :
  - P31  « nature de l'élément » (ex. être humain, film, commune de France)
  - P106 « occupation »          (ex. acteur, footballeur)
et leurs libellés en français. Résultats mis en cache dans cache/wikidata.json
pour ne jamais redemander deux fois la même chose.

Politesse envers les serveurs Wikimedia : requêtes par lots de 50, pause entre
les lots, attente si le serveur est surchargé, et un User-Agent identifiable (à compléter dans config.toml).
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://www.wikidata.org/w/api.php"
PROPS = ("P31", "P106")
BATCH = 50


class WikidataClient:
    def __init__(self, cache_path: Path, user_agent: str, pause: float = 1.0):
        self.cache_path = cache_path
        self.user_agent = user_agent
        self.pause = pause
        self.cache = {"titles": {}, "labels": {}}
        if cache_path.exists():
            self.cache = json.loads(cache_path.read_text(encoding="utf-8"))

    def save(self):
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(json.dumps(self.cache, ensure_ascii=False, indent=1), encoding="utf-8")

    def _get(self, params: dict) -> dict:
        # Pas de maxlag : il suit le retard du query service (souvent > 5 s) et sert
        # surtout à freiner les bots qui éditent. Pour de la lecture, lots + pause suffisent.
        params = {**params, "format": "json", "formatversion": "2"}
        url = API + "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"User-Agent": self.user_agent})
        for attempt in range(4):
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.load(r)
            if data.get("error", {}).get("code") in ("maxlag", "ratelimited"):
                time.sleep(5 * (attempt + 1))
                continue
            if "error" in data:
                raise RuntimeError(f"Wikidata : {data['error'].get('info', data['error'])}")
            time.sleep(self.pause)
            return data
        raise RuntimeError("Wikidata surchargé, réessaie plus tard.")

    def _fetch_titles(self, titles: list[str]):
        for i in range(0, len(titles), BATCH):
            chunk = titles[i : i + BATCH]
            data = self._get({
                "action": "wbgetentities", "sites": "frwiki", "titles": "|".join(chunk),
                "props": "claims|sitelinks", "sitefilter": "frwiki",
            })
            found = set()
            for ent in (data.get("entities") or {}).values():
                if "missing" in ent:
                    continue
                title = (ent.get("sitelinks") or {}).get("frwiki", {}).get("title")
                if not title:
                    continue
                ids = {}
                for p in PROPS:
                    ids[p] = [
                        c["mainsnak"]["datavalue"]["value"]["id"]
                        for c in (ent.get("claims") or {}).get(p, [])
                        if c.get("mainsnak", {}).get("datavalue")
                    ]
                self.cache["titles"][title] = {"qid": ent["id"], **ids}
                found.add(title)
            for t in chunk:  # titres introuvables (redirection, homonymie...) : mémorisés vides
                if t not in found:
                    self.cache["titles"].setdefault(t, {"qid": None})
            print(f"  Wikidata : {min(i + BATCH, len(titles))}/{len(titles)} titres")

    def _fetch_labels(self, qids: list[str]):
        for i in range(0, len(qids), BATCH):
            chunk = qids[i : i + BATCH]
            data = self._get({
                "action": "wbgetentities", "ids": "|".join(chunk),
                "props": "labels", "languages": "fr|en",
            })
            for qid, ent in (data.get("entities") or {}).items():
                labels = ent.get("labels") or {}
                lab = (labels.get("fr") or labels.get("en") or {}).get("value", qid)
                self.cache["labels"][qid] = lab

    def enrich(self, titles: list[str]) -> dict[str, dict[str, list[str]]]:
        """Renvoie {titre: {"P31": [libellés], "P106": [libellés]}}."""
        todo = sorted({t for t in titles if t not in self.cache["titles"]})
        try:
            if todo:
                self._fetch_titles(todo)
            qids = sorted({
                q for t in titles for p in PROPS
                for q in self.cache["titles"].get(t, {}).get(p, [])
                if q not in self.cache["labels"]
            })
            if qids:
                self._fetch_labels(qids)
        finally:
            self.save()
        out = {}
        for t in titles:
            e = self.cache["titles"].get(t, {})
            out[t] = {p: [self.cache["labels"].get(q, q) for q in e.get(p, [])] for p in PROPS}
        return out
