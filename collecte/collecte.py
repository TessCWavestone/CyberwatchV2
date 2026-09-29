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
import dila  # noqa: E402

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
    # Seul le type exact « Avis d'experts (non certifié) » va dans l'onglet Débats et signaux
    # (auparavant « Experts officiels » — MDCG — y partait par erreur)
    if "avis d'expert" in t or "non certifie" in t or t.startswith("opinion"):
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
    try:
        racine = ET.fromstring(contenu)
    except ET.ParseError:
        # flux mal formé (« & » non échappé, caractères de contrôle) : on le répare puis on réessaie
        repare = re.sub(rb"&(?!#?\w+;)", b"&amp;", contenu)
        repare = re.sub(rb"[\x00-\x08\x0b\x0c\x0e-\x1f]", b"", repare)
        racine = ET.fromstring(repare)
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
EXT_IGNOREES = re.compile(r"\.(jpg|jpeg|png|gif|svg|webp|zip|mp4|mp3|css|js|ics|xlsx?|docx?|csv|xml|json|odt|ods|odp|pptx?|rtf|txt)$", re.I)


PREFIXES_TITRE = re.compile(
    r"^\s*(acc?ess to the publication|read more( about)?|lire la suite|en savoir plus( sur)?|davantage d'informations sur|"
    r"more information (about|on)|learn more( about)?|mehr erfahren( zu[mr]?)?|weiterlesen|leer m[aá]s( sobre)?|"
    r"leggi (di pi[uù]|tutto)|lees meer( over)?|czytaj wi[eę]cej|v[ií]ce informac[ií]|download|t[ée]l[ée]charger)"
    r"\s*[:\-–—»›]?\s*", re.I)
TITRES_GENERIQUES = re.compile(
    r"^(see legislative record|legislative record|read more|more|details?|d[ée]tails|lire la suite|en savoir plus|download|"
    r"t[ée]l[ée]charger|pdf|html|link|lien|here|ici|click here|cliquez ici|continue reading|voir plus|voir|see|view|"
    r"(le|la|les|l'|the) (rapport|synth[èe]se|d[ée]cision|avis|lignes directrices|document|report|summary|annexe?s?|guide)|"
    r"press release|communiqu[ée] de presse|news|actualit[ée]s?|publication|documents?)\W*$", re.I)
TITRE_FICHIER = re.compile(r"^[\w\-. ]+\.(pdf|xlsx?|docx?|csv|odt|ods|pptx?|zip|xml|json)$|^[\w\-.]+_[\w\-.]+$", re.I)


def titre_depuis_lien(lien):
    """« …/2026-09-guidelines_on_ai-transparency.pdf » -> « 2026 09 guidelines on ai transparency »."""
    from urllib.parse import unquote
    seg = unquote(urlparse(lien).path.rstrip("/").rsplit("/", 1)[-1])
    seg = re.sub(r"\.(pdf|html?|aspx|php|xlsx?|docx?)$", "", seg, flags=re.I)
    mots = [m for m in re.split(r"[-_+.\s]+", seg) if m and not re.fullmatch(r"[0-9a-f]{8,}|\d{5,}", m)]
    if len(mots) < 3:
        return ""
    t = " ".join(mots)
    return t[0].upper() + t[1:]


def nettoyer_titre(titre, lien):
    """Retire les préfixes parasites (« Acess to the publication: »), la taille des
    PDF, et remplace un titre générique ou un nom de fichier par le nom tiré du
    lien. Retourne "" si aucun titre exploitable."""
    t = re.sub(r"\s+", " ", titre or "").strip()
    t = re.sub(r"^CELEX:\S+:\s*", "", t)   # titres EUR-Lex « CELEX:32026D04999: … »
    t = re.sub(r"\s*[\(\[]\s*(pdf|PDF|xlsx|docx)?\s*[-–,]?\s*[\d.,]+\s*(ko|Ko|KB|kB|Mo|MB|mo|o)\s*[\)\]]\s*$", "", t)
    t2 = PREFIXES_TITRE.sub("", t)
    if len(t2) >= 12:
        t = t2
    if TITRES_GENERIQUES.match(t) or TITRE_FICHIER.match(t) or len(t) < 12:
        return titre_depuis_lien(lien)
    return t


def cle_titre(titre):
    return re.sub(r"[^a-z0-9]+", " ", sans_accents(titre).lower()).strip()[:120]


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
            for a in lot:
                a["_orig"] = f
            arts.extend(lot)
            flux_lus.append(f)
            dates = [a["date"] for a in lot if a["date"]]
            if RATTRAPAGE and dates and min(dates) > RATTRAPAGE:
                arts.extend(dict(x, _orig=f) for x in flux_archives(client, f, {a["lien"] for a in lot}, max_pages))
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
        for a in trouves:
            a["_orig"] = u
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

def nouvel_article(a, src, id_version, regles_mc, cfg, nature):
    texte = a["titre"] + " " + a["resume"]
    rubrique, tags, groupes = classer(texte, regles_mc, cfg)
    art = {
        "id": identifiant(a["lien"]), "titre": a["titre"], "lien": a["lien"], "resume": a["resume"],
        "date": (a["date"] or AUJOURDHUI).isoformat(), "date_estimee": a["date"] is None,
        "detecte_le": AUJOURDHUI.isoformat(), "version": id_version, "source": src["nom"], "zone": src["zone"],
        "nature": nature, "rubrique": rubrique or "autres", "rubrique_mots_cles": bool(rubrique),
        "tags": tags, "groupes": groupes, "amende": detecter_amende(texte, src["zone"]),
    }
    if src.get("filtre_pertinence"):
        art["filtre_pertinence"] = True
    return art


def fiche_ecarte(a):
    """Version légère d'un article écarté, pour la liste consultable du site."""
    en = ((a.get("trad") or {}).get("en") or {}).get("titre", "")
    return {k: v for k, v in {
        "id": a["id"], "titre": a["titre"], "titre_en": en if en != a["titre"] else "", "lien": a["lien"],
        "source": a.get("source", ""), "zone": a.get("zone", ""), "date": a.get("date", ""),
        "detecte_le": a.get("detecte_le", ""), "motif": a.get("motif", ""), "score": a.get("score"),
        "nature": a.get("nature", ""), "debat": a.get("debat", False)}.items() if v not in ("", None, False)}


def regrouper_doublons(liste):
    """Même information publiée par plusieurs sources (titre identique, dans la langue
    d'origine ou une fois traduit) : on garde une seule carte (source officielle en
    priorité, sinon la plus ancienne) et on liste les autres sources dessous."""
    for a in liste:
        a.pop("doublon_de", None)
        a.pop("aussi", None)
    ordre = sorted((a for a in liste if not a.get("base")),
                   key=lambda a: (a.get("nature") != "officielle", a["date"], a.get("detecte_le", "")))
    premiers, n = {}, 0
    for a in ordre:
        cles = set()
        for t in [a["titre"]] + [(tr or {}).get("titre", "") for tr in (a.get("trad") or {}).values()]:
            k = cle_titre(t or "")
            if len(k.split()) >= 5:
                cles.add(k)
        prem = next((premiers[k] for k in cles if k in premiers), None)
        if prem is not None and prem["source"] != a["source"]:
            a["doublon_de"] = prem["id"]
            prem.setdefault("aussi", []).append({"source": a["source"], "lien": a["lien"], "date": a["date"],
                                                 "publication": a.get("publication", "")})
            n += 1
        else:
            for k in cles:
                premiers.setdefault(k, a)
    return n


def main():
    cfg = charger_config()
    classeur = openpyxl.load_workbook(os.path.join(RACINE, cfg["fichier_sources"]), read_only=True, data_only=True)
    toutes = charger_sources(cfg, classeur, avec_inactives=True)
    sources = [x for x in toutes if not x["inactive"]]
    regles_mc = charger_mots_cles(cfg, classeur)
    print("%d sources, %d mots-clés%s" % (len(sources), len(regles_mc),
          (" — RATTRAPAGE depuis le %s" % RATTRAPAGE) if RATTRAPAGE else ""))

    ancien = lire_json(os.path.join(DATA, "actualites.json"), {})
    # (les articles RKC lus par l'ancien analyseur de mails sont relus avec le nouveau)
    articles = {a["id"]: a for a in ancien.get("articles", []) if not a.get("base")
                and not (a.get("nature") == "rkc" and not str(a.get("pertinence_v", "")).startswith("v4-"))}
    # Débats et signaux (avis d'experts) : stockés à part, jamais mélangés à la veille certifiée
    debats = {a["id"]: a for a in lire_json(os.path.join(DATA, "debats.json"), {}).get("articles", [])}
    # Articles écartés (hors sujet, hors Europe, bruit…) : gardés pour la liste consultable
    # et réexaminés à chaque collecte (les règles ou les avis des lecteurs peuvent changer)
    ecartes = {a["id"]: a for a in lire_json(os.path.join(DATA, "ecartes.json"), {}).get("articles", [])}
    etats_prec = {e["url"]: e for e in lire_json(os.path.join(DATA, "etat_sources.json"), {}).get("sources", [])}
    vus = lire_json(os.path.join(DATA, "vus.json"), {})
    versions = lire_json(os.path.join(DATA, "versions.json"), {}).get("versions", [])
    id_version = MAINTENANT.strftime("%Y-%m-%d-%H%M")
    if any(v.get("id") == id_version for v in versions):
        id_version = MAINTENANT.strftime("%Y-%m-%d-%H%M%S")

    client = Client(cfg)
    max_pages = cfg.get("rattrapage_pages_max", 15)
    memoire_dila = vus.setdefault("__dila_jorf__", {})
    depuis_dila = RATTRAPAGE or (AUJOURDHUI - dt.timedelta(days=cfg.get("dila_jours_premiere_collecte", 21)))

    def collecter(s):
        if "legifrance.gouv.fr" in s["url"] or "dila.gouv.fr" in s["url"]:
            s["filtre_pertinence"] = True   # le JO publie des centaines de textes par semaine
            return dila.collecter(s, client, memoire_dila, depuis_dila, MAINTENANT)
        return collecter_source(s, client, etats_prec.get(s["url"], {}), max_pages)

    with ThreadPoolExecutor(max_workers=cfg.get("requetes_paralleles", 8)) as pool:
        resultats = list(pool.map(lambda s: (s, *collecter(s)), sources))

    conservation = cfg.get("jours_conservation", 730)
    limite_premiere = RATTRAPAGE or (AUJOURDHUI - dt.timedelta(days=cfg.get("jours_premiere_collecte", 60)))
    plancher = dt.date.fromisoformat(cfg.get("date_debut_veille", "2026-01-01"))
    deja_titres = {(a.get("source"), cle_titre(a["titre"])) for d in (articles, debats, ecartes) for a in d.values()}
    etats, nouveaux_ids = [], []
    for src, arts, etat in resultats:
        memo = {}   # mémoire « déjà vus » par page ou flux (et non plus par source)
        nature = nature_source(src)
        retenus = 0
        for a in arts:
            cle_o = normaliser_lien(a.get("_orig") or src["url"])
            if cle_o not in memo:
                memo[cle_o] = (cle_o not in vus, set(vus.get(cle_o, [])))
            premiere_fois, deja_vus = memo[cle_o]
            ident = identifiant(a["lien"])
            nouveau_lien = ident not in deja_vus
            deja_vus.add(ident)
            if ident in articles or ident in debats or ident in ecartes:
                continue
            # Nouvelle page ou nouveau flux (ou rattrapage) : seuls les liens datés récents sont repris,
            # pour ne pas présenter d'anciennes publications comme des nouveautés.
            if (premiere_fois or RATTRAPAGE) and (not a["date"] or a["date"] < limite_premiere):
                if not (RATTRAPAGE and nouveau_lien and not premiere_fois and not a["date"]):
                    continue
            if not premiere_fois and not nouveau_lien and (not a["date"] or a["date"] < limite_premiere):
                continue
            if a["date"] and (a["date"] < plancher or a["date"] < AUJOURDHUI - dt.timedelta(days=conservation)):
                continue
            titre = nettoyer_titre(a["titre"], a["lien"])
            if not titre:
                continue
            a["titre"] = titre
            cle_t = (src["nom"], cle_titre(titre))
            if cle_t in deja_titres:
                continue   # même titre déjà publié par cette source (lien différent)
            deja_titres.add(cle_t)
            art = nouvel_article(a, src, id_version, regles_mc, cfg, nature)
            # un lien SANS date et SANS mot-clé trouvé sur une page web est le plus souvent un lien de menu
            if a["date"] is None and not art["groupes"] and etat.get("mode") not in ("rss", "rss-auto", "opendata"):
                continue
            (debats if nature == "opinion" else articles)[ident] = art
            if nature != "opinion":
                nouveaux_ids.append(ident)
            retenus += 1
        for cle_o, (_p, deja_vus) in memo.items():
            vus[cle_o] = sorted(deja_vus)[-5000:]
        etat["nb_retenus"] = retenus
        prec = etats_prec.get(src["url"], {})
        etat.update(acces=niveau_acces(etat), type=src["type"], nature=nature,
                    nb_pages=len(src["urls_actu"]), nb_flux=len(src["flux_excel"]), origine=src.get("origine", "excel"),
                    pages=src["urls_actu"], flux_liste=src["flux_excel"])
        # santé de la source : deux collectes de suite sans rien lire -> « à retirer ? »
        etat["echecs"] = (prec.get("echecs", 0) + 1) if etat["acces"] == "ko" else 0
        etat["a_retirer"] = etat["echecs"] >= 2
        etat["dernier_article"] = max([a["date"].isoformat() for a in arts if a.get("date")] or [prec.get("dernier_article", "")])
        etats.append(etat)
        print("  %-9s %3d trouvés  %3d retenus  %s%s" % (
            etat["mode"], etat["nb_trouves"], retenus, src["nom"][:60],
            ("  ! " + etat["erreur"][:160]) if etat["erreur"] else ""))

    for src in toutes:
        if src["inactive"]:
            msg = ("Retirée depuis le site : plus interrogée." if src.get("retiree")
                   else "Statut « %s » dans l'Excel : source non interrogée." % src["statut_excel"])
            etats.append({"nom": src["nom"], "zone": src["zone"], "url": src["url"], "mode": "inactif",
                          "acces": "retiree" if src.get("retiree") else "inactive", "flux": "", "page": "",
                          "nb_trouves": 0, "nb_retenus": 0, "erreur": msg, "type": src["type"],
                          "nature": nature_source(src), "verifie_le": "", "origine": src.get("origine", "excel")})

    # Veille RKC (dépôt privé récupéré dans rkc/) : titre + lien publiés, extrait gardé privé
    cache_liens = vus.setdefault("__rkc_liens__", {})
    arts_rkc, rapport_rkc = rkc.lire_rkc(os.path.join(RACINE, "rkc"), AUJOURDHUI, client, cache_liens)
    n_rkc = 0
    for r in arts_rkc:
        ident = ("n" + hashlib.sha1(r["id_nd"].encode()).hexdigest()[:11]) if r.get("id_nd") \
            else "r" + hashlib.sha1(r["titre"].encode("utf-8")).hexdigest()[:11]
        if ident in articles or ident in ecartes or r["date"] < plancher:
            continue
        cle_t = ("Veille RKC (Wavestone)", cle_titre(r["titre"]))
        if cle_t in deja_titres:
            continue
        deja_titres.add(cle_t)
        texte_prive = r["titre"] + ". " + r["texte"]
        rubrique, tags, groupes = classer(texte_prive, regles_mc, cfg)
        articles[ident] = {
            "id": ident, "titre": r["titre"], "lien": r["lien"], "resume": "", "reserve": True,
            "payant": r["payant"], "publication": r.get("source", ""), "date": r["date"].isoformat(), "date_estimee": False,
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
        print("Veille RKC : %d fichiers (%d mails, %d Word), %d articles lus, %d nouveaux%s" % (
            rapport_rkc["fichiers"], rapport_rkc["mails"], rapport_rkc["word"], rapport_rkc["articles_lus"], n_rkc,
            (" — erreurs : " + " ; ".join(rapport_rkc["erreurs"])) if rapport_rkc["erreurs"] else ""))
        etats.append({"nom": "Veille RKC (Wavestone) — dépôt privé", "zone": "Europe", "url": "", "mode": "rkc",
                      "acces": "partielle" if rapport_rkc["erreurs"] else "ok", "flux": "", "page": "",
                      "nb_trouves": rapport_rkc["articles_lus"], "nb_retenus": n_rkc,
                      "erreur": " ; ".join(rapport_rkc["erreurs"]), "type": "Veille interne", "nature": "rkc",
                      "verifie_le": MAINTENANT.strftime("%Y-%m-%d %H:%M"), "origine": "rkc",
                      # dates des alertes lues (jamais le nom des fichiers)
                      "veilles": sorted(rapport_rkc.get("veilles", []), key=lambda v: v["date"], reverse=True)})

    # Base de connaissance (jamais purgée) + nettoyage
    base = charger_base(articles)
    liens_base = {normaliser_lien(b["lien"]) for b in base}
    seuil = (AUJOURDHUI - dt.timedelta(days=conservation)).isoformat()
    for d in (articles, ecartes):   # anciens titres parasites (versions précédentes) nettoyés une fois
        for a in d.values():
            if a.get("nature") != "rkc" and a.get("titre_nettoye") != 2:
                t = nettoyer_titre(a["titre"], a["lien"])
                if t and t != a["titre"]:
                    a["titre"], a["trad"] = t, {}
                a["titre_nettoye"] = 2
    # doublons (même source, même titre) laissés par les versions précédentes
    vus_t, collectes = set(), []
    tous = sorted([a for a in list(articles.values()) + list(ecartes.values()) if not a.get("debat")],
                  key=lambda a: (a.get("detecte_le", ""), a["date"]))
    for a in tous:
        c = (a.get("source"), cle_titre(a["titre"]))
        if c in vus_t or a["date"] < seuil or normaliser_lien(a["lien"]) in liens_base:
            continue
        vus_t.add(c)
        collectes.append(a)
    for a in collectes:
        a.setdefault("rubrique_mots_cles", a.get("rubrique") not in (None, "autres"))
        a.setdefault("version", "")
        if "amende" not in a:
            a["amende"] = detecter_amende(a["titre"] + " " + a.get("resume", ""), a.get("zone", ""))
    liste_debats = [a for a in list(debats.values()) + [e for e in ecartes.values() if e.get("debat")] if a["date"] >= seuil]

    depot = os.environ.get("GITHUB_REPOSITORY")
    serveur = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
    meta = {
        "titre": cfg["titre"], "surtitre": cfg.get("surtitre", ""), "sous_titre": cfg.get("sous_titre", ""),
        "mise_a_jour": MAINTENANT.isoformat(timespec="minutes"), "version": id_version,
        "nb_sources": len(sources),
        "url_lancer_maj": ("%s/%s/actions/workflows/veille.yml" % (serveur, depot)) if depot else cfg.get("url_lancer_maj", ""),
        "depot": depot or cfg.get("depot_github", ""),
        "branche": os.environ.get("BRANCHE_VEILLE") or cfg.get("branche_github", "main"),
        "serveur": serveur,
    }

    # Pertinence, 1er passage (sans traduction) : on ne traduit que ce qui sera gardé
    pert = Pertinence(cfg)
    pert.noter(collectes)
    pert.noter(liste_debats)
    gardes = [a for a in collectes if a["pertinence"] != "ecarte"]

    # Traduction (gratuite, open source) des articles gardés et des débats gardés
    trad = Traducteur(cfg)
    # d'abord les plus pertinents (le budget de traduction par collecte est limité), puis les plus récents
    rang = {"elevee": 0, "moyenne": 1, "faible": 2}
    for a in sorted(sorted(gardes + base, key=lambda a: (a["date"], a.get("detecte_le", "")), reverse=True),
                    key=lambda a: 0 if a.get("base") else rang.get(a.get("pertinence"), 3)):
        trad.traduire_article(a)
    for a in liste_debats:
        if a["pertinence"] in ("elevee", "moyenne"):
            trad.traduire_article(a)
    traduire_syntheses(trad)
    trad.enregistrer()
    en_attente = sum(1 for a in gardes + base if trad.actif and any(
        c != a.get("langue") and c not in (a.get("trad") or {}) for c in trad.cibles))
    meta["traduction"] = {"active": trad.actif, "moteur": bool(trad.moteur), "faites": trad.faits,
                          "en_attente": en_attente, "erreur": trad.erreur}
    print("Traduction : %d segments traduits, %d articles en attente%s" % (
        trad.faits, en_attente, (" — " + trad.erreur) if trad.erreur else ""))

    # 2e passage : les règles lisent aussi le titre anglais (textes clés cités dans une autre langue)
    pert.noter(gardes)
    ecartes = {a["id"]: a for a in collectes if a["pertinence"] == "ecarte"}
    gardes = [a for a in collectes if a["pertinence"] != "ecarte"]
    debats_gardes = [a for a in liste_debats if a["pertinence"] in ("elevee", "moyenne")]
    for a in debats_gardes:
        a.pop("debat", None)
        a["essentiel"] = False   # un avis d'expert n'entre jamais dans L'essentiel
    for a in liste_debats:
        if a["pertinence"] not in ("elevee", "moyenne"):
            a["debat"] = True
            a["pertinence"] = "ecarte"
            ecartes[a["id"]] = a
    liste = sorted(gardes + base, key=lambda a: (a["date"], a.get("detecte_le", "")), reverse=True)
    liste = liste[:cfg.get("nb_max_articles", 5000)]
    n_doublons = regrouper_doublons(liste)
    print("Doublons entre sources regroupés : %d" % n_doublons)
    ids_liste = {a["id"] for a in liste}
    nouveaux_ids = [i for i in dict.fromkeys(nouveaux_ids) if i in ids_liste]
    meta["nb_nouveaux"] = len(nouveaux_ids)
    meta["nb_ecartes_nouveaux"] = sum(1 for a in ecartes.values() if a.get("version") == id_version)
    meta["nb_essentiel"] = sum(1 for a in liste if a.get("essentiel"))
    print("Pertinence (%s) : %d gardés, dont %d dans L'essentiel ; %d écartés au total (%d cette semaine)%s" % (
        pert.mode, len(gardes), meta["nb_essentiel"], len(ecartes), meta["nb_ecartes_nouveaux"],
        (" — " + pert.erreur) if pert.erreur else ""))
    import regles as _regles
    meta["textes_cles_en"] = _regles.LIBELLES_EN
    meta["pertinence"] = {"mode": pert.mode, "erreur": pert.erreur, "themes": pert.libelles(),
                          "seuils": {k: v for k, v in pert.seuils.items() if not k.startswith("_")}}

    rubriques = [dict(r) for r in cfg["rubriques"]]
    meta["rubriques"] = [{k: r.get(k, "") for k in ("id", "titre", "chapeau", "titre_en", "chapeau_en")} for r in rubriques]
    meta["libelles_en"] = cfg.get("libelles_en", {})
    meta["sous_titre_en"] = cfg.get("sous_titre_en", "")
    meta["surtitre_en"] = cfg.get("surtitre_en", "")

    # Dates clés (échéances) : seulement près d'un mot d'obligation, jamais pour un événement
    for a in liste + debats_gardes:
        if a.get("nature") == "rkc":
            continue
        if any("événements" in b for b in a.get("bruit", [])):
            a["echeances"] = []
            continue
        textes = {a.get("langue") or "fr": a["titre"] + ". " + (a.get("resume") or "")}
        for lg, tr in (a.get("trad") or {}).items():
            textes[lg] = (tr.get("titre") or "") + ". " + (tr.get("resume") or "")
        try:
            d_art = dt.date.fromisoformat(a["date"])
        except ValueError:
            d_art = None
        a["echeances"] = echeances.extraire(textes, d_art, AUJOURDHUI)
    for a in liste + liste_debats + list(ecartes.values()):
        a.pop("_texte", None)   # le texte privé RKC n'est jamais écrit

    for a in liste + debats_gardes:
        a["acronymes"] = [code for code, _ in extraire_acronymes(a["titre"] + " " + a.get("resume", ""), trad.glossaire)]
    precedent = lire_json(os.path.join(DATA, "acronymes.json"), {})
    registre = registre_acronymes(liste, trad.glossaire, precedent, AUJOURDHUI.isoformat())

    actives = [e for e in etats if e["acces"] not in ("inactive", "retiree")]
    versions.append({
        "id": id_version, "date": meta["mise_a_jour"], "nb_total": len(liste), "nb_nouveaux": len(nouveaux_ids),
        "nouveaux": nouveaux_ids, "rattrapage": RATTRAPAGE.isoformat() if RATTRAPAGE else "",
        "nb_essentiel": meta["nb_essentiel"], "nb_ecartes": meta["nb_ecartes_nouveaux"],
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
    ecrire_json_et_js("debats", {"mise_a_jour": meta["mise_a_jour"], "articles": debats_gardes}, "VEILLE_DEBATS")
    # écartés : fichier complet (réexaminé à chaque collecte) + liste légère pour le site (120 derniers jours)
    liste_ecartes = sorted(ecartes.values(), key=lambda a: (a.get("detecte_le", ""), a["date"]), reverse=True)
    ecrire_json_et_js("ecartes", {"articles": liste_ecartes[:cfg.get("nb_max_ecartes", 8000)]}, None)
    limite_ec = (AUJOURDHUI - dt.timedelta(days=120)).isoformat()
    ecrire_json_et_js("ecartes_site", {"mise_a_jour": meta["mise_a_jour"],
                                       "articles": [fiche_ecarte(a) for a in liste_ecartes if a.get("detecte_le", a["date"]) >= limite_ec][:4000]},
                      "VEILLE_ECARTES")
    telecharger_carte()
    ref = lire_json(os.path.join(RACINE, "config", "referentiel.json"), {})
    if ref:
        with open(os.path.join(DATA, "referentiel.js"), "w", encoding="utf-8") as f:
            f.write("window.VEILLE_REFERENTIEL = %s;\n" % json.dumps(ref, ensure_ascii=False))
    ecrire_json_et_js("vus", vus, None)
    with open(os.path.join(DATA, "version_courante.txt"), "w") as f:
        f.write(id_version)
    # Export PDF de la veille complète (FR et EN), téléchargeable depuis le site
    try:
        import export_pdf
        export_pdf.generer(liste, meta, ref, DATA)
    except Exception as e:
        print("Export PDF non généré : %s" % str(e)[:200])
    print("\n%d nouveaux articles — %d au total (dont %d de la base de connaissance)." % (len(nouveaux_ids), len(liste), len(base)))
    print("%d/%d sources actives lues (%d partiellement, %d à retirer ?)." % (
        sum(1 for e in actives if e["acces"] in ("ok", "partielle")), len(actives),
        sum(1 for e in actives if e["acces"] == "partielle"), sum(1 for e in actives if e.get("a_retirer"))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
