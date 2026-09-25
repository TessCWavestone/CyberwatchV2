"""
Cyber Watch — lecture des veilles RKC (Wavestone) déposées dans un dépôt PRIVÉ.

Le workflow GitHub récupère ce dépôt privé dans le dossier « rkc/ » (jamais
publié). On y dépose chaque semaine :
  - le mail RKC, enregistré depuis Outlook au format .eml ou .msg
    (liste de liens vers des articles gratuits et payants) ;
  - le fichier Word « Veille AAAA-MM-JJ.docx » qui contient le texte des
    articles payants.

CONFIDENTIALITÉ : le site est public. Le texte des articles n'est JAMAIS
publié : il sert uniquement à calculer la pertinence, repérer une amende et
des dates clés. Le site n'affiche que le titre, le lien, la date, la note de
pertinence et les thèmes.
"""

import datetime as dt
import email
import email.policy
import glob
import os
import re
from urllib.parse import parse_qs, unquote, urlparse

from bs4 import BeautifulSoup

LIENS_EXCLUS = re.compile(
    r"(unsubscribe|desinscri|désinscri|mailto:|linkedin\.com|twitter\.com|x\.com/|facebook\.com|youtube\.com|"
    r"instagram\.com|aka\.ms|privacy|confidentialit|view.?in.?browser|voir.?dans.?le.?navigateur|"
    r"\.(png|jpe?g|gif|svg)(\?|$))", re.I)
TEXTES_GENERIQUES = re.compile(r"^(ici|here|lien|link|lire|read( more)?|en savoir plus|voir|article|source|→|»)$", re.I)

PAYS = {
    "Allemagne": r"allemagne|allemand|germany|german|deutschland|bsi\b|bfarm", "Autriche": r"autriche|autrichien|austria|österreich",
    "Belgique": r"belgique|belge|belgium|belgian|belgië", "Danemark": r"danemark|danois|denmark|danish|danmark",
    "Espagne": r"espagne|espagnol|spain|spanish|españa|aepd|ccn-cert|incibe", "Finlande": r"finlande|finlandais|finland|finnish|suomi",
    "France": r"\bfrance\b|french|française|français|cnil|anssi|\bans\b", "Grèce": r"grèce|grec\b|grecque|greece|greek|ελλάδα",
    "Hongrie": r"hongrie|hongrois|hungary|hungarian|magyar", "Italie": r"italie|italien|italy|italian|italia|garante",
    "Norvège": r"norvège|norvégien|norway|norwegian|norge", "Pays-Bas": r"pays-bas|néerlandais|netherlands|dutch|nederland",
    "Pologne": r"pologne|polonais|poland|polish|polska|uodo", "Portugal": r"portugal|portugais|portuguese|cnpd",
    "Rép. Tchèque": r"tchèque|czech|česk", "Royaume-Uni": r"royaume-uni|britannique|united kingdom|\buk\b|britain|british|\bnhs\b|\bico\b|ncsc",
    "Suède": r"suède|suédois|sweden|swedish|sverige", "Suisse": r"suisse|switzerland|swiss|schweiz",
    "Europe": r"européen|european|\beu\b|\bue\b|commission|enisa|edpb|nis2|cyber resilience act|ai act|ehds",
}


def zone_probable(texte):
    t = texte.lower()
    scores = {z: len(re.findall(rx, t)) for z, rx in PAYS.items()}
    z = max(scores, key=scores.get)
    return z if scores[z] else "Europe"


def deballer_lien(url):
    """Liens Outlook « safelinks » et redirections de suivi -> URL d'origine."""
    p = urlparse(url)
    if "safelinks.protection.outlook.com" in p.netloc or p.path.endswith("/redirect"):
        q = parse_qs(p.query)
        for cle in ("url", "u", "target"):
            if q.get(cle):
                return unquote(q[cle][0])
    return url


def date_depuis_nom(nom, aujourdhui):
    """« Veille 2026-04-21 », « Veille 20260421 », « Veille 2104 » (21/04) -> date."""
    m = re.search(r"(20\d\d)[-_. ]?(\d\d)[-_. ]?(\d\d)", nom)
    if m:
        try:
            return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass
    m = re.search(r"(?<!\d)(\d\d)(\d\d)(?!\d)", nom)
    if m:
        j, mo = int(m.group(1)), int(m.group(2))
        for annee in (aujourdhui.year, aujourdhui.year - 1):
            try:
                d = dt.date(annee, mo, j)
            except ValueError:
                break
            if d <= aujourdhui:
                return d
    return None


# ------------------------------------------------------------------ mails

def _corps_html_eml(chemin):
    with open(chemin, "rb") as f:
        msg = email.message_from_binary_file(f, policy=email.policy.default)
    date = None
    try:
        date = email.utils.parsedate_to_datetime(msg["date"]).date()
    except Exception:
        pass
    corps = msg.get_body(preferencelist=("html", "plain"))
    contenu = corps.get_content() if corps else ""
    return contenu, date, str(msg["subject"] or "")


def _corps_html_msg(chemin):
    import extract_msg  # dépendance facultative (requirements-rkc.txt)
    m = extract_msg.Message(chemin)
    contenu = m.htmlBody or m.body or ""
    if isinstance(contenu, bytes):
        contenu = contenu.decode("utf-8", "ignore")
    date = None
    try:
        date = m.date.date() if hasattr(m.date, "date") else None
    except Exception:
        pass
    return contenu, date, m.subject or ""


def liens_du_mail(contenu):
    """Extrait (titre, lien, contexte) de chaque article cité dans le mail."""
    if "<" not in contenu:
        return [("", u, "") for u in re.findall(r"https?://\S+", contenu)]
    soupe = BeautifulSoup(contenu, "html.parser")
    sortie, vus = [], set()
    for a in soupe.find_all("a", href=True):
        lien = deballer_lien(a["href"].strip())
        if not lien.startswith("http") or LIENS_EXCLUS.search(lien) or lien in vus:
            continue
        titre = re.sub(r"\s+", " ", a.get_text(" ")).strip()
        bloc = a.find_parent(["p", "li", "td", "div"]) or a.parent
        contexte = re.sub(r"\s+", " ", bloc.get_text(" ")).strip() if bloc else ""
        if len(titre) < 15 or TEXTES_GENERIQUES.match(titre):
            titre = contexte.replace(titre, "").strip(" :-–—|") if contexte else titre
        if len(titre) < 10:
            continue
        vus.add(lien)
        sortie.append((titre[:250], lien, contexte[:600]))
    return sortie


# ------------------------------------------------------------------ Word

def _liens_paragraphe(par):
    liens = []
    for h in par._p.xpath(".//w:hyperlink"):
        rid = h.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        if rid and rid in par.part.rels:
            liens.append(par.part.rels[rid].target_ref)
    liens += re.findall(r"https?://[^\s)>\]]+", par.text)
    return [deballer_lien(l) for l in liens if l.startswith("http")]


def _est_titre(par):
    style = (par.style.name if par.style is not None else "").lower()
    if style.startswith(("heading", "titre", "title")):
        return True
    texte = par.text.strip()
    runs = [r for r in par.runs if r.text.strip()]
    return 12 <= len(texte) <= 220 and runs and all(r.bold for r in runs)


def articles_du_word(chemin):
    """Découpe le document en articles : un titre (style Titre ou paragraphe
    entièrement en gras) suivi de son texte. Retourne (titre, liens, texte)."""
    import docx
    doc = docx.Document(chemin)
    articles, courant = [], None
    for par in doc.paragraphs:
        texte = par.text.strip()
        if not texte:
            continue
        if _est_titre(par):
            if courant:
                articles.append(courant)
            courant = {"titre": texte, "liens": _liens_paragraphe(par), "texte": []}
        elif courant:
            courant["liens"] += _liens_paragraphe(par)
            courant["texte"].append(texte)
    if courant:
        articles.append(courant)
    return [(a["titre"], list(dict.fromkeys(a["liens"])), " ".join(a["texte"])) for a in articles if a["texte"] or a["liens"]]


# ------------------------------------------------------------------ assemblage

def _cle(titre):
    return re.sub(r"\W+", " ", titre.lower()).strip()[:80]


def lire_rkc(dossier, aujourdhui, client=None):
    """Retourne (articles, rapport). Chaque article : titre, lien, date, texte
    (privé, jamais publié), zone probable, fichier d'origine."""
    rapport = {"fichiers": 0, "mails": 0, "word": 0, "erreurs": []}
    if not os.path.isdir(dossier):
        return [], rapport
    par_cle = {}
    fichiers = sorted(glob.glob(os.path.join(dossier, "**", "*"), recursive=True))
    # 1. mails : liste des articles (titres + liens)
    for f in fichiers:
        ext = f.lower().rsplit(".", 1)[-1]
        if ext not in ("eml", "msg"):
            continue
        rapport["fichiers"] += 1
        try:
            contenu, date, sujet = (_corps_html_eml if ext == "eml" else _corps_html_msg)(f)
        except Exception as e:
            rapport["erreurs"].append("%s : %s" % (os.path.basename(f), str(e)[:120]))
            continue
        rapport["mails"] += 1
        date = date or date_depuis_nom(os.path.basename(f), aujourdhui) or aujourdhui
        for titre, lien, contexte in liens_du_mail(contenu):
            par_cle.setdefault(_cle(titre), {"titre": titre, "lien": lien, "date": date, "texte": contexte,
                                             "payant": False, "fichier": os.path.basename(f)})
    # 2. Word : texte des articles payants (rapproché du mail par le titre)
    for f in fichiers:
        if not f.lower().endswith(".docx") or os.path.basename(f).startswith("~$"):
            continue
        rapport["fichiers"] += 1
        try:
            arts = articles_du_word(f)
        except Exception as e:
            rapport["erreurs"].append("%s : %s" % (os.path.basename(f), str(e)[:120]))
            continue
        rapport["word"] += 1
        date = date_depuis_nom(os.path.basename(f), aujourdhui) or aujourdhui
        for titre, liens, texte in arts:
            cle = _cle(titre)
            proche = next((k for k in par_cle if k[:40] == cle[:40] or (len(cle) > 25 and (cle in k or k in cle))), None)
            if proche:
                par_cle[proche]["texte"] = texte
                par_cle[proche]["payant"] = True
            else:
                par_cle[cle] = {"titre": titre, "lien": liens[0] if liens else "", "date": date, "texte": texte,
                                "payant": True, "fichier": os.path.basename(f)}
    articles = []
    for a in par_cle.values():
        a["zone"] = zone_probable(a["titre"] + " " + a["texte"])
        articles.append(a)
    return articles, rapport
