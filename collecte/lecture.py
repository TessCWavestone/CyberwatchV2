"""
Cyber Watch — lecture de la page des articles (v6).

Les flux RSS ne donnent souvent qu'un titre vague et une ou deux lignes. Pour juger un article sur son
contenu, la collecte lit le début de sa page (quand le site l'autorise : robots.txt respecté, pas de
contournement de connexion ni de paywall) et en garde le texte principal.

Rien du texte de la page n'est enregistré ni affiché sur le site : il ne sert qu'à classer l'article pendant
la collecte (champ privé _texte, jamais écrit). Seuls sont gardés des indices (textes clés cités, signal
réglementaire, sujet…), la note de pertinence, le classement par le sens et, si c'est sûr, « qui est concerné ».
"""

import datetime as dt
import re
from concurrent.futures import ThreadPoolExecutor

from bs4 import BeautifulSoup

import regles

MAX_TEXTE = 4000        # caractères gardés en mémoire pour l'analyse
MAX_EXTRAIT = 500       # caractères publiés
TYPES_HTML = ("text/html", "application/xhtml")
SANS_INTERET = re.compile(r"cookie|javascript|abonnez|subscribe|newsletter|connexion|log ?in|sign ?in|tous droits|"
                          r"all rights reserved|partager|share this|lire aussi|read more|accept", re.I)


def texte_principal(html):
    """Texte des paragraphes du contenu principal (article, main…), sans menus, pieds de page ni scripts."""
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style", "noscript", "nav", "header", "footer", "aside", "form", "button", "svg", "iframe"]):
        t.decompose()
    zone = (soup.find("article") or soup.find("main") or soup.find(attrs={"role": "main"})
            or soup.find(id=re.compile(r"content|article|main", re.I)) or soup.body or soup)
    morceaux = []
    for p in zone.find_all(["p", "li", "h2", "h3"]):
        x = " ".join(p.get_text(" ", strip=True).split())
        if len(x) >= 50 and not SANS_INTERET.search(x[:80]):
            morceaux.append(x)
        if sum(len(m) for m in morceaux) > MAX_TEXTE:
            break
    return " ".join(morceaux)[:MAX_TEXTE]


def lire_page(client, url):
    """Retourne (texte, erreur)."""
    if not url or not url.startswith("http"):
        return "", "pas d'adresse"
    try:
        r = client.get(url)
    except PermissionError:
        return "", "robots.txt"
    except Exception as e:
        return "", str(e)[:80]
    if not any(t in r.headers.get("Content-Type", "") for t in TYPES_HTML):
        return "", "pas une page HTML"
    try:
        texte = texte_principal(r.text)
    except Exception as e:
        return "", "lecture impossible : " + str(e)[:60]
    return texte, ("" if len(texte) >= 200 else "page sans texte lisible (contenu en JavaScript ?)")


def extrait(texte, titre=""):
    """Court extrait publié : début du texte, sans répéter le titre."""
    t = texte
    if titre and t.lower().startswith(titre.lower()[:40]):
        t = t[len(titre):]
    t = t.strip(" .-—:")
    if len(t) <= MAX_EXTRAIT:
        return t
    coupe = t[:MAX_EXTRAIT].rsplit(" ", 1)[0]
    return coupe + "…"


def lire_pages(articles, client, aujourdhui, max_pages=400, paralleles=8):
    """Lit la page des articles donnés (les plus récents d'abord). Met le texte dans a['_texte'] (privé),
    les indices tirés de la page dans a['indices_page'] et l'état dans a['page'] = {date, ok, erreur}."""
    a_lire = [a for a in articles if not (a.get("page") or {}).get("date") and a.get("lien")][:max_pages]
    if not a_lire:
        return 0, 0

    def lire(a):
        return a, lire_page(client, a["lien"])

    ok = 0
    with ThreadPoolExecutor(max_workers=paralleles) as pool:
        for a, (texte, err) in pool.map(lire, a_lire):
            a["page"] = {"date": aujourdhui.isoformat(), "ok": bool(texte and not err)}
            if err:
                a["page"]["erreur"] = err
            if texte and not err:
                a["_texte"] = texte
                a["indices_page"] = regles.indices_page(texte)
                ok += 1
    return len(a_lire), ok


# --------------------------------------------------------------------------- « qui est concerné »
# Phrases candidates : celles qui annoncent un champ d'application. Le classifieur par le sens (sens.py)
# confirme ensuite — sans confirmation sûre, rien n'est affiché.
INDICES_CHAMP = re.compile(
    r"appl(y|ies|ied) (only |solely |exclusively |also )?to|will (apply|have to)|\bmust\b|obligations? (for|on|of)|in scope|within the scope|cover(s|ed)? |"
    r"required to|subject to|s'appliqu|s.appliquera|concerne|concernera|devront|doivent|soumis|assujetti|"
    r"(gilt|gelten) (nur |ausschliesslich |auch )?fur|betrifft|betroffen|mussen|verpflichtet|se aplica|aplicara|deberan|obligad|afecta|"
    r"si applica|dovranno|obbligh|van toepassing|moeten|geldt (alleen |ook )?voor|dotycz|musza|vztahuje|galler|omfattas|skal |koskee|"
    r"vonatkozik|kell ", re.I)


def phrases_candidates(texte, limite=12):
    import unicodedata
    def sa(x):
        return "".join(c for c in unicodedata.normalize("NFD", x) if unicodedata.category(c) != "Mn")
    phrases = re.split(r"(?<=[.!?;])\s+(?=[A-ZÀ-ÖØ-Þ0-9«\"“(])", texte or "")
    res = []
    for p in phrases:
        p = p.strip()
        if 40 <= len(p) <= 400 and INDICES_CHAMP.search(sa(p)):
            res.append(p)
        if len(res) >= limite:
            break
    return res
