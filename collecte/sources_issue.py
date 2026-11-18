#!/usr/bin/env python3
"""
Cyber Watch — applique une demande faite depuis le site (ajout / retrait de source,
avis « Important » / « Pas pertinent » sur un article) sans jeton (le site ouvre une « issue » GitHub pré-remplie).

Appelé par .github/workflows/sources.yml avec les variables d'environnement :
    CORPS_ISSUE   le texte de l'issue (contient un bloc ```json … ```)
    AUTEUR        l'identifiant GitHub de la personne qui a validé

Écrit config/sources_manuelles.json et affiche un résumé (repris en commentaire
sur l'issue). Code de sortie 1 si la demande est illisible.
"""

import datetime as dt
import json
import os
import re
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FICHIER = os.path.join(RACINE, "config", "sources_manuelles.json")
RETOURS = os.path.join(RACINE, "config", "retours.json")


def appliquer_avis(demande):
    """Bouton « Important » / « Pas pertinent » du site -> config/retours.json.
    L'avis prime sur la note calculée et sert d'exemple au modèle."""
    ident = str(demande.get("id", ""))[:40]
    avis = demande.get("avis")
    if not re.fullmatch(r"[\w-]{4,40}", ident) or avis not in ("important", "pas_pertinent", "annuler"):
        print("Avis illisible.")
        return 1
    try:
        with open(RETOURS, encoding="utf-8") as f:
            ret = json.load(f)
    except (OSError, ValueError):
        ret = {}
    ret.setdefault("_aide", "Avis des lecteurs (boutons du site). « important » : gardé et mis dans L'essentiel ; "
                            "« pas_pertinent » : écarté. Supprimez une ligne pour annuler un avis.")
    ret.setdefault("articles", {})
    if avis == "annuler":
        ret["articles"].pop(ident, None)
        print("Feedback cancelled for article %s." % ident)
    else:
        ret["articles"][ident] = {"avis": avis, "titre": str(demande.get("titre", ""))[:300],
                                  "lien": str(demande.get("lien", ""))[:500], "le": dt.date.today().isoformat()}
        print("Feedback saved (%s): %s. Taken into account at the next collection." % (
            "important" if avis == "important" else "not relevant", demande.get("titre", ident)))
    with open(RETOURS, "w", encoding="utf-8") as f:
        json.dump(ret, f, ensure_ascii=False, indent=1)
    return 0


def main():
    corps = os.environ.get("CORPS_ISSUE", "")
    m = re.search(r"```json\s*(\{.*?\})\s*```", corps, re.S)
    if not m:
        print("Unreadable request: JSON block not found.")
        return 1
    try:
        demande = json.loads(m.group(1))
    except ValueError as e:
        print("Unreadable request: %s" % e)
        return 1
    try:
        with open(FICHIER, encoding="utf-8") as f:
            manu = json.load(f)
    except (OSError, ValueError):
        manu = {"ajouts": [], "retraits": []}
    if demande.get("action") == "avis":
        return appliquer_avis(demande)
    manu.setdefault("ajouts", [])
    manu.setdefault("retraits", [])
    action = demande.get("action")
    url = (demande.get("url") or "").strip()
    if not url.startswith("http"):
        print("Invalid URL.")
        return 1
    jour = dt.date.today().isoformat()
    if action == "ajout":
        manu["ajouts"] = [s for s in manu["ajouts"] if s.get("url") != url]
        manu["retraits"] = [r for r in manu["retraits"] if (r.get("url") if isinstance(r, dict) else r) != url]
        manu["ajouts"].append({
            "nom": str(demande.get("nom", ""))[:150], "zone": str(demande.get("zone", ""))[:40],
            "type": str(demande.get("type", ""))[:60], "url": url,
            "flux": [u for u in demande.get("flux", []) if str(u).startswith("http")][:10],
            "pages": [u for u in demande.get("pages", []) if str(u).startswith("http")][:10],
            "ajoute_le": jour,
        })
        print("Source added: %s (%s). It will be read at the next collection." % (demande.get("nom", url), url))
    elif action == "retrait":
        if not any((r.get("url") if isinstance(r, dict) else r) == url for r in manu["retraits"]):
            manu["retraits"].append({"url": url, "nom": str(demande.get("nom", ""))[:150], "retire_le": jour})
        print("Source removed: %s (%s). It will no longer be read from the next collection." % (demande.get("nom", url), url))
    elif action == "retablir":
        manu["retraits"] = [r for r in manu["retraits"] if (r.get("url") if isinstance(r, dict) else r) != url]
        print("Source restored: %s (%s)." % (demande.get("nom", url), url))
    else:
        print("Unknown action: %s" % action)
        return 1
    with open(FICHIER, "w", encoding="utf-8") as f:
        json.dump(manu, f, ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
