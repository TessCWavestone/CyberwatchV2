"""
Cyber Watch — repérage des dates clés (échéances) citées dans un texte, sans IA.

Cherche les dates écrites dans le titre et le résumé (« d'ici le 11 septembre
2026 », « applicable from 2 August 2027 », « bis zum 31.12.2026 », « a partir
del 1 de enero de 2027 »…), dans toutes les langues de la veille, et garde
celles qui tombent entre 45 jours dans le passé et 3 ans dans le futur (hors
date de publication de l'article). Chaque date est gardée avec un court extrait
du texte autour d'elle, pour que le lecteur voie de quoi il s'agit.
"""

import datetime as dt
import re
import unicodedata

MOIS = {
    "janvier": 1, "janv": 1, "january": 1, "jan": 1, "januar": 1, "enero": 1, "gennaio": 1, "januari": 1,
    "janeiro": 1, "stycznia": 1, "ledna": 1, "januar": 1, "tammikuuta": 1, "ianouariou": 1,
    "fevrier": 2, "fevr": 2, "february": 2, "feb": 2, "februar": 2, "febrero": 2, "febbraio": 2, "februari": 2,
    "fevereiro": 2, "lutego": 2, "unora": 2, "helmikuuta": 2,
    "mars": 3, "march": 3, "mar": 3, "marz": 3, "marzo": 3, "maart": 3, "marts": 3, "marco": 3, "marca": 3,
    "brezna": 3, "maaliskuuta": 3,
    "avril": 4, "april": 4, "apr": 4, "abril": 4, "aprile": 4, "kwietnia": 4, "dubna": 4, "huhtikuuta": 4,
    "mai": 5, "may": 5, "mayo": 5, "maggio": 5, "mei": 5, "maj": 5, "maio": 5, "maja": 5, "kvetna": 5,
    "toukokuuta": 5,
    "juin": 6, "june": 6, "jun": 6, "juni": 6, "junio": 6, "giugno": 6, "junho": 6, "czerwca": 6, "cervna": 6,
    "kesakuuta": 6,
    "juillet": 7, "july": 7, "jul": 7, "juli": 7, "julio": 7, "luglio": 7, "julho": 7, "lipca": 7,
    "cervence": 7, "heinakuuta": 7,
    "aout": 8, "august": 8, "aug": 8, "agosto": 8, "augustus": 8, "augusti": 8, "sierpnia": 8, "srpna": 8,
    "elokuuta": 8,
    "septembre": 9, "september": 9, "sept": 9, "sep": 9, "septiembre": 9, "settembre": 9, "setembro": 9,
    "wrzesnia": 9, "zari": 9, "syyskuuta": 9,
    "octobre": 10, "october": 10, "oct": 10, "oktober": 10, "octubre": 10, "ottobre": 10, "outubro": 10,
    "pazdziernika": 10, "rijna": 10, "lokakuuta": 10,
    "novembre": 11, "november": 11, "nov": 11, "noviembre": 11, "novembro": 11, "listopada": 11,
    "listopadu": 11, "marraskuuta": 11,
    "decembre": 12, "december": 12, "dec": 12, "dezember": 12, "diciembre": 12, "dicembre": 12,
    "desember": 12, "dezembro": 12, "grudnia": 12, "prosince": 12, "joulukuuta": 12,
}
# mois grecs (génitif) et hongrois
MOIS.update({"ιανουαριου": 1, "φεβρουαριου": 2, "μαρτιου": 3, "απριλιου": 4, "μαιου": 5, "ιουνιου": 6,
             "ιουλιου": 7, "αυγουστου": 8, "σεπτεμβριου": 9, "οκτωβριου": 10, "νοεμβριου": 11, "δεκεμβριου": 12,
             "januar": 1, "februar": 2, "marcius": 3, "aprilis": 4, "majus": 5, "junius": 6, "julius": 7,
             "augusztus": 8, "szeptember": 9, "oktober": 10, "november": 11, "december": 12})

MOT = r"([^\W\d_]{3,13})"
RE_ISO = re.compile(r"\b(20\d\d)-(\d\d)-(\d\d)\b")
RE_NUM = re.compile(r"\b(\d{1,2})[./](\d{1,2})[./](20\d\d)\b")
RE_JMA = re.compile(r"\b(\d{1,2})(?:er|st|nd|rd|th|\.|º|°)?\s+(?:de\s+|di\s+)?" + MOT + r"\.?,?\s+(?:de\s+|del\s+)?(20\d\d)\b")
RE_MJA = re.compile(r"\b" + MOT + r"\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d\d)\b")
RE_HU = re.compile(r"\b(20\d\d)\.\s?(\d{1,2})\.\s?(\d{1,2})\.")
RE_MA = re.compile(r"\b" + MOT + r"\s+(?:de\s+|del\s+)?(20\d\d)\b")   # « septembre 2027 » (jour inconnu)


def _sans_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()


def _date(a, m, j):
    try:
        return dt.date(int(a), int(m), int(j))
    except ValueError:
        return None


def _mois(mot):
    return MOIS.get(_sans_accents(mot).rstrip("."))


def trouver_dates(texte):
    """Liste de (date, approx, début, fin) pour toutes les dates écrites dans le texte."""
    res, pris = [], []

    def libre(a, b):
        return not any(a < f and b > d for d, f in pris)

    def ajoute(d, approx, m):
        if d and libre(*m.span()):
            res.append((d, approx, m.start(), m.end()))
            pris.append(m.span())

    for m in RE_ISO.finditer(texte):
        ajoute(_date(*m.groups()), False, m)
    for m in RE_HU.finditer(texte):
        ajoute(_date(*m.groups()), False, m)
    for m in RE_NUM.finditer(texte):
        ajoute(_date(m.group(3), m.group(2), m.group(1)), False, m)
    for m in RE_JMA.finditer(texte):
        mo = _mois(m.group(2))
        if mo:
            ajoute(_date(m.group(3), mo, m.group(1)), False, m)
    for m in RE_MJA.finditer(texte):
        mo = _mois(m.group(1))
        if mo:
            ajoute(_date(m.group(3), mo, m.group(2)), False, m)
    for m in RE_MA.finditer(texte):
        mo = _mois(m.group(1))
        if mo:
            ajoute(_date(m.group(2), mo, 1), True, m)
    return res


def _extrait(texte, debut, fin, largeur=90):
    a = max(0, debut - largeur)
    b = min(len(texte), fin + largeur)
    # on coupe proprement sur des mots
    morceau = texte[a:b]
    if a > 0:
        morceau = "…" + morceau.split(" ", 1)[-1]
    if b < len(texte):
        morceau = morceau.rsplit(" ", 1)[0] + "…"
    return morceau.strip()


# Une date n'est une échéance que si un mot d'obligation / d'application est tout près
# (sinon : date d'un webinaire, d'une réunion, d'un rapport…)
OBLIGATION = re.compile(
    r"deadline|due|by\b|no later than|until|from\b|as of|starting|applicab|appl(y|ies)|in force|into force|effect|mandatory|"
    r"must|obligat|required|comply|compliance|transpos|registration|report(ing)?\b|submit|"
    r"d'ici|au plus tard|avant le|a compter|a partir|des le|date limite|echeance|entree en vigueur|applicable|obligatoire|"
    r"doivent|devront|transposition|enregistrement|notification|"
    r"bis (zum|spatestens)|spatestens|ab dem|ab \d|frist|inkrafttreten|in kraft|gilt ab|verpflicht|"
    r"antes del|a partir del|plazo|entrada en vigor|obligatori|entro il|a decorrere|entrata in vigore|scadenza|"
    r"ate|prazo|entrada em vigor|uiterlijk|vanaf|inwerkingtreding|verplicht|do dnia|od dnia|termin|wchodzi w zycie|"
    r"lhut|do \d|od \d|ucinnost|senest|fra og med|fran och med|senast|trader i kraft|viimeistaan|alkaen|voimaan|"
    r"hatarid|-ig\b|hatalyba|εως|απο|προθεσμ|ισχυ", re.I)
EVENEMENT = re.compile(r"webinar|webinaire|conference|congres|\bevent|evenement|register (now|here|for)|inscri(vez|ption)|"
                       r"rencontres?\b|participez|colloque|assises|journee (d'etude|nationale|d'information)|table ronde|"
                       r"join us|meet us|forum|salon\b|conferencia|jornadas?\b|convegno|tagung|konferenz|kongress|save the date|workshop|atelier|"
                       r"seminar|forum|summit|sommet|meeting|reunion|tagung|veranstaltung|jornada|evento|podcast|live\b", re.I)


# D3 (décision du 29/10) : seules les dates importantes des réglementations sont gardées (entrée en vigueur,
# application, mise en conformité, enregistrement ou notification). Ne sont PAS des échéances : la fin d'une
# consultation, une étape de procédure (vote, lecture, rapport attendu), la date d'une décision ou d'une
# sanction, la date de publication d'un document, une réunion ou une signature.
NON_REGLEMENTAIRE = re.compile(
    r"consultation|consulta(cion|zione|cao)?\b|public opinion|comments?\b|commentaires|feedback|call for (evidence|input|views)|"
    r"have your say|appel a (contributions|commentaires)|stellungnahme|konsultation|hoering|horing|remiss|lausunto|konsultac|"
    r"διαβουλευσ|\bvote\b|voting|plenary|pleniere|committee|commission (des|parlementaire)|report stage|etape du rapport|"
    r"reading|lecture\b|scheduled|programmee?|final report|rapport final|due to (report|present)|"
    r"date of (the )?(final )?decision|date de (la )?decision|decision finale|(by|with the|par) (a |une )?(decision|provision)|"
    r"decision (of|du|n)|disposition n|provision n|provvedimento|deliberazione|bescheid|resolucion de|"
    r"published (on|in|by)|publiee?s? le|report published|rapport publie|issued on|signed|signee? le|assinado|unterzeichnet|"
    r"took place|s'est (tenue?|deroulee?)|a eu lieu|uskutecnil|ve dnech|meeting|reunion|procedure runs|approval procedure|"
    r"\b(by|av|von|door|par) [a-z]+ [a-z]+ \d|\b\d{1,2} ?[:h] ?\d{2}\b|\b\d{1,2}\.\d{2} ?(am|pm|uhr)\b|matinee|informations pratiques|practical information|"
    r"mission\b|delegation", re.I)
# mot d'obligation réglementaire tout près de la date : la date est gardée même si un mot ci-dessus est proche
# (ex. « mise en œuvre complète prévue le 28 octobre 2026 » d'une loi IA, « entrée en vigueur programmée »)
FORT = re.compile(
    r"en vigueur|into force|in force|en application|applicab|appl(y|ies)\b|s'appliqu|mise en (oeuvre|œuvre) complete|"
    r"conform|complian|enregistr|registration|transpos|obligat|\bmust\b|doivent|devront|deadline|echeance|date limite|"
    r"in kraft|gilt ab|verpflicht|entrada en vigor|entrata in vigore|wchodzi w zycie|trader i kraft|voimaan", re.I)
TITRE_CONSULTATION = re.compile(r"consultation|consulta\b|consultazione|konsultation|have your say|call for evidence|"
                                r"appel a contributions|horing|remiss|lausunto|konsultac|διαβουλευσ", re.I)


# 31/10 : la date de PUBLICATION d'un texte réglementaire est gardée (Journal officiel, loi, décret, règlement,
# directive, norme harmonisée) : elle déclenche souvent l'entrée en vigueur. Pas celle d'un rapport ou d'un article.
TEXTE_REG = (r"(loi|decret|arrete|ordonnance|reglement|directive|regulation|decree|law|act|bill|gesetz\w*|verordnung|"
             r"richtlinie|ley|real decreto|legge|decreto|ustaw\w*|norme harmonisee|harmoni[sz]ed standard)")
PUBLICATION_TEXTE = re.compile(
    r"(journal officiel|official journal|gazzetta ufficiale|\bboe\b|bundesgesetzblatt|dziennik ustaw|staatsblad|"
    r"diario da republica|magyar kozlony|sbirka zakonu|\bdou[er]\b)|"
    r"\b" + TEXTE_REG + r"\b.{0,60}\b(publi\w*|parution|veroffentlicht|pubblicat\w*|publicad\w*|opublikowan\w*)|"
    r"\b(publi\w*|parution|veroffentlich\w*|pubblicat\w*|publicad\w*)\b.{0,40}\b" + TEXTE_REG + r"\b", re.I)


def _publication(texte, debut, fin):
    proche = _sans_accents(texte[max(0, debut - 90):fin + 40])
    return bool(PUBLICATION_TEXTE.search(proche)) and not EVENEMENT.search(proche)


def _contexte_ok(texte, debut, fin):
    fen = _sans_accents(texte[max(0, debut - 110):fin + 60])
    proche = _sans_accents(texte[max(0, debut - 70):fin + 40])
    if not OBLIGATION.search(fen) or EVENEMENT.search(fen):
        return False
    if FORT.search(proche):
        return True
    # D3 : pas de date de consultation, d'étape de procédure, de décision, de publication ou de réunion ; dans un
    # article sur une consultation, seule une date d'obligation (entrée en vigueur, application…) est gardée
    return not NON_REGLEMENTAIRE.search(proche) and not TITRE_CONSULTATION.search(_sans_accents(texte[:160]))


def extraire(textes_par_langue, date_article, aujourdhui, passe=45, futur_ans=3, maxi=3):
    """textes_par_langue : {"fr": "…", "en": "…", "de": "…"}. Retourne une liste
    [{"date": "AAAA-MM-JJ", "approx": bool, "extrait": {langue: texte}}]."""
    mini = aujourdhui - dt.timedelta(days=passe)
    maxd = aujourdhui + dt.timedelta(days=365 * futur_ans)
    trouvees = {}
    for langue, texte in textes_par_langue.items():
        if not texte:
            continue
        for d, approx, deb, fin in trouver_dates(texte):
            if not (mini <= d <= maxd) or (date_article and d == date_article):
                continue
            pub = False
            if not _contexte_ok(texte, deb, fin):
                if not _publication(texte, deb, fin):
                    continue
                pub = True   # date de publication d'un texte : affichée, mais jamais une « Échéance » des points clés
            cle = d.isoformat()
            e = trouvees.setdefault(cle, {"date": cle, "approx": approx, "extrait": {}})
            if pub and "publication" not in e and len(e["extrait"]) == 0:
                e["publication"] = True
            elif not pub:
                e.pop("publication", None)
            e["approx"] = e["approx"] and approx
            e["extrait"].setdefault(langue, _extrait(texte, deb, fin))
    # les plus proches d'abord (échéances à venir avant les dates passées)
    liste = sorted(trouvees.values(), key=lambda e: (e["date"] < aujourdhui.isoformat(), e["date"]))
    return liste[:maxi]
