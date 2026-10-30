"""
Cyber Watch — « Pressentis et avis d'experts » (v9, décision du 30/10/2026), sans IA générative.

Remplace « Débats et signaux ». Trois sortes d'éléments, regroupés par SUJET :
  - pressenti   : un texte qui n'existe pas encore (intention d'un gouvernement ou de la Commission, stratégie,
                  appel à contributions en amont, travaux préparatoires) ;
  - evolution   : une évolution pressentie d'un texte existant (révision, omnibus, simplification, acte délégué
                  ou d'exécution à venir…) ;
  - avis        : avis d'experts (sources « Avis d'experts (non certifié) ») sur un texte déjà adopté.

Tri strict : sujet cyber et pouvant concerner l'entreprise (réponses de l'IA de tri : sujet « oui », applicable
« oui » ou « incertain », aucune exclusion) ; pour les sources d'experts, la pertinence déjà calculée (gardés
pertinents ou très pertinents seulement).

Mise à jour automatique (cycle de vie) :
  - quand le projet de texte sort (point clé « Projet de texte en cours » ou « Nouveau texte adopté » sur le même
    texte et la même zone, détecté APRÈS le premier signal, avec un article qui annonce un projet ou une
    adoption), le sujet quitte la section : il reste affiché 4 semaines avec « devenu projet de texte le … » ;
  - un avis d'expert sort de la section au bout de 6 mois ; un pressenti sans nouveau signal au bout d'un an.
Le registre data/pressentis.json garde la date du premier signal d'une collecte à l'autre.
"""

import datetime as dt
import hashlib
import re

import alertes
import regles
import tri_ia

DUREE_DEVENU = 28        # jours d'affichage après « devenu projet de texte »
DUREE_AVIS = 183         # un avis d'expert reste 6 mois
DUREE_PRESSENTI = 365    # un pressenti sans nouveau signal reste un an

# Intentions et signaux précoces (titre, sans accents)
PRESSENTI = re.compile(
    r"\bveut\b|\bvoudrait\b|envisag\w*|entend (creer|legiferer|presenter|proposer)|prevoit de|annonce (un|une|la|le) (futur|nouve\w*|projet|loi|texte)|"
    r"\bwants? to\b|\bplans? to\b|\bplanned\b|\bintends? to\b|\bconsider(s|ing)? (a|new|introducing|legislation)|upcoming|forthcoming|future (law|rules|regulation|framework)|"
    r"propos\w* (to )?(establish\w*|creat\w*|introduc\w*|set(ting)? up)|propose de creer|\bagenda\b|"
    r"call for evidence|appel a (contributions|temoignages)|livre blanc|white paper|green paper|livre vert|feuille de route|roadmap|"
    r"work programme|programme de travail|strateg\w*|initiative|exploratory|reflection|"
    r"\bwill\b.{0,30}\b(propose|present|introduce|table)\b|\bsoll(en)?\b|geplant\w*|vorhaben|eckpunkte|"
    r"pretende|planea|intende|prevede di|zamierza|planuje|haluaa|aikoo|vil (indfore|indfoere|innfore)|planerar|overweegt|wil\b", re.I)
# Évolution d'un texte existant
EVOLUTION = re.compile(
    r"revis\w*|\breview\b|reform\w*|amend\w*|omnibus|simplif\w*|fitness check|recast|refonte|"
    r"delegated act|implementing act|acte (delegue|d'execution)|novell\w*|nowelizac\w*|anderung|modifica\w*|"
    r"mise a jour|update of|postpone\w*|report de|delay\w*|\b2\.0\b", re.I)
# Hors du champ de la section (décisions du 09/10, 16/10 et 30/10) : concurrence, consommateurs, DSA / DMA, appels
# à projets et financements, secteurs non suivis
HORS_CHAMP = re.compile(
    r"digital markets act|\bdma\b|digital services act|\bdsa\b|digital fairness|consumer|consommat|competition|concurrence|"
    r"gatekeeper|space act|design act|climate|climat|law enforcement|antitrust|copyright|droit d.auteur|"
    r"call for (projects|proposals)|appel a projets|vyzva|funding|financement|subsid\w*|grant\b|"
    r"\bbank|banque|insurance|assurance|crypto|telecom|spectrum|automotive|automobile|aviation", re.I)


OMNIBUS = re.compile(r"digital omnibus|omnibus (numerique|digital|ia|ai|on ai)|omnibus num", re.I)


def _cle(*parts):
    return "p" + hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:11]


def _date(s):
    try:
        return dt.date.fromisoformat((s or "")[:10])
    except ValueError:
        return None


def _zone(a, texte):
    if texte in alertes.REGLEMENTS_UE and not alertes.LOI_NATIONALE.search(regles.texte_article(a)):
        return "Europe"
    z = a.get("zone", "")
    return "Europe" if (not z or (z in ("Worldwide", "Monde") and texte)) else z


def _nom_inconnu(a):
    """Nom d'un texte encore inconnu cité dans le titre (« Cyber Security Act », « loi sur la cybersécurité »…)."""
    t = a.get("titre", "") + " " + (((a.get("trad") or {}).get("en") or {}).get("titre") or "")
    noms = [m.strip() for m in alertes.RE_NOM_TEXTE.findall(t) if not alertes.NOMS_GENERIQUES.search(m.strip())]
    fr = re.findall(r"\b(loi|projet de loi|reglement|decret)\s+(sur|relative?\s+a|relatif\s+a)\s+((?:l[ae']\s?|les\s+|des\s+)?[\w-]+(?:\s+[\w-]+){0,3})",
                    regles._sa(t), re.I)
    noms += [" ".join(x).strip() for x in fr]
    return max(noms, key=len) if noms else ""


def _ia_ok(a):
    ia = a.get("ia") or {}
    return (ia.get("type") and ia.get("sujet") == "oui" and ia.get("applicable") in ("oui", "incertain")
            and ia.get("exclusion", "aucune") == "aucune" and ia.get("avis") != "pas_pertinent")


def classer(a, opinion):
    """Sorte d'élément (pressenti / evolution / avis) ou None. Titre seulement, pour rester prudent."""
    tt = tri_ia.titres(a)
    if tri_ia.PME.search(tt) or ((tri_ia.PUBLIC_SEUL.search(tt) or tri_ia.DESIGNATION.search(tt)) and not tri_ia.ENTREPRISES.search(tt)):
        return None
    if HORS_CHAMP.search(tt):
        return None
    tc = a.get("textes_cles") or []
    evol, intention = bool(EVOLUTION.search(tt)), bool(PRESSENTI.search(tt))
    if opinion:
        # avis d'experts : seulement les sujets cyber (texte suivi de nature cyber, ou mots cyber / données / IA)
        if not (set(tc) & tri_ia.TEXTES_CYBER or regles.CYBER_DONNEES_IA.search(tt)):
            return None
        tc = [x for x in tc if x in tri_ia.TEXTES_CYBER] or tc
        if tc and not evol and not intention:
            return "avis"
        if tc:
            return "evolution"
        return "pressenti" if (intention or _nom_inconnu(a)) else None
    # sources officielles et presse : il faut l'avis de l'IA (sujet cyber, peut concerner l'entreprise)
    if not _ia_ok(a):
        return None
    typ = (a.get("ia") or {}).get("type")
    if typ in ("texte_officiel", "obligation_echeance", "sanction", "alerte_vulnerabilite", "attaque_incident",
               "entreprise_produit", "evenement", "financement", "etude_enquete", "autre"):
        return None   # une règle déjà là, ou pas une réglementation : pas un pressenti
    # une intention annoncée (« le gouvernement veut une loi… », stratégie, appel à contributions en amont), ou une
    # prise de position politique qui nomme un texte encore inconnu ; pour un texte suivi : une évolution annoncée
    if tc:
        return "evolution" if (evol and (intention or typ == "politique")) or (evol and typ == "projet_consultation"
                                                                              and not regles.statut(regles._sa(tt))) else None
    if intention or typ == "politique":
        return "pressenti"
    return None


def _promu(sujet, alertes_liste):
    """Alerte (point clé) qui montre que le texte pressenti est sorti : (date, id) ou None."""
    debut = sujet["premier_signal"]
    nom = regles._sa(sujet["texte"] or sujet.get("nom", "")).lower()
    if not nom:
        return None
    for al in alertes_liste:
        if al.get("type") not in ("proposition", "adopte", "a_qualifier"):
            continue
        det = al.get("detecte_le", "")
        if det < debut:
            continue
        if not any(ar.get("statut") in ("projet", "adopte", "en_vigueur") for ar in al.get("articles", [])):
            continue   # des lignes directrices ou un guide sur le texte ne sont pas « le texte qui sort »
        z_ok = al.get("zone") == sujet["zone"] or (sujet["zone"] == "Europe" and al.get("zone") in ("Europe", ""))
        if not z_ok:
            continue
        if sujet["texte"]:
            if al.get("texte") == sujet["texte"]:
                return det, al["id"]
        else:
            vu = regles._sa((al.get("texte") or "") + " " + " ".join(ar.get("titre", "") for ar in al.get("articles", []))).lower()
            if nom in vu:
                return det, al["id"]
    return None


def construire(liste, debats, liste_alertes, ancien, aujourdhui):
    """Recalcule la section à partir des articles gardés (liste), des avis d'experts gardés (debats) et des points
    clés (liste_alertes). ancien = registre précédent ({"sujets": [...]})."""
    ids_cles = {ar["id"] for al in liste_alertes if al.get("active") for ar in al.get("articles", [])}
    limite = (aujourdhui - dt.timedelta(days=DUREE_PRESSENTI)).isoformat()
    groupes = {}
    for a, opinion in [(x, False) for x in liste] + [(x, True) for x in debats]:
        if a.get("base") or a.get("doublon_de") or a.get("date", "") < limite or a["id"] in ids_cles:
            continue
        if not opinion and a.get("pertinence") == "ecarte":
            continue
        sorte = classer(a, opinion)
        if not sorte:
            continue
        texte = (a.get("textes_cles") or [""])[0]
        nom = "" if texte else _nom_inconnu(a)
        if OMNIBUS.search(tri_ia.titres(a)):
            texte, nom = "", "Digital Omnibus"   # un même paquet qui modifie plusieurs textes (RGPD, AI Act, NIS2…)
        zone = "Europe" if nom == "Digital Omnibus" else _zone(a, texte)
        if texte:
            cle = _cle(sorte, texte, zone)
        elif nom:
            cle = _cle(sorte, regles._sa(nom).lower(), zone)
        else:
            cle = _cle(sorte, "article", a["id"])   # pas de nom de texte : l'article seul
        g = groupes.setdefault(cle, {"id": cle, "sorte": sorte, "texte": texte, "nom": nom, "zone": zone, "articles": []})
        ap = alertes._apercu(a)
        if opinion:
            ap["expert"] = True
        if all(x["id"] != a["id"] for x in g["articles"]):
            g["articles"].append(ap)

    anciens = {s["id"]: s for s in (ancien or {}).get("sujets", [])}
    sujets = []
    for cle, g in groupes.items():
        arts = sorted(g["articles"], key=lambda x: x.get("date", ""), reverse=True)
        prec = anciens.get(cle, {})
        premier = min([prec.get("premier_signal") or "9999"] + [x.get("date", "9999") for x in arts])
        dernier = arts[0].get("date", "") if arts else prec.get("dernier_signal", "")
        s = {"id": cle, "sorte": g["sorte"], "texte": g["texte"], "nom": g["nom"], "zone": g["zone"],
             "premier_signal": premier, "dernier_signal": dernier, "articles": arts[:12], "nb_articles": len(arts),
             "nb_sources": len({x.get("source") for x in arts}), "statut": prec.get("statut", "pressenti")}
        if prec.get("devenu_le"):
            s["devenu_le"], s["alerte"] = prec["devenu_le"], prec.get("alerte", "")
        sujets.append(s)
    # sujets précédents sans nouvel article (articles sortis du site) : gardés tant que leur durée n'est pas écoulée
    vus = {s["id"] for s in sujets}
    for cle, s in anciens.items():
        if cle not in vus:
            sujets.append(s)

    garde = []
    for s in sujets:
        if s["sorte"] != "avis" and s.get("statut") != "devenu_projet":
            p = _promu(s, liste_alertes)
            if p:
                s["statut"], s["devenu_le"], s["alerte"] = "devenu_projet", p[0], p[1]
        if s.get("statut") == "devenu_projet":
            if (_date(s.get("devenu_le")) or aujourdhui) < aujourdhui - dt.timedelta(days=DUREE_DEVENU):
                continue   # sorti de la section : suivi dans les points clés
        elif s["sorte"] == "avis":
            if (_date(s.get("dernier_signal")) or aujourdhui) < aujourdhui - dt.timedelta(days=DUREE_AVIS):
                continue
        elif (_date(s.get("dernier_signal")) or aujourdhui) < aujourdhui - dt.timedelta(days=DUREE_PRESSENTI):
            continue
        garde.append(s)
    garde.sort(key=lambda s: (s.get("statut") == "devenu_projet", s["sorte"] == "avis", s.get("dernier_signal", "")), reverse=False)
    # ordre : pressentis et évolutions d'abord (les plus récents en premier), puis avis ; « devenu projet » à la fin
    garde.sort(key=lambda s: s.get("dernier_signal", ""), reverse=True)
    garde.sort(key=lambda s: (s.get("statut") == "devenu_projet", s["sorte"] == "avis"))
    return garde
