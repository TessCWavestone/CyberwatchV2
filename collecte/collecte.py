#!/usr/bin/env python3
"""
Cyber Watch — collecte automatique, gratuite, sans clé API.

Lit la liste des sources dans l'Excel (config/sources.xlsx) et les sources
ajoutées depuis le site (config/sources_manuelles.json), récupère les nouveaux
articles (flux RSS/Atom quand il existe, sinon surveillance de la page web),
et les GARDE TOUS : chaque article reçoit une note de pertinence (élevée /
moyenne / faible) et une justification (thèmes proches, mots-clés présents).
La base de connaissance initiale (config/base_connaissance.json) est ajoutée.

Fichiers écrits (lus par le site) :
    data/actualites.json / .js    les articles
    data/etat_sources.json / .js  le diagnostic de chaque source
    data/versions.json / .js      l'historique des collectes
    data/vus.json                 la mémoire des liens déjà vus (pages web)

Lancement :  python collecte/collecte.py
Rattrapage ponctuel (archives depuis une date) :
             RATTRAPAGE_DEPUIS=2026-01-01 python collecte/collecte.py
Dépendances : requests, beautifulsoup4, openpyxl  (voir requirements.txt)
"""

import datetime as dt
import email.utils
import hashlib
import json
import os
import re
import sys
import threading
import unicodedata
import urllib.robotparser
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlparse, urlunparse

import openpyxl
import requests
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from traduction import Traducteur, extraire_acronymes, registre_acronymes  # noqa: E402
from pertinence import Pertinence  # noqa: E402
from amendes import detecter as detecter_amende  # noqa: E402
import echeances  # noqa: E402
import rkc  # noqa: E402

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(RACINE, "data")
AUJOURDHUI = dt.date.today()
MAINTENANT = dt.datetime.now(dt.timezone.utc)


def _date_rattrapage():
    v = (os.environ.get("RATTRAPAGE_DEPUIS") or "").strip()
    try:
        return dt.date.fromisoformat(v) if v else None
    except ValueError:
        print("RATTRAPAGE_DEPUIS invalide (%s) : ignoré" % v)
        return None


RATTRAPAGE = _date_rattrapage()


# --------------------------------------------------------------------------- utilitaires

def lire_json(chemin, defaut):
    try:
        with open(chemin, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return defaut


def ecrire_json_et_js(nom, donnees, variable):
    """Écrit data/<nom>.json (pour le script) et data/<nom>.js (pour le site,
    qui peut ainsi s'ouvrir aussi en double-cliquant sur index.html)."""
    os.makedirs(DATA, exist_ok=True)
    texte = json.dumps(donnees, ensure_ascii=False, indent=1)
    with open(os.path.join(DATA, nom + ".json"), "w", encoding="utf-8") as f:
        f.write(texte)
    if variable:
        with open(os.path.join(DATA, nom + ".js"), "w", encoding="utf-8") as f:
            f.write("window.%s = %s;\n" % (variable, texte))


def sans_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def nettoyer_texte(html_ou_texte, limite=None):
    if not html_ou_texte:
        return ""
    texte = BeautifulSoup(html_ou_texte, "html.parser").get_text(" ") if "<" in html_ou_texte else html_ou_texte
    texte = re.sub(r"\s+", " ", texte).strip()
    if limite and len(texte) > limite:
        texte = texte[:limite].rsplit(" ", 1)[0] + "…"
    return texte


def normaliser_lien(lien):
    p = urlparse(lien.strip())
    # on retire les paramètres de suivi (utm_…) et l'ancre
    requete = "&".join(x for x in p.query.split("&") if x and not x.lower().startswith(("utm_", "xtor", "at_")))
    return urlunparse((p.scheme.lower(), p.netloc.lower(), p.path.rstrip("/") or "/", "", requete, ""))


def identifiant(lien):
    return hashlib.sha1(normaliser_lien(lien).encode("utf-8")).hexdigest()[:12]


def domaine(url):
    net = urlparse(url).netloc.lower()
    return net[4:] if net.startswith("www.") else net


# --------------------------------------------------------------------------- dates

MOIS = {
    # français, anglais, allemand, espagnol, italien (formes courantes)
    "janvier": 1, "janv": 1, "january": 1, "jan": 1, "januar": 1, "enero": 1, "gennaio": 1,
    "fevrier": 2, "fevr": 2, "february": 2, "feb": 2, "februar": 2, "febrero": 2, "febbraio": 2,
    "mars": 3, "march": 3, "mar": 3, "marz": 3, "marzo": 3,
    "avril": 4, "april": 4, "apr": 4, "abril": 4, "aprile": 4,
    "mai": 5, "may": 5, "mayo": 5, "maggio": 5,
    "juin": 6, "june": 6, "jun": 6, "juni": 6, "junio": 6, "giugno": 6,
    "juillet": 7, "july": 7, "jul": 7, "juli": 7, "julio": 7, "luglio": 7,
    "aout": 8, "august": 8, "aug": 8, "agosto": 8,
    "septembre": 9, "september": 9, "sept": 9, "sep": 9, "septiembre": 9, "settembre": 9,
    "octobre": 10, "october": 10, "oct": 10, "oktober": 10, "octubre": 10, "ottobre": 10,
    "novembre": 11, "november": 11, "nov": 11, "noviembre": 11,
    "decembre": 12, "december": 12, "dec": 12, "dezember": 12, "diciembre": 12, "dicembre": 12,
    # suédois, danois, norvégien, portugais, polonais (génitif), tchèque (génitif)
    "januari": 1, "februari": 2, "marts": 3, "maj": 5, "augusti": 8, "desember": 12,
    "janeiro": 1, "fevereiro": 2, "marco": 3, "maio": 5, "junho": 6, "julho": 7, "setembro": 9,
    "outubro": 10, "dezembro": 12,
    "stycznia": 1, "lutego": 2, "marca": 3, "kwietnia": 4, "maja": 5, "czerwca": 6, "lipca": 7,
    "sierpnia": 8, "wrzesnia": 9, "pazdziernika": 10, "listopada": 11, "grudnia": 12,
    "ledna": 1, "unora": 2, "brezna": 3, "dubna": 4, "kvetna": 5, "cervna": 6, "cervence": 7,
    "srpna": 8, "zari": 9, "rijna": 10, "listopadu": 11, "prosince": 12,
}
RE_ISO = re.compile(r"\b(20\d\d)-(\d\d)-(\d\d)")
RE_NUM = re.compile(r"\b(\d{1,2})[./](\d{1,2})[./](20\d\d)\b")
RE_TXT = re.compile(r"\b(\d{1,2})(?:er|st|nd|rd|th)?\.?\s+(?:de\s+)?([^\W\d_]{3,12})\.?,?\s+(?:de\s+)?(20\d\d)\b")
RE_HU = re.compile(r"\b(20\d\d)\.\s?(\d{1,2})\.\s?(\d{1,2})\.")
RE_TXT_EN = re.compile(r"\b([A-Za-z]{3,10})\.?\s+(\d{1,2}),?\s+(20\d\d)\b")


def date_valide(a, m, j):
    try:
        d = dt.date(int(a), int(m), int(j))
    except ValueError:
        return None
    # on refuse les dates futures (> demain) et trop anciennes
    if d > AUJOURDHUI + dt.timedelta(days=1) or d.year < 2000:
        return None
    return d


def lire_date(texte):
    """Essaie de trouver une date dans un texte libre ou un attribut."""
    if not texte:
        return None
    texte = texte.strip()
    try:  # format RSS (RFC 822)
        return email.utils.parsedate_to_datetime(texte).date()
    except (TypeError, ValueError, IndexError):
        pass
    m = RE_ISO.search(texte)
    if m:
        return date_valide(*m.groups())
    m = RE_NUM.search(texte)
    if m:  # format européen jj/mm/aaaa
        return date_valide(m.group(3), m.group(2), m.group(1))
    m = RE_HU.search(texte)
    if m:  # format hongrois aaaa. mm. jj.
        return date_valide(*m.groups())
    m = RE_TXT.search(texte)
    if m:
        mois = MOIS.get(sans_accents(m.group(2)).lower().rstrip("."))
        if mois:
            return date_valide(m.group(3), mois, m.group(1))
    m = RE_TXT_EN.search(texte)
    if m:
        mois = MOIS.get(m.group(1).lower())
        if mois:
            return date_valide(m.group(3), mois, m.group(2))
    return None


# --------------------------------------------------------------------------- configuration

def charger_config():
    with open(os.path.join(RACINE, "config", "veille.json"), encoding="utf-8") as f:
        return json.load(f)


def cellule(v):
    return str(v).strip() if v is not None and str(v).strip() else ""


def charger_sources(cfg, classeur, avec_inactives=False):
    ws = classeur[cfg["onglet_sources"]]
    lignes = list(ws.iter_rows(values_only=True))
    entetes = [sans_accents(cellule(h)).lower() for h in lignes[0]]

    def col(*mots):
        for i, h in enumerate(entetes):
            if all(m in h for m in mots):
                return i
        return None

    c = {
        "zone": col("zone"), "nom": col("nom"), "type": col("type"), "url": col("url"),
        "rss": col("rss"), "xml": col("xml"), "statut": col("statut"),
        "actu": col("url", "actualit"), "filtrage": col("filtrage"),
    }
    ignores = {s.lower() for s in cfg.get("statuts_ignores", [])}
    sources, deja = [], set()
    for ligne in lignes[1:]:
        get = lambda k: cellule(ligne[c[k]]) if c[k] is not None and c[k] < len(ligne) else ""
        nom, url = get("nom"), get("url")
        if not nom or not url.startswith("http"):
            continue
        inactive = any(get("statut").lower().startswith(i) for i in ignores)
        cle = normaliser_lien(url)
        if cle in deja:
            continue
        deja.add(cle)
        # une cellule peut contenir plusieurs flux (séparés par un retour à la ligne, « ; » ou un espace)
        flux = [u for u in re.split(r"[\s;,]+", get("rss") + " " + get("xml")) if u.startswith("http")]
        # plusieurs pages d'actualités possibles (une par ligne dans la cellule)
        actus = [u for u in re.split(r"[\s;,]+", get("actu")) if u.startswith("http")]
        sources.append({
            "nom": nom, "zone": get("zone") or "—", "type": get("type"), "url": url,
            "urls_actu": list(dict.fromkeys(actus)), "flux_excel": list(dict.fromkeys(flux)), "statut_excel": get("statut"),
            "inactive": inactive, "origine": "excel",
            # source très volumineuse (journal officiel…) : on ne garde que la pertinence moyenne ou élevée
            "filtre_pertinence": "pertinence" in get("filtrage").lower(),
        })
    return appliquer_sources_manuelles(sources, deja, avec_inactives)


def appliquer_sources_manuelles(sources, deja, avec_inactives):
    """Ajouts et retraits faits depuis le site (config/sources_manuelles.json)."""
    manu = lire_json(os.path.join(RACINE, "config", "sources_manuelles.json"), {})
    retraits = {normaliser_lien(r["url"] if isinstance(r, dict) else r) for r in manu.get("retraits", [])}
    for s in manu.get("ajouts", []):
        url = (s.get("url") or "").strip()
        if not url.startswith("http") or normaliser_lien(url) in deja:
            continue
        deja.add(normaliser_lien(url))
        liste = lambda v: [u for u in (v if isinstance(v, list) else re.split(r"[\s;,]+", v or "")) if u.startswith("http")]
        sources.append({"nom": s.get("nom") or domaine(url), "zone": s.get("zone") or "—", "type": s.get("type", ""),
                        "url": url, "urls_actu": liste(s.get("pages")), "flux_excel": liste(s.get("flux")),
                        "statut_excel": "", "inactive": False, "origine": "site", "ajoute_le": s.get("ajoute_le", "")})
    for s in sources:
        if normaliser_lien(s["url"]) in retraits:
            s["inactive"], s["statut_excel"], s["retiree"] = True, "Retirée depuis le site", True
    return sources if avec_inactives else [s for s in sources if not s["inactive"]]


def variantes(terme):
    """'LIMS : Laboratory Information Management System' -> libellé 'LIMS' +
    variantes ['LIMS', 'Laboratory Information Management System']."""
    t = re.sub(r"\(.*?\)", "", terme).replace("\xa0", " ").strip()
    morceaux = [m.strip() for m in re.split(r"\s+:\s+|\s+/\s+|\s+-\s+", t) if len(m.strip()) >= 2]
    if not morceaux:
        return None, []
    return morceaux[0], morceaux


def charger_mots_cles(cfg, classeur):
    """Retourne une liste de (groupe, libellé, regex)."""
    groupes = {}
    ws = classeur[cfg["onglet_mots_cles"]]
    lignes = [l for l in ws.iter_rows(values_only=True) if any(cellule(v) for v in l)]
    entetes = lignes[0]  # première ligne non vide = noms des groupes
    for j, h in enumerate(entetes):
        g = cellule(h)
        if not g:
            continue
        for ligne in lignes[1:]:
            v = cellule(ligne[j]) if j < len(ligne) else ""
            if v:
                lib, vars_ = variantes(v)
                if lib:
                    groupes.setdefault(g, {}).setdefault(lib, []).extend(vars_)
    for g, d in cfg.get("mots_cles_supplementaires", {}).items():
        for lib, vars_ in d.items():
            groupes.setdefault(g, {}).setdefault(lib, []).extend(vars_)

    regles = []
    for g, d in groupes.items():
        for lib, vars_ in d.items():
            morceaux = []
            for v in dict.fromkeys(vars_):
                if len(v) <= 4 and v.isupper():
                    morceaux.append(r"(?-i:(?<![A-Za-z0-9])%s(?![A-Za-z0-9]))" % re.escape(v))
                else:
                    morceaux.append(r"(?<!\w)%s" % re.escape(sans_accents(v)).replace(r"\ ", r"[\s\-]+"))
            regles.append((g, lib, re.compile("|".join(morceaux), re.IGNORECASE)))
    return regles


def classer(texte, regles, cfg):
    """Retourne (rubrique, tags, groupes). Les mots-clés ne servent plus à
    écarter un article : ils justifient sa présence et orientent sa rubrique.
    rubrique vaut None si aucun mot-clé « fort » n'est présent (la rubrique
    est alors choisie par la note de pertinence)."""
    texte = sans_accents(texte)
    non_suff = set(cfg.get("groupes_non_suffisants", []))
    tags, groupes_forts, groupes = [], {}, []
    for g, lib, rx in regles:
        if rx.search(texte):
            if lib not in tags:
                tags.append(lib)
            if g not in groupes:
                groupes.append(g)
            if g not in non_suff:
                groupes_forts[g] = groupes_forts.get(g, 0) + 1
    # on retire les tags inclus dans un autre (« cyber resilience » ⊂ « Cyber Resilience Act »)
    bas = [t.lower() for t in tags]
    tags = [t for i, t in enumerate(tags) if not any(j != i and bas[i] in b for j, b in enumerate(bas))]
    if not groupes_forts:
        return None, tags[:8], groupes
    meilleure, score_max = None, 0
    for r in cfg["rubriques"]:
        score = sum(groupes_forts.get(g, 0) for g in r["groupes"])
        if score > score_max:
            meilleure, score_max = r["id"], score
    return meilleure or cfg["rubriques"][0]["id"], tags[:8], groupes


NATURE_OFFICIELLE = re.compile(
    r"(\.gouv\.fr|\.gov\.|\.gov$|europa\.eu|\.admin\.ch|\.gv\.at|\.bund\.de|bsi\.bund|cert-bund|"
    r"\.gov\.uk|gov\.pl|gov\.cz|gov\.gr|gov\.hu|cyber\.gov|cert\.|belgium\.be|legifrance|"
    r"assemblee-nationale|gazzettaufficiale|bundesnetzagentur|samsik\.dk|digst\.dk|mcf\.se|msb\.se|"
    r"imy\.se|nsm\.no|datatilsynet|garanteprivacy|aepd\.es|incibe|ccn-cert|cnpd\.pt|dpa\.gr|uodo|"
    r"arcep|anfr|cnil|ecb\.europa|ema\.europa|nki\.gov|kyberturvallisuuskeskus|lvm\.fi|"
    r"autoriteprotectiondonnees|ico\.org\.uk|sgdsn|uke\.gov|ncsc\.)"
)


def nature_source(src):
    t = sans_accents(src["type"]).lower()
    # « Avis d'experts (non certifié) » : section Débats et signaux, jamais mélangée à la veille
    if "avis" in t or "opinion" in t or "expert" in t:
        return "opinion"
    if "avocat" in t:
        return "cabinet"
    if "officiel" in t or "gouvernement" in t or NATURE_OFFICIELLE.search(domaine(src["url"])):
        return "officielle"
    return "presse"


# --------------------------------------------------------------------------- réseau

class Client:
    def __init__(self, cfg):
        self.s = requests.Session()
        self.s.headers.update({
            "User-Agent": cfg.get("user_agent", "CyberWatch/1.0"),
            "Accept-Language": "fr,en;q=0.8,*;q=0.5",
        })
        self.delai = cfg.get("delai_requete_secondes", 25)
        self.robots, self.verrou = {}, threading.Lock()

    def autorise(self, url):
        """Respecte le fichier robots.txt de chaque site (mis en cache par domaine)."""
        p = urlparse(url)
        base = "%s://%s" % (p.scheme, p.netloc)
        with self.verrou:
            rp = self.robots.get(base)
        if rp is None:
            rp = urllib.robotparser.RobotFileParser()
            try:
                r = self.s.get(base + "/robots.txt", timeout=10)
                rp.parse(r.text.splitlines() if r.status_code == 200 else [])
            except Exception:
                rp.parse([])
            with self.verrou:
                self.robots[base] = rp
        return rp.can_fetch(self.s.headers["User-Agent"], url)

    def get(self, url):
        if not self.autorise(url):
            raise PermissionError("interdit aux robots par le robots.txt du site")
        r = self.s.get(url, timeout=self.delai, allow_redirects=True)
        r.raise_for_status()
        return r


def est_flux(contenu):
    debut = contenu[:600].lower()
    return b"<rss" in debut or b"<feed" in debut or b"<rdf:rdf" in debut or b"<?xml" in debut and (
        b"<rss" in contenu[:3000].lower() or b"<feed" in contenu[:3000].lower() or b"rdf" in contenu[:3000].lower())


def local(tag):
    return tag.rsplit("}", 1)[-1].lower() if isinstance(tag, str) else ""


def lire_flux(contenu, url_flux):
    """Analyse un flux RSS 2.0, RSS 1.0 (RDF) ou Atom. Retourne une liste de dicts."""
    contenu = re.sub(rb"^[^<]*", b"", contenu, count=1)  # BOM ou espaces avant <?xml
    racine = ET.fromstring(contenu)
    articles = []
    for el in racine.iter():
        if local(el.tag) not in ("item", "entry"):
            continue
        a = {"titre": "", "lien": "", "resume": "", "date": None}
        for enfant in el:
            n = local(enfant.tag)
            txt = (enfant.text or "").strip()
            if n == "title":
                a["titre"] = nettoyer_texte(txt)
            elif n == "link":
                href = enfant.get("href")
                rel = enfant.get("rel", "alternate")
                if href and rel == "alternate":
                    a["lien"] = href
                elif txt and not a["lien"]:
                    a["lien"] = txt
            elif n in ("guid", "id") and not a["lien"] and txt.startswith("http"):
                a["lien"] = txt
            elif n in ("description", "summary") or (n in ("content", "encoded") and not a["resume"]):
                a["resume"] = nettoyer_texte(txt, 420)
            elif n in ("pubdate", "published", "date", "updated", "issued", "created") and not a["date"]:
                a["date"] = lire_date(txt)
        if a["titre"] and a["lien"]:
            a["lien"] = urljoin(url_flux, a["lien"])
            articles.append(a)
    return articles


CHEMINS_FLUX = ["feed", "rss", "rss.xml", "feed.xml", "atom.xml", "news.xml", "index.xml",
                "en/rss.xml", "fr/rss.xml", "rss/news", "news/rss", "feeds/news"]


def decouvrir_flux(client, url, html=None):
    """Cherche un flux RSS/Atom : balises <link rel=alternate> puis chemins usuels."""
    candidats = []
    if html is not None:
        soupe = BeautifulSoup(html, "html.parser")
        for l in soupe.find_all("link", href=True):
            typ = (l.get("type") or "").lower()
            if "rss" in typ or "atom" in typ:
                candidats.append(urljoin(url, l["href"]))
        for a in soupe.find_all("a", href=True):
            h = a["href"].lower()
            if re.search(r"(rss|atom|/feed)(\.xml|/|$|\?)", h) and not h.startswith("javascript"):
                candidats.append(urljoin(url, a["href"]))
    p = urlparse(url)
    base_page = url if url.endswith("/") else url.rsplit("/", 1)[0] + "/"
    base_site = "%s://%s/" % (p.scheme, p.netloc)
    for c in CHEMINS_FLUX:
        candidats.append(urljoin(base_site, c))
        if base_page != base_site:
            candidats.append(urljoin(base_page, c))
    essais = 0
    for c in dict.fromkeys(candidats):
        if essais >= 10:
            break
        essais += 1
        try:
            r = client.get(c)
            if est_flux(r.content) and lire_flux(r.content, c):
                return c
        except Exception:
            continue
    return None


MOTS_NAV = re.compile(
    r"(cookie|mentions l[ée]gales|confidentialit|privacy policy|accessibilit|plan du site|sitemap|"
    r"newsletter|contact|login|connexion|s'abonner|subscribe|linkedin|twitter|facebook|youtube|"
    r"instagram|mastodon|bluesky|recrutement|careers|jobs)", re.I)
EXT_IGNOREES = re.compile(r"\.(jpg|jpeg|png|gif|svg|webp|zip|mp4|mp3|css|js|ics)$", re.I)


def liens_page(html, url):
    """Extrait les liens « article » d'une page d'actualités + une date si elle est proche."""
    soupe = BeautifulSoup(html, "html.parser")
    for t in soupe(["script", "style", "noscript", "header", "footer", "nav", "form", "aside"]):
        t.decompose()
    dom = domaine(url)
    vus, resultat = set(), []
    for a in soupe.find_all("a", href=True):
        href = a["href"].strip()
        if href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        lien = urljoin(url, href)
        p = urlparse(lien)
        if not p.scheme.startswith("http") or dom not in p.netloc.lower():
            continue
        if p.path in ("", "/") or EXT_IGNOREES.search(p.path) or len(p.path.strip("/").split("/")) < 1:
            continue
        titre = nettoyer_texte(a.get_text(" "))
        if not titre:
            titre = nettoyer_texte(a.get("title", ""))
        if not (25 <= len(titre) <= 260) or MOTS_NAV.search(titre):
            continue
        cle = normaliser_lien(lien)
        if cle in vus or cle == normaliser_lien(url):
            continue
        vus.add(cle)
        # date : <time> ou motif de date dans le bloc parent (3 niveaux max)
        date, resume, bloc = None, "", a
        for _ in range(3):
            bloc = bloc.parent
            # on s'arrête si le bloc contient d'autres articles (sinon on
            # attribuerait à ce lien la date ou le texte d'un voisin)
            if bloc is None or len(bloc.find_all("a", href=True)) > 1:
                break
            t = bloc.find("time")
            if t is not None:
                date = lire_date(t.get("datetime") or t.get_text(" "))
            if not date:
                date = lire_date(bloc.get_text(" ")[:400])
            if date:
                txt = nettoyer_texte(bloc.get_text(" "))
                if len(txt) > len(titre) + 30:
                    resume = nettoyer_texte(txt.replace(titre, "", 1), 300)
                break
        resultat.append({"titre": titre, "lien": lien, "resume": resume, "date": date})
    return resultat


# --------------------------------------------------------------------------- rattrapage (archives)

MOTS_SUIVANT = re.compile(
    r"^\s*(suivant(e)?|page suivante|next( page)?|older( posts| entries)?|weiter|nächste( seite)?|siguiente|"
    r"successiv[oa]|avanti|volgende|nästa|neste|næste|seuraava|próxima|seguinte|następna|další|következő|"
    r"επόμενη|›|»|→|>)\s*$", re.I)


def page_suivante(html, url, rang):
    """Lien vers la page d'archives suivante (pagination) ou None."""
    soupe = BeautifulSoup(html, "html.parser")
    lien = soupe.find(["link", "a"], rel=lambda r: r and "next" in (r if isinstance(r, list) else [r]))
    if lien and lien.get("href"):
        return urljoin(url, lien["href"])
    for a in soupe.find_all("a", href=True):
        txt = nettoyer_texte(a.get_text(" ")) or a.get("aria-label", "") or a.get("title", "")
        if MOTS_SUIVANT.match(txt) or re.search(r"(next|suivant|weiter|siguiente)", a.get("aria-label", ""), re.I):
            h = urljoin(url, a["href"])
            if h != url and domaine(h) == domaine(url):
                return h
    # motif « page=N » ou « /page/N/ »
    for a in soupe.find_all("a", href=True):
        h = urljoin(url, a["href"])
        if re.search(r"([?&](page|p|pg|seite|pagina)=%d\b|/page/%d/?$)" % (rang + 1, rang + 1), h):
            return h
    return None


def paginer(client, url, premiere, erreurs, max_pages):
    """Mode rattrapage : parcourt les pages d'archives tant qu'elles contiennent
    des articles postérieurs à RATTRAPAGE_DEPUIS."""
    arts, html, courant = [], premiere, url
    for rang in range(1, max_pages):
        suiv = page_suivante(html, courant, rang)
        if not suiv:
            break
        try:
            r = client.get(suiv)
        except Exception as e:
            erreurs.append("Archives %s : %s" % (suiv, str(e)[:80]))
            break
        trouves = liens_page(r.content, r.url)
        dates = [a["date"] for a in trouves if a["date"]]
        arts.extend(trouves)
        if not trouves or (dates and max(dates) < RATTRAPAGE):
            break
        html, courant = r.content, r.url
    return arts


def flux_archives(client, f, deja, max_pages):
    """Mode rattrapage pour un flux WordPress (?paged=2, 3…)."""
    arts = []
    for n in range(2, max_pages + 1):
        u = f + ("&" if "?" in f else "?") + "paged=%d" % n
        try:
            lot = lire_flux(client.get(u).content, u)
        except Exception:
            break
        nouveaux = [a for a in lot if a["lien"] not in deja]
        if not nouveaux:
            break
        deja.update(a["lien"] for a in nouveaux)
        arts.extend(nouveaux)
        dates = [a["date"] for a in nouveaux if a["date"]]
        if dates and max(dates) < RATTRAPAGE:
            break
    return arts


# --------------------------------------------------------------------------- collecte d'une source

def collecter_source(src, client, etat_prec, max_pages=15):
    """Retourne (articles bruts, état de la source)."""
    etat = {
        "nom": src["nom"], "zone": src["zone"], "url": src["url"], "mode": "", "flux": "",
        "nb_trouves": 0, "erreur": "", "verifie_le": MAINTENANT.strftime("%Y-%m-%d %H:%M"),
    }
    # 1. flux RSS indiqués dans l'Excel (tous sont lus)
    arts, flux_lus, pages_lues, erreurs = [], [], [], []
    for f in src["flux_excel"]:
        try:
            lot = lire_flux(client.get(f).content, f)
            arts.extend(lot)
            flux_lus.append(f)
            dates = [a["date"] for a in lot if a["date"]]
            if RATTRAPAGE and dates and min(dates) > RATTRAPAGE:
                arts.extend(flux_archives(client, f, {a["lien"] for a in lot}, max_pages))
        except Exception as e:
            erreurs.append("Flux %s illisible : %s" % (f, str(e)[:100]))

    # 2. pages d'actualités de la colonne R : toujours surveillées, en plus des flux
    #    (une source peut avoir un flux « communiqués » et des pages « publications »,
    #    « consultations », « lignes directrices »… sans flux)
    for u in src.get("urls_actu", []):
        try:
            r = client.get(u)
        except Exception as e:
            erreurs.append("Page %s inaccessible : %s" % (u, str(e)[:100]))
            continue
        trouves = lire_flux(r.content, u) if est_flux(r.content) else liens_page(r.content, r.url)
        if not trouves:
            erreurs.append("Aucun lien d'article détecté sur %s (page probablement chargée en JavaScript)" % u)
        elif RATTRAPAGE and not est_flux(r.content):
            trouves += paginer(client, r.url, r.content, erreurs, max_pages)
        arts.extend(trouves)
        pages_lues.append(u)

    # 3. ni flux ni page d'actualités exploitables : URL principale
    #    (flux découvert automatiquement, sinon surveillance de la page)
    if not flux_lus and not pages_lues:
        auto = etat_prec.get("flux") if etat_prec.get("mode") == "rss-auto" else ""
        try:
            if auto:
                a2 = lire_flux(client.get(auto).content, auto)
                etat.update(mode="rss-auto", flux=auto, nb_trouves=len(a2), erreur=" ; ".join(erreurs))
                return a2, etat
        except Exception:
            pass
        try:
            r = client.get(src["url"])
        except Exception as e:
            erreurs.append("Page %s inaccessible : %s" % (src["url"], str(e)[:100]))
            etat.update(mode="erreur", erreur=" ; ".join(erreurs))
            return [], etat
        if est_flux(r.content):
            arts = lire_flux(r.content, src["url"])
            flux_lus.append(src["url"])
        else:
            f = decouvrir_flux(client, r.url, r.content)
            if f:
                try:
                    a2 = lire_flux(client.get(f).content, f)
                    etat.update(mode="rss-auto", flux=f, nb_trouves=len(a2), erreur=" ; ".join(erreurs))
                    return a2, etat
                except Exception:
                    pass
            arts = liens_page(r.content, r.url)
            if not arts:
                erreurs.append("Aucun lien d'article détecté sur %s (page probablement chargée en JavaScript)" % src["url"])
            elif RATTRAPAGE:
                arts += paginer(client, r.url, r.content, erreurs, max_pages)
            pages_lues.append(src["url"])

    mode = "rss+page" if flux_lus and pages_lues else ("rss" if flux_lus else "page")
    etat.update(mode=mode, flux=" ; ".join(flux_lus), page=" ; ".join(pages_lues),
                nb_trouves=len(arts), erreur=" ; ".join(erreurs))
    return arts, etat



# --------------------------------------------------------------------------- Légifrance (API PISTE)

PISTE = {
    "sandbox": ("https://sandbox-oauth.piste.gouv.fr/api/oauth/token",
                "https://sandbox-api.piste.gouv.fr/dila/legifrance/lf-engine-app"),
    "production": ("https://oauth.piste.gouv.fr/api/oauth/token",
                   "https://api.piste.gouv.fr/dila/legifrance/lf-engine-app"),
}


def _date_legifrance(v):
    """Les dates de l'API arrivent en millisecondes (epoch) ou en texte ISO."""
    if isinstance(v, (int, float)) and v > 0:
        return dt.datetime.fromtimestamp(v / 1000, dt.timezone.utc).date()
    if isinstance(v, str):
        return lire_date(v)
    return None


def collecter_legifrance(src, cfg, client):
    """Interroge le Journal officiel (fonds JORF) via l'API Légifrance de PISTE.
    Identifiants lus dans les variables d'environnement (secrets GitHub) :
    LEGIFRANCE_CLIENT_ID, LEGIFRANCE_CLIENT_SECRET, LEGIFRANCE_ENV (sandbox|production)."""
    etat = {"nom": src["nom"], "zone": src["zone"], "url": src["url"], "mode": "api", "flux": "",
            "nb_trouves": 0, "erreur": "", "verifie_le": MAINTENANT.strftime("%Y-%m-%d %H:%M")}
    cid, secret = os.environ.get("LEGIFRANCE_CLIENT_ID"), os.environ.get("LEGIFRANCE_CLIENT_SECRET")
    if not cid or not secret:
        etat.update(mode="erreur", erreur="API Légifrance non configurée : ajoutez les secrets "
                    "LEGIFRANCE_CLIENT_ID et LEGIFRANCE_CLIENT_SECRET dans GitHub (voir README).")
        return [], etat
    conf = cfg.get("legifrance", {})
    env = (os.environ.get("LEGIFRANCE_ENV") or conf.get("environnement") or "sandbox").lower()
    url_token, url_api = PISTE.get(env, PISTE["sandbox"])
    try:
        r = client.s.post(url_token, data={"grant_type": "client_credentials", "client_id": cid,
                                           "client_secret": secret, "scope": "openid"}, timeout=client.delai)
        r.raise_for_status()
        jeton = r.json()["access_token"]
    except Exception as e:
        etat.update(mode="erreur", erreur="Authentification PISTE refusée (%s) : vérifiez que l'application "
                    "est bien abonnée à l'API Légifrance et l'environnement (%s)." % (str(e)[:120], env))
        return [], etat
    entetes = {"Authorization": "Bearer " + jeton, "Content-Type": "application/json", "Accept": "application/json"}
    debut = (AUJOURDHUI - dt.timedelta(days=conf.get("jours", 30))).isoformat()
    arts, erreurs = [], []
    for mot in conf.get("mots_cles", []):
        corps = {"fond": "JORF", "recherche": {
            "champs": [{"typeChamp": "ALL", "operateur": "ET",
                        "criteres": [{"typeRecherche": "EXACTE", "valeur": mot, "operateur": "ET"}]}],
            "filtres": [{"facette": "DATE_PUBLICATION", "dates": {"start": debut, "end": AUJOURDHUI.isoformat()}}],
            "pageNumber": 1, "pageSize": 50, "operateur": "ET",
            "sort": "PUBLICATION_DATE_DESC", "typePagination": "DEFAUT"}}
        try:
            r = client.s.post(url_api + "/search", json=corps, headers=entetes, timeout=client.delai)
            r.raise_for_status()
            resultats = r.json().get("results", [])
        except Exception as e:
            erreurs.append("Recherche « %s » : %s" % (mot, str(e)[:100]))
            continue
        for res in resultats:
            titres = res.get("titles") or [{}]
            t = titres[0]
            ident = t.get("id") or t.get("cid") or res.get("id")
            if not ident:
                continue
            date = None
            for cle in ("datePublication", "date", "dateTexte", "dateSignature"):
                date = _date_legifrance(res.get(cle)) or date
                if date:
                    break
            arts.append({"titre": nettoyer_texte(t.get("title") or res.get("title") or ident),
                         "lien": "https://www.legifrance.gouv.fr/jorf/id/%s" % ident,
                         "resume": "Journal officiel — %s (recherche : %s)" % (res.get("nature") or "texte", mot),
                         "date": date})
    etat.update(nb_trouves=len(arts), flux="API Légifrance (%s)" % env, erreur=" ; ".join(erreurs))
    if erreurs and not arts:
        etat["mode"] = "erreur"
    return arts, etat

def niveau_acces(etat):
    """ok : tout a été lu ; partielle : lue mais au moins une page ou un flux en échec ;
    ko : rien n'a pu être lu ; non_configuree : API sans identifiants."""
    if etat["mode"] == "erreur":
        return "non_configuree" if "non configurée" in etat.get("erreur", "") else "ko"
    return "partielle" if etat.get("erreur") else "ok"


def traduire_syntheses(trad):
    """Traduit en anglais les analyses rédigées (data/syntheses.js) -> data/syntheses_en.js.
    Les éléments pas encore traduits (budget atteint) restent en français et
    seront complétés à la collecte suivante."""
    chemin = os.path.join(DATA, "syntheses.js")
    if not trad.actif or "en" not in trad.cibles or not os.path.exists(chemin):
        return
    texte = open(chemin, encoding="utf-8").read()
    debut = texte.index("{")
    source = json.loads(texte[debut:texte.rindex("}") + 1])
    t = lambda x: (trad.traduire(x, "fr", "en") or x) if x else x
    en = {"titre": t(source.get("titre")), "chapeau": t(source.get("chapeau")), "groupes": [], "glossaire": []}
    for g in source.get("groupes", []):
        eg = {"titre": t(g["titre"]), "fiches": []}
        for f in g.get("fiches", []):
            eg["fiches"].append(dict(f, titre=t(f["titre"]), accroche=t(f.get("accroche")),
                                     paragraphes=[t(p) for p in f.get("paragraphes", [])],
                                     sources=[dict(x, libelle=t(x.get("libelle"))) for x in f.get("sources", [])]))
        en["groupes"].append(eg)
    en["glossaire"] = [{"terme": x["terme"], "definition": t(x["definition"])} for x in source.get("glossaire", [])]
    with open(os.path.join(DATA, "syntheses_en.js"), "w", encoding="utf-8") as f:
        f.write("/* Traduction automatique de syntheses.js — régénérée à chaque collecte. */\n")
        f.write("window.VEILLE_SYNTHESES_EN = %s;\n" % json.dumps(en, ensure_ascii=False, indent=1))


# --------------------------------------------------------------------------- fond de carte

def telecharger_carte():
    """Contours des pays (données libres Natural Earth via world-atlas), téléchargés
    une seule fois puis gardés dans data/monde.js pour que le site fonctionne hors ligne."""
    chemin = os.path.join(DATA, "monde.js")
    if os.path.exists(chemin):
        return
    for url in ("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json",
                "https://unpkg.com/world-atlas@2/countries-50m.json"):
        try:
            r = requests.get(url, timeout=60)
            r.raise_for_status()
            json.loads(r.text)
            with open(chemin, "w", encoding="utf-8") as f:
                f.write("window.VEILLE_MONDE = %s;\n" % r.text)
            print("Fond de carte téléchargé (%d Ko)." % (len(r.text) // 1024))
            return
        except Exception as e:
            print("Fond de carte indisponible depuis %s : %s" % (url, str(e)[:80]))


# --------------------------------------------------------------------------- base de connaissance

def charger_base(ids_existants):
    """Éléments de config/base_connaissance.json -> articles du site.
    Rédigés en français et en anglais ; jamais supprimés par la collecte."""
    base = lire_json(os.path.join(RACINE, "config", "base_connaissance.json"), {})
    jour = base.get("constituee_le") or AUJOURDHUI.isoformat()
    sortie = []
    for e in base.get("elements", []):
        if not e.get("lien") or not e.get("titre_fr"):
            continue
        ident = "b" + hashlib.sha1((e["lien"] + "|" + e["titre_fr"]).encode("utf-8")).hexdigest()[:11]
        amende = e.get("amende")
        if amende and amende.get("montant_eur") is not None:
            amende = {"montant_eur": amende["montant_eur"], "texte": amende.get("texte", ""),
                      "plafond": bool(re.search(r"jusqu|up to|max", amende.get("texte", ""), re.I))}
        else:
            amende = None
        sortie.append({
            "id": ident, "base": True, "titre": e["titre_fr"], "resume": e.get("resume_fr", ""), "langue": "fr",
            "trad": {"en": {"titre": e.get("titre_en") or e["titre_fr"], "resume": e.get("resume_en", "")}},
            "lien": e["lien"], "date": e["date"], "date_estimee": bool(e.get("date_approx")),
            "detecte_le": jour, "version": "base", "source": e.get("source", ""), "zone": e.get("zone", "Europe"),
            "nature": e.get("nature", "presse"), "rubrique": e.get("rubrique", "reglementation"),
            "statut": e.get("statut", ""), "tags": e.get("textes", [])[:8], "amende": amende,
            "pertinence": e.get("pertinence", "moyenne"), "themes": [],
            "pourquoi": {"fr": e.get("pourquoi_fr", ""), "en": e.get("pourquoi_en", "")},
        })
    return sortie


# --------------------------------------------------------------------------- programme principal

def main():
    cfg = charger_config()
    classeur = openpyxl.load_workbook(os.path.join(RACINE, cfg["fichier_sources"]), read_only=True, data_only=True)
    toutes = charger_sources(cfg, classeur, avec_inactives=True)
    sources = [x for x in toutes if not x["inactive"]]
    regles = charger_mots_cles(cfg, classeur)
    print("%d sources, %d mots-clés%s" % (len(sources), len(regles),
          (" — RATTRAPAGE depuis le %s" % RATTRAPAGE) if RATTRAPAGE else ""))

    ancien = lire_json(os.path.join(DATA, "actualites.json"), {})
    articles = {a["id"]: a for a in ancien.get("articles", []) if not a.get("base")}
    # Débats et signaux (avis d'experts) : stockés à part, jamais mélangés à la veille certifiée
    debats = {a["id"]: a for a in lire_json(os.path.join(DATA, "debats.json"), {}).get("articles", [])}
    etats_prec = {e["url"]: e for e in lire_json(os.path.join(DATA, "etat_sources.json"), {}).get("sources", [])}
    vus = lire_json(os.path.join(DATA, "vus.json"), {})
    versions = lire_json(os.path.join(DATA, "versions.json"), {}).get("versions", [])
    id_version = MAINTENANT.strftime("%Y-%m-%d-%H%M")
    if any(v.get("id") == id_version for v in versions):
        id_version = MAINTENANT.strftime("%Y-%m-%d-%H%M%S")

    client = Client(cfg)
    max_pages = cfg.get("rattrapage_pages_max", 15)
    with ThreadPoolExecutor(max_workers=cfg.get("requetes_paralleles", 8)) as pool:
        resultats = list(pool.map(lambda s: (s, *(
            collecter_legifrance(s, cfg, client) if "legifrance.gouv.fr" in s["url"]
            else collecter_source(s, client, etats_prec.get(s["url"], {}), max_pages))), sources))

    conservation = cfg.get("jours_conservation", 730)
    limite_premiere = RATTRAPAGE or (AUJOURDHUI - dt.timedelta(days=cfg.get("jours_premiere_collecte", 60)))
    plancher = dt.date.fromisoformat(cfg.get("date_debut_veille", "2026-01-01"))
    etats, nouveaux_ids = [], []
    for src, arts, etat in resultats:
        cle_src = normaliser_lien(src["url"])
        premiere_fois = cle_src not in vus
        deja_vus = set(vus.get(cle_src, []))
        retenus = 0
        for a in arts:
            ident = identifiant(a["lien"])
            nouveau_lien = ident not in deja_vus
            deja_vus.add(ident)
            if ident in articles or ident in debats:
                continue
            # Première visite (ou rattrapage) : on ne reprend que le daté postérieur à
            # la date limite, pour ne pas présenter d'anciens articles comme neufs.
            if (premiere_fois or RATTRAPAGE) and (not a["date"] or a["date"] < limite_premiere):
                if not (RATTRAPAGE and nouveau_lien and not premiere_fois and not a["date"]):
                    continue
            if not premiere_fois and not nouveau_lien and (not a["date"] or a["date"] < limite_premiere):
                continue  # lien déjà vu lors d'une collecte précédente et trop ancien : pas une nouveauté
            if a["date"] and a["date"] < plancher:
                continue  # antérieur au début de la base de connaissance
            if a["date"] and a["date"] < AUJOURDHUI - dt.timedelta(days=conservation):
                continue
            texte = a["titre"] + " " + a["resume"]
            rubrique, tags, groupes = classer(texte, regles, cfg)
            # Aucun article n'est écarté pour absence de mot-clé. Seule exception :
            # un lien SANS date et SANS aucun mot-clé trouvé sur une page web est
            # le plus souvent un lien de menu (« Nos services »…) et non un article.
            if not a["date"] and not groupes and not etat.get("mode", "").startswith("rss") and etat.get("mode") != "api":
                continue
            cible = debats if nature_source(src) == "opinion" else articles
            cible[ident] = {
                "id": ident,
                "titre": a["titre"],
                "lien": a["lien"],
                "resume": a["resume"],
                "date": (a["date"] or AUJOURDHUI).isoformat(),
                "date_estimee": a["date"] is None,
                "detecte_le": AUJOURDHUI.isoformat(),
                "version": id_version,
                "source": src["nom"],
                "zone": src["zone"],
                "nature": nature_source(src),
                "rubrique": rubrique or "autres",
                "rubrique_mots_cles": bool(rubrique),
                "tags": tags,
                "groupes": groupes,
                "amende": detecter_amende(texte, src["zone"]),
            }
            if src.get("filtre_pertinence"):
                cible[ident]["filtre_pertinence"] = True
            if cible is articles:
                nouveaux_ids.append(ident)
            retenus += 1
        vus[cle_src] = sorted(deja_vus)[-5000:]
        etat["nb_retenus"] = retenus
        etat.update(acces=niveau_acces(etat), type=src["type"], nature=nature_source(src),
                    nb_pages=len(src["urls_actu"]), nb_flux=len(src["flux_excel"]), origine=src.get("origine", "excel"),
                    pages=src["urls_actu"], flux_liste=src["flux_excel"])
        etats.append(etat)
        print("  %-9s %3d trouvés  %3d retenus  %s%s" % (
            etat["mode"], etat["nb_trouves"], retenus, src["nom"][:60],
            ("  ! " + etat["erreur"]) if etat["erreur"] else ""))

    # Sources inactives (Excel) ou retirées depuis le site : listées mais non interrogées
    for src in toutes:
        if src["inactive"]:
            msg = ("Retirée depuis le site : plus interrogée." if src.get("retiree")
                   else "Statut « %s » dans l'Excel : source non interrogée." % src["statut_excel"])
            etats.append({"nom": src["nom"], "zone": src["zone"], "url": src["url"], "mode": "inactif",
                          "acces": "retiree" if src.get("retiree") else "inactive", "flux": "", "page": "",
                          "nb_trouves": 0, "nb_retenus": 0, "erreur": msg, "type": src["type"],
                          "nature": nature_source(src), "verifie_le": "", "origine": src.get("origine", "excel")})

    # Veilles RKC (dépôt privé récupéré dans rkc/) : titre + lien publiés, texte gardé privé
    arts_rkc, rapport_rkc = rkc.lire_rkc(os.path.join(RACINE, "rkc"), AUJOURDHUI)
    n_rkc = 0
    for r in arts_rkc:
        ident = identifiant(r["lien"]) if r["lien"] else "r" + hashlib.sha1(r["titre"].encode("utf-8")).hexdigest()[:11]
        if ident in articles or r["date"] < plancher:
            continue
        texte_prive = r["titre"] + ". " + r["texte"]
        rubrique, tags, groupes = classer(texte_prive, regles, cfg)
        articles[ident] = {
            "id": ident, "titre": r["titre"], "lien": r["lien"], "resume": "", "reserve": True,
            "payant": r["payant"], "date": r["date"].isoformat(), "date_estimee": False,
            "detecte_le": AUJOURDHUI.isoformat(), "version": id_version,
            "source": "Veille RKC (Wavestone)", "zone": r["zone"], "nature": "rkc",
            "rubrique": rubrique or "autres", "rubrique_mots_cles": bool(rubrique), "tags": tags, "groupes": groupes,
            "amende": detecter_amende(texte_prive, r["zone"]),
            "echeances": [dict(e, extrait={}) for e in echeances.extraire({"fr": texte_prive}, r["date"], AUJOURDHUI)],
            "_texte": texte_prive,  # privé : sert à la note de pertinence, retiré avant l'écriture
        }
        nouveaux_ids.append(ident)
        n_rkc += 1
    if rapport_rkc["fichiers"]:
        print("Veille RKC : %d fichiers (%d mails, %d Word), %d nouveaux articles%s" % (
            rapport_rkc["fichiers"], rapport_rkc["mails"], rapport_rkc["word"], n_rkc,
            (" — erreurs : " + " ; ".join(rapport_rkc["erreurs"])) if rapport_rkc["erreurs"] else ""))
        etats.append({"nom": "Veille RKC (Wavestone) — dépôt privé", "zone": "Europe", "url": "", "mode": "rkc",
                      "acces": "partielle" if rapport_rkc["erreurs"] else "ok", "flux": "", "page": "",
                      "nb_trouves": len(arts_rkc), "nb_retenus": n_rkc, "erreur": " ; ".join(rapport_rkc["erreurs"]),
                      "type": "Veille interne", "nature": "rkc", "verifie_le": MAINTENANT.strftime("%Y-%m-%d %H:%M"),
                      "origine": "rkc"})

    # Base de connaissance (jamais purgée) + nettoyage des articles collectés
    base = charger_base(articles)
    liens_base = {normaliser_lien(b["lien"]) for b in base}
    seuil = (AUJOURDHUI - dt.timedelta(days=conservation)).isoformat()
    collectes = [a for a in articles.values() if a["date"] >= seuil and normaliser_lien(a["lien"]) not in liens_base]
    collectes = sorted(collectes, key=lambda a: (a["date"], a["detecte_le"]), reverse=True)[:cfg.get("nb_max_articles", 5000)]
    for a in collectes:  # articles déjà présents avant cette version du script
        a.setdefault("rubrique_mots_cles", a.get("rubrique") not in (None, "autres"))
        a.setdefault("version", "")
        if "amende" not in a:
            a["amende"] = detecter_amende(a["titre"] + " " + a.get("resume", ""), a.get("zone", ""))
    liste = sorted(collectes + base, key=lambda a: (a["date"], a["detecte_le"]), reverse=True)

    depot = os.environ.get("GITHUB_REPOSITORY")
    serveur = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
    meta = {
        "titre": cfg["titre"], "surtitre": cfg.get("surtitre", ""), "sous_titre": cfg.get("sous_titre", ""),
        "mise_a_jour": MAINTENANT.isoformat(timespec="minutes"),
        "version": id_version,
        "nb_sources": len(sources),
        "nb_nouveaux": len(nouveaux_ids),
        "url_lancer_maj": ("%s/%s/actions/workflows/veille.yml" % (serveur, depot)) if depot else cfg.get("url_lancer_maj", ""),
        "depot": depot or cfg.get("depot_github", ""),
        "branche": os.environ.get("BRANCHE_VEILLE") or cfg.get("branche_github", "main"),
        "serveur": serveur,
    }
    # Traduction (gratuite, open source) des titres et résumés, puis des analyses rédigées
    trad = Traducteur(cfg)
    for a in liste:
        trad.traduire_article(a)
    traduire_syntheses(trad)
    trad.enregistrer()
    en_attente = sum(1 for a in liste if trad.actif and any(
        c != a.get("langue") and c not in (a.get("trad") or {}) for c in trad.cibles))
    meta["traduction"] = {"active": trad.actif, "moteur": bool(trad.moteur), "faites": trad.faits,
                          "en_attente": en_attente, "erreur": trad.erreur}
    print("Traduction : %d segments traduits, %d articles en attente%s" % (
        trad.faits, en_attente, (" — " + trad.erreur) if trad.erreur else ""))

    # Pertinence (après traduction : le modèle lit aussi le titre anglais)
    pert = Pertinence(cfg)
    liste_debats = sorted((a for a in debats.values() if a["date"] >= seuil), key=lambda a: a["date"], reverse=True)[:2000]
    for a in liste_debats:
        trad.traduire_article(a)
    pert.noter(liste_debats)
    liste_debats = [a for a in liste_debats if not (a.get("filtre_pertinence") and a.get("pertinence") == "faible")]
    n = pert.noter(liste)
    # Sources très volumineuses (journal officiel…) : seuls les textes jugés pertinents sont gardés
    avant = len(liste)
    liste = [a for a in liste if not (a.get("filtre_pertinence") and a.get("pertinence") == "faible"
                                      and not a.get("rubrique_mots_cles"))]
    if avant != len(liste):
        gardes = {a["id"] for a in liste}
        nouveaux_ids = [i for i in nouveaux_ids if i in gardes]
        meta["nb_nouveaux"] = len(nouveaux_ids)
        print("Sources volumineuses : %d textes de faible pertinence écartés." % (avant - len(liste)))
    print("Pertinence : %d articles notés (mode %s)%s" % (n, pert.mode, (" — " + pert.erreur) if pert.erreur else ""))
    meta["pertinence"] = {"mode": pert.mode, "erreur": pert.erreur, "themes": pert.libelles(),
                          "seuils": {k: v for k, v in pert.seuils.items() if not k.startswith("_")}}

    rubriques = [dict(r) for r in cfg["rubriques"]]
    if not any(r["id"] == "autres" for r in rubriques):
        rubriques.append({"id": "autres", "titre": "Autres actualités à surveiller",
                          "titre_en": "Other news to monitor",
                          "chapeau": "Articles sans lien évident avec les thèmes prioritaires : gardés pour ne rien manquer.",
                          "chapeau_en": "Articles with no obvious link to the priority themes: kept so that nothing is missed."})
    meta["rubriques"] = [{k: r.get(k, "") for k in ("id", "titre", "chapeau", "titre_en", "chapeau_en")} for r in rubriques]
    meta["libelles_en"] = cfg.get("libelles_en", {})
    meta["sous_titre_en"] = cfg.get("sous_titre_en", "")
    meta["surtitre_en"] = cfg.get("surtitre_en", "")

    # Dates clés (échéances) citées dans les textes : pour l'onglet « L'essentiel »
    for a in liste + liste_debats:
        if a.get("nature") == "rkc":
            continue  # calculées une fois à partir du texte privé
        textes = {a.get("langue") or "fr": a["titre"] + ". " + (a.get("resume") or "")}
        for lg, tr in (a.get("trad") or {}).items():
            textes[lg] = (tr.get("titre") or "") + ". " + (tr.get("resume") or "")
        try:
            d_art = dt.date.fromisoformat(a["date"])
        except ValueError:
            d_art = None
        a["echeances"] = echeances.extraire(textes, d_art, AUJOURDHUI)
    for a in liste + liste_debats:
        a.pop("_texte", None)

    # Acronymes : forme canonique par article (pour le filtre du site) + registre global
    for a in liste + liste_debats:
        a["acronymes"] = [code for code, _ in extraire_acronymes(a["titre"] + " " + a.get("resume", ""), trad.glossaire)]
    precedent = lire_json(os.path.join(DATA, "acronymes.json"), {})
    registre = registre_acronymes(liste, trad.glossaire, precedent, AUJOURDHUI.isoformat())

    # Historique des versions : une entrée par collecte
    actives = [e for e in etats if e["acces"] not in ("inactive", "retiree")]
    versions.append({
        "id": id_version, "date": meta["mise_a_jour"], "nb_total": len(liste), "nb_nouveaux": len(nouveaux_ids),
        "nouveaux": nouveaux_ids, "rattrapage": RATTRAPAGE.isoformat() if RATTRAPAGE else "",
        "sources_lues": sum(1 for e in actives if e["acces"] in ("ok", "partielle")), "sources_actives": len(actives),
        "declenchement": os.environ.get("GITHUB_EVENT_NAME", "local"),
    })
    meta["nb_versions"] = len(versions)

    ecrire_json_et_js("acronymes", {"mise_a_jour": meta["mise_a_jour"], "glossaire": trad.glossaire,
                                    "acronymes": registre}, "VEILLE_ACRONYMES")
    ecrire_json_et_js("actualites", {"meta": meta, "articles": liste}, "VEILLE_ACTUALITES")
    ecrire_json_et_js("etat_sources", {"mise_a_jour": meta["mise_a_jour"], "jours_premiere_collecte": cfg.get("jours_premiere_collecte", 60),
                                       "jours_conservation": conservation, "sources": etats}, "VEILLE_ETAT_SOURCES")
    ecrire_json_et_js("versions", {"versions": versions}, "VEILLE_VERSIONS")
    ecrire_json_et_js("debats", {"mise_a_jour": meta["mise_a_jour"], "articles": liste_debats}, "VEILLE_DEBATS")
    telecharger_carte()
    # Référentiel des textes applicables (config/referentiel.json, modifiable à la main) -> site
    ref = lire_json(os.path.join(RACINE, "config", "referentiel.json"), {})
    if ref:
        with open(os.path.join(DATA, "referentiel.js"), "w", encoding="utf-8") as f:
            f.write("window.VEILLE_REFERENTIEL = %s;\n" % json.dumps(ref, ensure_ascii=False))
    ecrire_json_et_js("vus", vus, None)
    with open(os.path.join(DATA, "version_courante.txt"), "w") as f:
        f.write(id_version)
    print("\n%d nouveaux articles — %d au total (dont %d de la base de connaissance)." % (len(nouveaux_ids), len(liste), len(base)))
    print("%d/%d sources actives lues (%d partiellement)." % (
        sum(1 for e in actives if e["acces"] in ("ok", "partielle")), len(actives),
        sum(1 for e in actives if e["acces"] == "partielle")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
