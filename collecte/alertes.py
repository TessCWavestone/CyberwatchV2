"""
Cyber Watch — « Points clés » (v5) : liste d'alertes STABLE, sans IA générative.

Une alerte n'est pas un article : c'est un FAIT réglementaire qui peut concerner
l'entreprise dans un de ses pays (ou au niveau européen). Plusieurs articles sur
le même fait (même texte, même pays, même étape) forment UNE alerte.

Types (ordre de priorité affiché sur le site) :
  1. echeance     échéance d'un texte dans les 3 mois (date d'obligation, jamais un événement)
  2. adopte       nouveau texte adopté, publié ou entrant en vigueur
  2. signale      jugé « important » par un lecteur
  3. proposition  proposition, projet de loi, consultation ou lignes directrices officielles
  4. a_qualifier  nouveau texte INCONNU (absent de la liste des textes suivis) repéré par
                  des signaux forts : à qualifier par un humain
Une alerte reste affichée 6 mois après son dernier article (ou jusqu'à son échéance),
puis passe dans « Points clés précédents ». Le registre (data/alertes.json) garde la
date de première détection : « Nouveau » sur le site = détecté depuis la dernière visite.
"""

import datetime as dt
import hashlib
import html
import os
import re

import regles

DUREE_ACTIVE = 183          # jours d'affichage après le dernier article
HORIZON_ECHEANCE = 90       # échéances retenues comme alertes : dans les 3 mois
GARDE_ARCHIVES = 730        # « Points clés précédents » : 2 ans

TYPE_STATUT = {"adopte": "adopte", "en_vigueur": "adopte", "projet": "proposition",
               "consultation": "proposition", "lignes_directrices": "proposition"}

# Pas une nouvelle règle : revues périodiques, consultations closes, simples commentaires
EXCLUS = re.compile(
    r"\[(closed|clos|cloturee|fermee|ferme)\]|consultation (closed|cloturee|terminee)|weekly review|viikkokatsaus|"
    r"newsletter|lettre d'information|bulletin (hebdo|mensuel)|week \d+|semaine \d+|"
    r"top \d+|\d+ (things|tips|steps|key takeaways)|webinar|webinaire|podcast|"
    r"what (it|they|this) means?|ce qu'il faut (savoir|retenir)|how to (prepare|comply)|comment se preparer", re.I)

# Texte INCONNU : il faut un sujet au cœur de la veille (cyber, données, dispositifs médicaux, IA, santé
# numérique) ; « diagnostic », « laboratoire » ou « biologie » seuls ne suffisent pas (ex. décrets sur
# les maladies professionnelles au Journal officiel).
SUJET_ALERTE = re.compile(
    r"cyber|kyber|ciber|kiber|κυβερνο|securite (informatique|numerique|des (reseaux|systemes))|information security|"
    r"informationssicherheit|it-sicherheit|tietoturva|informationssakerhet|informasjonssikkerhet|"
    r"data protection|protection des donnees|datenschutz|proteccion de datos|protezione dei dati|gegevensbescherming|"
    r"personal data|donnees (personnelles|de sante)|health data|gesundheitsdaten|dane osobowe|tietosuoja|"
    r"data (act|governance|management act)|gouvernance des donnees|"
    r"dispositifs? medica|medical devices?|medizinprodukt|producto sanitario|dispositivi medici|medische hulpmiddel|"
    r"wyrob\w* medyczn|in vitro|\bivd\b|intelligence artificielle|artificial intelligence|kunstliche intelligenz|"
    r"inteligencia artificial|intelligenza artificiale|sztuczn\w* inteligencj|\bAI\b|\bIA\b|\bKI\b|ai-system|"
    r"cloud|logiciel|software|interoperab|e-?sante|e-?health|digital health|sante numerique|telemedecin|"
    r"dossier (medical|patient)|patient record|patientenakte|vulnerab|ransomware|chiffrement|encryption|cryptograph|"
    r"identite numerique|eidas|critical (infrastructure|entities)|infrastructures? critiques|entites critiques|kritis|"
    r"resilience operationnelle|incident", re.I)

ZONES_EN = {"Europe": "Europe (EU)", "Union européenne": "European Union", "Allemagne": "Germany", "Autriche": "Austria",
            "Belgique": "Belgium", "Bulgarie": "Bulgaria", "Danemark": "Denmark", "Espagne": "Spain", "Finlande": "Finland",
            "France": "France", "Grèce": "Greece", "Hongrie": "Hungary", "Italie": "Italy", "Norvège": "Norway",
            "Pays-Bas": "Netherlands", "Pologne": "Poland", "Portugal": "Portugal", "République tchèque": "Czech Republic",
            "Rép. Tchèque": "Czech Republic", "Royaume-Uni": "United Kingdom", "Suède": "Sweden", "Suisse": "Switzerland",
            "Irlande": "Ireland", "Luxembourg": "Luxembourg", "Worldwide": "Worldwide", "Monde": "Worldwide"}

LIB_TYPE = {
    "fr": {"echeance": "Échéance", "adopte": "Nouveau texte adopté", "signale": "Signalé par un lecteur",
           "proposition": "Texte en préparation", "a_qualifier": "Nouveau texte détecté — à qualifier"},
    "en": {"echeance": "Deadline", "adopte": "New text adopted", "signale": "Flagged by a reader",
           "proposition": "Text in preparation", "a_qualifier": "New text detected — to be assessed"},
}


def _ident(cle):
    return "k" + hashlib.sha1(cle.encode("utf-8")).hexdigest()[:11]


def _date(s):
    try:
        return dt.date.fromisoformat((s or "")[:10])
    except ValueError:
        return None


def _europeen(a):
    return a.get("zone") in regles.EUROPE or bool(a.get("textes_cles"))


def _apercu(a):
    """Ce que l'alerte garde d'un article (l'article peut sortir du site après 2 ans)."""
    tr = {lg: {"titre": (x or {}).get("titre", "")} for lg, x in (a.get("trad") or {}).items() if (x or {}).get("titre")}
    return {k: v for k, v in {
        "id": a["id"], "titre": a["titre"], "langue": a.get("langue", ""), "trad": tr, "lien": a.get("lien", ""),
        "source": a.get("source", ""), "zone": a.get("zone", ""), "date": a.get("date", ""), "detecte_le": a.get("detecte_le", ""), "version": a.get("version", ""),
        "statut": a.get("statut", ""), "nature": a.get("nature", ""), "a_verifier": a.get("a_verifier", False),
        "payant": a.get("payant", False)}.items() if v not in ("", None, False, {})}


def type_article(a):
    """Type d'alerte d'un article, ou None (pas une alerte)."""
    if a.get("base") or a.get("doublon_de") or a.get("nature") == "opinion" or a.get("debat"):
        return None
    if a.get("motif") == "jugé important par un lecteur":
        return "signale"
    if not a.get("essentiel") or a.get("pertinence") != "elevee" or not _europeen(a):
        return None
    texte = regles.texte_article(a)
    if EXCLUS.search(texte):
        return None
    t = TYPE_STATUT.get(a.get("statut") or "")
    if t == "proposition" and a.get("statut") == "lignes_directrices" and a.get("nature") != "officielle":
        return None   # des lignes directrices commentées par la presse ne sont pas une nouvelle règle
    inconnu = not a.get("textes_cles")
    if inconnu:
        if not SUJET_ALERTE.search(texte):
            return None
        return "a_qualifier" if (t or regles.SIGNAL_FORT.search(texte)) else None
    return t


def construire(liste, ancien, referentiel, aujourdhui, plancher=None):
    """Recalcule les alertes à partir des articles du site ; garde du registre précédent
    la date de première détection et les alertes dont les articles ont été purgés."""
    groupes = {}

    def ajouter(cle, type_, a, extra=None):
        g = groupes.setdefault(cle, {"type": type_, "articles": [], "extra": extra or {}})
        if a is not None and all(x["id"] != a["id"] for x in g["articles"]):
            g["articles"].append(a)

    for a in liste:
        t = type_article(a)
        if not t:
            continue
        texte = (a.get("textes_cles") or [""])[0]
        etape = "proposition" if t == "proposition" else ("adopte" if t in ("adopte", "signale") else t)
        if t == "a_qualifier" or not texte:
            cle = "art|" + a["id"]
        else:
            cle = "|".join(("txt", texte, a.get("zone", ""), etape))
        ajouter(cle, t, a, {"texte": texte, "inconnu": t == "a_qualifier"})

    # Échéances : dates d'obligation proches, tirées des textes applicables et des articles importants.
    # Une même date dans un même pays = une seule alerte (le texte applicable en priorité).
    lim_haut = aujourdhui + dt.timedelta(days=HORIZON_ECHEANCE)
    lim_bas = max(aujourdhui - dt.timedelta(days=GARDE_ARCHIVES), plancher or dt.date.min)
    par_jour = {}
    for r in (referentiel or {}).get("textes", []):
        d = _date(r.get("applicable_depuis"))
        if not d or d > lim_haut or d < lim_bas:
            continue
        cle = "ref|%s|%s|%s" % (r.get("acronyme") or r.get("nom"), r.get("zone", ""), d.isoformat())
        par_jour.setdefault((r.get("zone", ""), d.isoformat()), cle)
        ajouter(cle, "echeance", None, {"texte": r.get("acronyme") or "", "echeance": d.isoformat(), "zone": r.get("zone", ""),
                                        "ref": {"nom": r.get("nom_fr") or r.get("nom", ""), "nom_en": r.get("nom_en", ""),
                                                "lien": r.get("lien", ""), "autorite": r.get("autorite", ""),
                                                "resume_fr": r.get("resume_fr", ""), "resume_en": r.get("resume_en", "")}})
    for a in liste:
        if a.get("doublon_de") or not (a.get("essentiel") or a.get("base")) or a.get("pertinence") not in ("elevee", "moyenne"):
            continue
        for e in a.get("echeances") or []:
            d = _date(e.get("date"))
            if not d or e.get("approx") or d > lim_haut or d < lim_bas:
                continue
            texte = (a.get("textes_cles") or a.get("tags") or [""])[0]
            cle = par_jour.get((a.get("zone", ""), d.isoformat()))
            if not cle:
                cle = "ech|%s|%s|%s" % (texte or a["id"], a.get("zone", ""), d.isoformat())
                par_jour[(a.get("zone", ""), d.isoformat())] = cle
            ajouter(cle, "echeance", a, {"texte": texte, "echeance": d.isoformat(), "extrait": e.get("extrait") or {}})

    anciens = {x["id"]: x for x in (ancien or {}).get("alertes", [])}
    ids_liste = {a["id"] for a in liste}
    alertes = []
    for cle, g in groupes.items():
        arts = sorted(g["articles"], key=lambda a: (a.get("date", ""), a.get("detecte_le", "")), reverse=True)
        ex = g["extra"]
        detecte = min([a.get("detecte_le") or a.get("date", "") for a in arts] or [aujourdhui.isoformat()])
        maj = max([a.get("detecte_le") or a.get("date", "") for a in arts] or [detecte])
        dernier = max([a.get("date", "") for a in arts] or [ex.get("echeance", "")])
        ident = _ident(cle)
        prec = anciens.get(ident)
        versions = sorted(a.get("version") or "" for a in arts if a.get("version") not in (None, "", "base"))
        version = versions[0] if versions else ""
        if prec:
            detecte = min(detecte, prec.get("detecte_le") or detecte)
            version = prec.get("version") or version
        if g["type"] == "echeance":
            fin = ex["echeance"]
        else:
            base_fin = max(_date(dernier) or aujourdhui, _date(maj) or aujourdhui)
            fin = (base_fin + dt.timedelta(days=DUREE_ACTIVE)).isoformat()
        al = {"id": ident, "type": g["type"], "texte": ex.get("texte", ""), "inconnu": ex.get("inconnu", False),
              "zone": ex.get("zone") or (arts[0].get("zone", "") if arts else ""), "detecte_le": detecte, "maj_le": maj,
              "date": dernier, "fin": fin, "version": version, "version_maj": versions[-1] if versions else "", "articles": [_apercu(a) for a in arts[:6]], "nb_articles": len(arts),
              "a_verifier": bool(arts) and all(a.get("a_verifier") for a in arts)}
        if g["type"] == "echeance":
            al["echeance"] = ex["echeance"]
            if ex.get("extrait"):
                al["extrait"] = ex["extrait"]
            if ex.get("ref"):
                al["ref"] = ex["ref"]
        alertes.append(al)

    # alertes anciennes dont les articles ont quitté le site (conservation) : gardées comme historique
    nouveaux = {a["id"] for a in alertes}
    for ident, x in anciens.items():
        if ident in nouveaux:
            continue
        if any(ar["id"] in ids_liste for ar in x.get("articles", [])):
            continue   # l'article est toujours là mais n'est plus une alerte (avis d'un lecteur, règles) : retirée
        if (_date(x.get("fin")) or aujourdhui) >= aujourdhui - dt.timedelta(days=GARDE_ARCHIVES):
            alertes.append(x)

    for x in alertes:
        x["active"] = (_date(x["fin"]) or aujourdhui) >= aujourdhui
    alertes.sort(key=lambda x: (not x["active"], x.get("detecte_le", "")), reverse=False)
    return alertes


# --------------------------------------------------------------------------- flux RSS

def _titre_langue(ap, lg):
    if ap.get("langue") == lg:
        return ap["titre"]
    return ((ap.get("trad") or {}).get(lg) or {}).get("titre") or ((ap.get("trad") or {}).get("en") or {}).get("titre") or ap["titre"]


def titre_alerte(al, lg):
    if al.get("ref"):
        r = al["ref"]
        nom = r.get("nom_en") if lg == "en" and r.get("nom_en") else r.get("nom", "")
        return nom
    return _titre_langue(al["articles"][0], lg) if al.get("articles") else al.get("texte", "")


def ecrire_rss(alertes, dossier, url_site, aujourdhui):
    """Un flux RSS par langue (data/points_cles_fr.xml / _en.xml) : abonnement possible dans Outlook."""
    actives = sorted([a for a in alertes if a.get("active")], key=lambda a: a.get("detecte_le", ""), reverse=True)[:60]
    for lg in ("fr", "en"):
        items = []
        for al in actives:
            lib = LIB_TYPE[lg].get(al["type"], al["type"])
            zone = ZONES_EN.get(al.get("zone"), al.get("zone")) if lg == "en" else al.get("zone", "")
            titre = "%s — %s (%s)" % (lib, titre_alerte(al, lg), zone)
            lien = (al.get("ref") or {}).get("lien") or ((al.get("articles") or [{}])[0].get("lien")) or url_site
            desc = []
            if al.get("echeance"):
                desc.append(("Deadline: " if lg == "en" else "Échéance : ") + al["echeance"])
            if al.get("texte"):
                desc.append("Text: " + regles.LIBELLES_EN.get(al["texte"], al["texte"]) if lg == "en" else "Texte : " + al["texte"])
            n = al.get("nb_articles", 0)
            if n > 1:
                desc.append(("%d sources" % n))
            if al.get("a_verifier"):
                desc.append("To be checked on the official source" if lg == "en" else "À vérifier sur la source officielle")
            desc.append(('<a href="%s">%s</a>' % (html.escape(url_site + ("?lang=en" if lg == "en" else "") + "#essentiel"),
                                                  "Open the watch" if lg == "en" else "Ouvrir la veille")) if url_site else "")
            d = _date(al.get("detecte_le")) or aujourdhui
            pub = dt.datetime(d.year, d.month, d.day, 7, 0, tzinfo=dt.timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")
            items.append("<item><title>%s</title><link>%s</link><guid isPermaLink=\"false\">%s</guid><pubDate>%s</pubDate>"
                         "<description>%s</description></item>" % (
                             html.escape(titre), html.escape(lien), al["id"] + "-" + al.get("maj_le", ""), pub,
                             html.escape(" · ".join(x for x in desc if x))))
        canal = ("Cyber Watch — Key points" if lg == "en" else "Cyber Watch — Points clés")
        xml = ('<?xml version="1.0" encoding="utf-8"?>\n<rss version="2.0"><channel><title>%s</title><link>%s</link>'
               '<description>%s</description><language>%s</language>%s</channel></rss>\n') % (
            html.escape(canal), html.escape(url_site or ""),
            html.escape("Regulatory watch — priority alerts (Wavestone)" if lg == "en" else "Veille réglementaire — alertes prioritaires (Wavestone)"),
            lg, "".join(items))
        with open(os.path.join(dossier, "points_cles_%s.xml" % lg), "w", encoding="utf-8") as f:
            f.write(xml)
