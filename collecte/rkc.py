"""
Cyber Watch — lecture des veilles RKC (alerte Nexis Newsdesk) déposées dans un
dépôt GitHub PRIVÉ.

Le workflow récupère ce dépôt privé dans le dossier « rkc/ » (jamais publié,
supprimé avant l'enregistrement). On y dépose le mail de l'alerte, enregistré
depuis Outlook au format .msg ou .eml (et, facultativement, un Word .docx
contenant le texte d'articles payants).

Lecture « structurée » du mail Newsdesk : pour chaque article on garde
  - le titre (lien « click » Newsdesk, identifiant d'article a=…),
  - le nom de la publication, la date de l'article (« 22 Aug 2026 02:00 »),
  - l'extrait (« ...texte... ») : PRIVÉ, sert seulement à la note de pertinence.
Sont ignorés : en-tête du transfert (De / Envoyé / À / Objet), signature,
« View in browser », liens vers le site racine de la publication, pied de page.
Les liens sont décodés (Proofpoint urldefense v3, Outlook safelinks).

CONFIDENTIALITÉ : le site est public. On n'y publie jamais l'extrait, ni le
lien Newsdesk brut (il contient des identifiants d'abonné) : le lien publié
est l'adresse finale de l'article (résolue pendant la collecte) ou, à défaut,
une recherche du titre.
"""

import datetime as dt
import email
import email.policy
import glob
import os
import re
import struct
from urllib.parse import parse_qs, quote_plus, unquote, urlparse

from bs4 import BeautifulSoup, NavigableString, Tag

PAYS = {
    "Allemagne": r"allemagne|allemand|germany|german|deutschland|\bbsi\b|bfarm", "Autriche": r"autriche|autrichien|austria|osterreich",
    "Belgique": r"belgique|belge|belgium|belgian|belgie", "Danemark": r"danemark|danois|denmark|danish|danmark",
    "Espagne": r"espagne|espagnol|spain|spanish|espana|aepd|ccn-cert|incibe", "Finlande": r"finlande|finlandais|finland|finnish|suomi",
    "France": r"\bfrance\b|french|francaise|francais|cnil|anssi", "Grèce": r"grece|grec\b|grecque|greece|greek",
    "Hongrie": r"hongrie|hongrois|hungary|hungarian|magyar", "Italie": r"italie|italien|italy|italian|italia|garante",
    "Norvège": r"norvege|norvegien|norway|norwegian|norge", "Pays-Bas": r"pays-bas|neerlandais|netherlands|dutch|nederland",
    "Pologne": r"pologne|polonais|poland|polish|polska|uodo", "Portugal": r"portugal|portugais|portuguese|cnpd",
    "Rép. Tchèque": r"tcheque|czech|cesk", "Royaume-Uni": r"royaume-uni|britannique|united kingdom|\buk\b|britain|british|\bnhs\b|\bico\b|ncsc",
    "Suède": r"suede|suedois|sweden|swedish|sverige", "Suisse": r"suisse|switzerland|swiss|schweiz",
    "Europe": r"europeen|european|\beu\b|\bue\b|commission|enisa|edpb|nis2|cyber resilience act|ai act|ehds",
}
MOIS_EN = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}
RE_DATE_ND = re.compile(r"\b(\d{1,2}) ([A-Z][a-z]{2}) (20\d\d)(?: \d\d:\d\d)?")
PIED = re.compile(r"If you wish to unsubscribe|About LexisNexis|Pour vous d[ée]sabonner", re.I)


def _sa(s):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def espaces(s):
    return re.sub(r"\s+", " ", s or "").strip()


def zone_probable(texte):
    t = _sa(texte).lower()
    scores = {z: len(re.findall(rx, t)) for z, rx in PAYS.items()}
    z = max(scores, key=scores.get)
    # aucun pays européen reconnu : article probablement international (écarté s'il ne parle pas de l'Europe)
    return z if scores[z] else "Worldwide"


def deballer_lien(url):
    """Proofpoint urldefense (v2, v3), Outlook safelinks -> URL d'origine."""
    url = (url or "").strip()
    m = re.match(r"https?://urldefense(?:\.proofpoint)?\.com/v3/__(.+?)__;", url)
    if m:
        brut = m.group(1)
        # v3 : les caractères spéciaux sont remplacés par « * » (le jeu exact est dans la partie encodée,
        # « *21 » = « ! » dans les liens Newsdesk) ; on remet les plus courants
        brut = brut.replace("*21", "!").replace("*2A", "*").replace("**", "*")
        return brut
    p = urlparse(url)
    if "urldefense" in p.netloc and p.path.startswith("/v2/"):
        q = parse_qs(p.query)
        if q.get("u"):
            return unquote(q["u"][0].replace("-", "%").replace("_", "/"))
    if "safelinks.protection.outlook.com" in p.netloc:
        q = parse_qs(p.query)
        for cle in ("url", "u", "target"):
            if q.get(cle):
                return unquote(q[cle][0])
    return url


def date_depuis_nom(nom, aujourdhui):
    m = re.search(r"(20\d\d)[-_. ]?(\d\d)[-_. ]?(\d\d)", nom)
    if m:
        try:
            return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass
    return None


# ------------------------------------------------------------------ fichiers .msg (Outlook), sans dépendance

def lire_cfb(chemin):
    """Lecteur minimal du format « Compound File Binary » (fichiers .msg Outlook).
    Retourne {chemin_du_flux: octets}."""
    d = open(chemin, "rb").read()
    if d[:8] != bytes.fromhex("D0CF11E0A1B11AE1"):
        raise ValueError("pas un fichier .msg Outlook")
    ssz = 1 << struct.unpack_from("<H", d, 30)[0]
    mssz = 1 << struct.unpack_from("<H", d, 32)[0]
    nfat = struct.unpack_from("<I", d, 44)[0]
    dir1 = struct.unpack_from("<I", d, 48)[0]
    cutoff = struct.unpack_from("<I", d, 56)[0]
    minifat1 = struct.unpack_from("<I", d, 60)[0]
    difat1, ndifat = struct.unpack_from("<I", d, 68)[0], struct.unpack_from("<I", d, 72)[0]
    FIN = 0xFFFFFFFA

    def sec(i):
        return d[512 + i * ssz: 512 + (i + 1) * ssz]

    difat = list(struct.unpack_from("<109I", d, 76))
    n = difat1
    while n < FIN and ndifat:
        s = sec(n)
        difat += list(struct.unpack_from("<%dI" % (ssz // 4 - 1), s))
        n = struct.unpack_from("<I", s, ssz - 4)[0]
        ndifat -= 1
    fat = []
    for i in difat[:nfat]:
        fat += list(struct.unpack_from("<%dI" % (ssz // 4), sec(i)))

    def chaine(s):
        out, vus = [], set()
        while s < FIN and s not in vus and s < len(fat):
            vus.add(s)
            out.append(s)
            s = fat[s]
        return out

    def lire(s):
        return b"".join(sec(i) for i in chaine(s))

    dirs = lire(dir1)
    entrees = []
    for k in range(len(dirs) // 128):
        e = dirs[k * 128:(k + 1) * 128]
        nl = struct.unpack_from("<H", e, 64)[0]
        gauche, droite, enfant = struct.unpack_from("<III", e, 68)
        entrees.append({"nom": e[:max(nl - 2, 0)].decode("utf-16le", "ignore"), "type": e[66], "g": gauche,
                        "d": droite, "e": enfant, "debut": struct.unpack_from("<I", e, 116)[0],
                        "taille": struct.unpack_from("<Q", e, 120)[0]})
    racine = entrees[0]
    mini = lire(racine["debut"]) if racine["debut"] < FIN else b""
    minifat = []
    for i in (chaine(minifat1) if minifat1 < FIN else []):
        minifat += list(struct.unpack_from("<%dI" % (ssz // 4), sec(i)))

    def lire_mini(s, taille):
        out = b""
        while s < FIN and len(out) < taille and s < len(minifat):
            out += mini[s * mssz:(s + 1) * mssz]
            s = minifat[s]
        return out[:taille]

    res, vus = {}, set()

    def parcours(idx, prefixe):
        if idx >= FIN or idx >= len(entrees) or idx in vus:
            return
        vus.add(idx)
        e = entrees[idx]
        parcours(e["g"], prefixe)
        parcours(e["d"], prefixe)
        p = prefixe + "/" + e["nom"]
        if e["type"] == 2:
            res[p] = lire_mini(e["debut"], e["taille"]) if e["taille"] < cutoff else lire(e["debut"])[:e["taille"]]
        elif e["type"] == 1:
            parcours(e["e"], p)

    parcours(racine["e"], "")
    return res


def _corps_msg(chemin):
    flux = lire_cfb(chemin)
    sujet = flux.get("/__substg1.0_0037001F", b"").decode("utf-16le", "ignore").strip("\x00")
    html = flux.get("/__substg1.0_10130102")
    if html:
        m = re.search(rb"charset=[\"']?([\w-]+)", html[:3000], re.I)
        enc = m.group(1).decode() if m else "cp1252"
        try:
            contenu = html.decode(enc, "replace")
        except LookupError:
            contenu = html.decode("cp1252", "replace")
    elif "/__substg1.0_1013001F" in flux:
        contenu = flux["/__substg1.0_1013001F"].decode("utf-16le", "ignore")
    else:
        contenu = flux.get("/__substg1.0_1000001F", b"").decode("utf-16le", "ignore")
    return contenu, None, sujet


def _corps_eml(chemin):
    with open(chemin, "rb") as f:
        msg = email.message_from_binary_file(f, policy=email.policy.default)
    date = None
    try:
        date = email.utils.parsedate_to_datetime(msg["date"]).date()
    except Exception:
        pass
    corps = msg.get_body(preferencelist=("html", "plain"))
    return (corps.get_content() if corps else ""), date, str(msg["subject"] or "")


# ------------------------------------------------------------------ analyse du mail Newsdesk

def _date_nd(texte):
    m = RE_DATE_ND.search(texte)
    if not m:
        return None, None
    mo = MOIS_EN.get(m.group(2).lower())
    try:
        return dt.date(int(m.group(3)), mo, int(m.group(1))), m
    except (TypeError, ValueError):
        return None, None


def _dans(el, ancre):
    p = el.parent
    while p is not None:
        if p is ancre:
            return True
        p = p.parent
    return False


def articles_newsdesk(contenu):
    """Retourne une liste de dicts {titre, lien_newsdesk, id_nd, publication, date, extrait}."""
    if "<" not in contenu:
        return _articles_texte(contenu)
    soupe = BeautifulSoup(contenu, "html.parser")
    titres = [a for a in soupe.find_all("a", href=True) if "newsdesk.lexisnexis.com/click" in deballer_lien(a["href"])]
    sortie, vus = [], set()
    for k, a in enumerate(titres):
        lien = deballer_lien(a["href"])
        ident = (parse_qs(urlparse(lien).query).get("a") or [""])[0]
        titre = espaces(a.get_text(" "))
        if not titre or (ident and ident in vus):
            continue
        suivant = titres[k + 1] if k + 1 < len(titres) else None
        publication, morceaux = "", []
        for el in a.next_elements:
            if el is suivant:
                break
            if isinstance(el, Tag) and el.name == "a" and el is not a and not publication:
                publication = espaces(el.get_text(" "))
            elif isinstance(el, NavigableString) and not _dans(el, a):
                par = el.parent
                if par is not None and par.name == "a":
                    continue
                if par is not None and any(isinstance(x, Tag) and x.name == "a" and x is not a for x in el.parents):
                    continue
                morceaux.append(str(el))
        bloc = espaces(" ".join(morceaux))
        bloc = PIED.split(bloc)[0]
        date, m = _date_nd(bloc)
        extrait = espaces(bloc[m.end():]) if m else bloc
        publication = re.sub(r"\s*\(additional subscription may be required\)", "", publication).strip()
        vus.add(ident)
        sortie.append({"titre": titre[:300], "lien_newsdesk": lien, "id_nd": ident, "publication": publication,
                       "date": date, "extrait": extrait[:1500],
                       "abonnement": "subscription may be required" in bloc or "subscription may be required" in
                                     espaces(a.find_next("a").get_text(" ") if a.find_next("a") else "")})
    return sortie


def _articles_texte(contenu):
    """Corps texte brut (repli) : « Titre <https://…newsdesk…click…> »."""
    sortie = []
    for m in re.finditer(r"([^\n<]{15,300})\s*<(https?://[^>]+)>", contenu):
        lien = deballer_lien(m.group(2))
        if "newsdesk.lexisnexis.com/click" not in lien:
            continue
        ident = (parse_qs(urlparse(lien).query).get("a") or [""])[0]
        suite = contenu[m.end():m.end() + 800]
        date, md = _date_nd(suite)
        sortie.append({"titre": espaces(m.group(1)), "lien_newsdesk": lien, "id_nd": ident, "publication": "",
                       "date": date, "extrait": espaces(suite[md.end():] if md else suite)[:1500], "abonnement": False})
    return sortie


def lien_public(item, client=None, cache=None, budget=None):
    """Adresse publiable : l'URL finale de l'article (redirection Newsdesk suivie
    pendant la collecte), sinon une recherche du titre. Jamais le lien Newsdesk
    brut (il contient des identifiants d'abonné)."""
    cle = item.get("id_nd")
    if cache is not None and cle and cache.get(cle):
        return cache[cle]
    final = ""
    if client is not None and item.get("lien_newsdesk") and (budget is None or budget[0] > 0):
        if budget is not None:
            budget[0] -= 1
        try:
            r = client.s.get(item["lien_newsdesk"], timeout=15, allow_redirects=True, stream=True)
            r.close()
            u = r.url
            if u.startswith("http") and "lexisnexis" not in urlparse(u).netloc and "urldefense" not in u:
                final = re.sub(r"[?&](utm_[^&]+)", "", u)
        except Exception:
            pass
    if not final:
        final = "https://www.google.com/search?q=" + quote_plus('"%s" %s' % (item["titre"][:150], item.get("publication", "")))
    elif cache is not None and cle:
        cache[cle] = final
    return final


# ------------------------------------------------------------------ Word (texte d'articles payants, facultatif)

def articles_du_word(chemin):
    import docx
    doc = docx.Document(chemin)
    articles, courant = [], None
    for par in doc.paragraphs:
        texte = par.text.strip()
        if not texte:
            continue
        style = (par.style.name if par.style is not None else "").lower()
        runs = [r for r in par.runs if r.text.strip()]
        titre = style.startswith(("heading", "titre", "title")) or (12 <= len(texte) <= 220 and runs and all(r.bold for r in runs))
        if titre:
            if courant:
                articles.append(courant)
            courant = {"titre": texte, "texte": []}
        elif courant:
            courant["texte"].append(texte)
    if courant:
        articles.append(courant)
    return [(a["titre"], " ".join(a["texte"])) for a in articles if a["texte"]]


def _cle(titre):
    return re.sub(r"\W+", " ", _sa(titre).lower()).strip()[:80]


def lire_rkc(dossier, aujourdhui, client=None, cache_liens=None, max_resolutions=250):
    """Retourne (articles, rapport). Chaque article : titre, lien (public), date,
    source (publication), texte (PRIVÉ), payant, zone, id_nd."""
    rapport = {"fichiers": 0, "mails": 0, "word": 0, "erreurs": [], "articles_lus": 0}
    if not os.path.isdir(dossier):
        return [], rapport
    par_cle = {}
    budget = [max_resolutions]
    fichiers = sorted(glob.glob(os.path.join(dossier, "**", "*"), recursive=True))
    for f in fichiers:
        ext = f.lower().rsplit(".", 1)[-1]
        if ext not in ("eml", "msg"):
            continue
        rapport["fichiers"] += 1
        try:
            contenu, date_mail, _sujet = (_corps_eml if ext == "eml" else _corps_msg)(f)
        except Exception as e:
            rapport["erreurs"].append("%s : %s" % (os.path.basename(f), str(e)[:120]))
            continue
        rapport["mails"] += 1
        date_defaut = date_mail or date_depuis_nom(os.path.basename(f), aujourdhui) or aujourdhui
        items = articles_newsdesk(contenu)
        rapport["articles_lus"] += len(items)
        if not items:
            rapport["erreurs"].append("%s : aucun article Newsdesk reconnu" % os.path.basename(f))
        for it in items:
            cle = it["id_nd"] or _cle(it["titre"])
            if cle in par_cle or _cle(it["titre"]) in {_cle(x["titre"]) for x in par_cle.values()}:
                continue  # même article (ou même titre repris par plusieurs sites)
            par_cle[cle] = {"titre": it["titre"], "lien": lien_public(it, client, cache_liens, budget),
                            "date": it["date"] or date_defaut, "texte": it["extrait"], "source": it["publication"],
                            "payant": bool(it["abonnement"]), "id_nd": it["id_nd"], "fichier": os.path.basename(f)}
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
        for titre, texte in arts:
            c = _cle(titre)
            proche = next((k for k, v in par_cle.items() if _cle(v["titre"])[:40] == c[:40]), None)
            if proche:
                par_cle[proche]["texte"] = texte
                par_cle[proche]["payant"] = True
    articles = []
    for a in par_cle.values():
        a["zone"] = zone_probable(a["titre"] + " " + a["texte"])
        articles.append(a)
    return articles, rapport
