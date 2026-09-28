"""
Cyber Watch — Journal officiel français (JORF) via les données ouvertes de la DILA.

Aucune inscription, aucun identifiant : la DILA publie chaque jour (en général
deux fois) une archive du JO au format XML :
    https://echanges.dila.gouv.fr/OPENDATA/JORF/JORF_AAAAMMJJ-HHMMSS.tar.gz

Le script télécharge les archives publiées depuis la dernière collecte, lit
le titre, la nature, la date et le NOR de chaque texte, écarte les mesures
individuelles (nominations, promotions, concours…), et renvoie vers la page
Légifrance du texte. La note de pertinence fait ensuite le tri (source
« volumineuse » : seuls les textes pertinents sont gardés).
"""

import datetime as dt
import io
import re
import tarfile
import xml.etree.ElementTree as ET

URL_LISTE = "https://echanges.dila.gouv.fr/OPENDATA/JORF/"
RE_ARCHIVE = re.compile(r"JORF_(\d{8})-(\d{6})\.tar\.gz")
NATURES = {"LOI": "Loi", "ORDONNANCE": "Ordonnance", "DECRET": "Décret", "ARRETE": "Arrêté", "DECISION": "Décision",
           "DELIBERATION": "Délibération", "AVIS": "Avis", "CIRCULAIRE": "Circulaire", "RAPPORT": "Rapport",
           "INSTRUCTION": "Instruction", "LOI_ORGANIQUE": "Loi organique", "DECRET_LOI": "Décret-loi"}
MESURES_INDIVIDUELLES = re.compile(
    r"portant nomination|\bnomm[ée]|nomination|promotion|cessation de fonctions|admission|tableau d'avancement|"
    r"concours|examen professionnel|d[ée]l[ée]gation de signature|naturalisation|citation|m[ée]daille|"
    r"l[ée]gion d'honneur|ordre national|mutation|d[ée]tachement|int[ée]gration dans|radiation|r[ée]int[ée]gration|"
    r"liste d'aptitude|\bjury\b|[ée]lections?\b|changement de nom|ouverture d'un recrutement|recrutement|"
    r"inscription au tableau|titularisation|mise [àa] disposition|admis(e|es)? [àa] faire valoir|habilitation [àa] si[ée]ger|"
    r"prix et r[ée]compenses|cotisations? (dues|des)|indemnit[ée]s? (de|des|allou)|taux de (l'int[ée]r[êe]t|rendement)|"
    r"agr[ée]ment (de|des) (organismes|associations)|homologation des r[ée]sultats|fixant le nombre de postes", re.I)


def _texte(racine, *noms):
    for n in noms:
        for el in racine.iter():
            if el.tag.rsplit("}", 1)[-1] == n and (el.text or "").strip():
                return re.sub(r"\s+", " ", el.text).strip()
    return ""


def lire_archive(contenu):
    """Octets d'une archive .tar.gz -> liste de textes {id, titre, nature, date, nor}."""
    sortie, vus = [], set()
    with tarfile.open(fileobj=io.BytesIO(contenu), mode="r:gz") as tar:
        for m in tar:
            nom = m.name
            if not m.isfile() or not nom.endswith(".xml") or "JORFTEXT" not in nom.rsplit("/", 1)[-1]:
                continue
            if "/struct/" in nom:
                continue  # structure du texte : même titre que la version, inutile
            try:
                racine = ET.fromstring(tar.extractfile(m).read())
            except ET.ParseError:
                continue
            ident = _texte(racine, "CID", "ID") or nom.rsplit("/", 1)[-1][:-4]
            if not ident.startswith("JORFTEXT") or ident in vus:
                continue
            titre = _texte(racine, "TITREFULL", "TITRE")
            if not titre:
                continue
            vus.add(ident)
            nature = _texte(racine, "NATURE").upper()
            date = None
            try:
                date = dt.date.fromisoformat(_texte(racine, "DATE_PUBLI")[:10])
            except ValueError:
                pass
            sortie.append({"id": ident, "titre": titre, "nature": nature, "date": date, "nor": _texte(racine, "NOR")})
    return sortie


def archives_disponibles(client):
    r = client.get(URL_LISTE)
    noms = sorted(set(m.group(0) for m in RE_ARCHIVE.finditer(r.text)))
    return noms


def collecter(src, client, memoire, depuis, maintenant, max_archives=400):
    """Retourne (articles bruts, état). memoire : dict persistant (dernière archive lue)."""
    etat = {"nom": src["nom"], "zone": src["zone"], "url": src["url"], "mode": "opendata", "flux": URL_LISTE,
            "nb_trouves": 0, "erreur": "", "verifie_le": maintenant.strftime("%Y-%m-%d %H:%M")}
    try:
        noms = archives_disponibles(client)
    except Exception as e:
        etat.update(mode="erreur", erreur="Liste des archives DILA illisible : %s" % str(e)[:120])
        return [], etat
    derniere = memoire.get("derniere_archive", "")
    a_lire = [n for n in noms if n > derniere and dt.date(int(n[5:9]), int(n[9:11]), int(n[11:13])) >= depuis]
    a_lire = a_lire[-max_archives:]
    arts, erreurs, lues = [], [], 0
    for n in a_lire:
        try:
            r = client.get(URL_LISTE + n)
            textes = lire_archive(r.content)
            lues += 1
        except Exception as e:
            erreurs.append("%s : %s" % (n, str(e)[:80]))
            continue
        for t in textes:
            if MESURES_INDIVIDUELLES.search(t["titre"]):
                continue
            nature = NATURES.get(t["nature"], t["nature"].capitalize() if t["nature"] else "Texte")
            arts.append({
                "titre": t["titre"][0].upper() + t["titre"][1:],
                "lien": "https://www.legifrance.gouv.fr/jorf/id/%s" % t["id"],
                "resume": "Journal officiel du %s — %s%s" % (
                    t["date"].strftime("%d/%m/%Y") if t["date"] else "?", nature, (" — NOR %s" % t["nor"]) if t["nor"] else ""),
                "date": t["date"], "_orig": URL_LISTE,
            })
        memoire["derniere_archive"] = n
    etat.update(nb_trouves=len(arts), erreur=" ; ".join(erreurs[:5]),
                page="%d archive(s) du JO lue(s)" % lues)
    if erreurs and not lues:
        etat["mode"] = "erreur"
    return arts, etat
