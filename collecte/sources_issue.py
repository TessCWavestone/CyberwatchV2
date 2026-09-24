#!/usr/bin/env python3
"""
Cyber Watch — applique une demande d'ajout / de retrait de source faite depuis le
site sans jeton (le site ouvre une « issue » GitHub pré-remplie).

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


def main():
    corps = os.environ.get("CORPS_ISSUE", "")
    m = re.search(r"```json\s*(\{.*?\})\s*```", corps, re.S)
    if not m:
        print("Demande illisible : bloc JSON introuvable.")
        return 1
    try:
        demande = json.loads(m.group(1))
    except ValueError as e:
        print("Demande illisible : %s" % e)
        return 1
    try:
        with open(FICHIER, encoding="utf-8") as f:
            manu = json.load(f)
    except (OSError, ValueError):
        manu = {"ajouts": [], "retraits": []}
    manu.setdefault("ajouts", [])
    manu.setdefault("retraits", [])
    action = demande.get("action")
    url = (demande.get("url") or "").strip()
    if not url.startswith("http"):
        print("URL invalide.")
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
            "ajoute_le": jour, "par": os.environ.get("AUTEUR", ""),
        })
        print("Source ajoutée : %s (%s). Elle sera lue à la prochaine collecte." % (demande.get("nom", url), url))
    elif action == "retrait":
        if not any((r.get("url") if isinstance(r, dict) else r) == url for r in manu["retraits"]):
            manu["retraits"].append({"url": url, "nom": str(demande.get("nom", ""))[:150], "retire_le": jour,
                                     "par": os.environ.get("AUTEUR", "")})
        print("Source retirée : %s (%s). Elle ne sera plus lue à partir de la prochaine collecte." % (demande.get("nom", url), url))
    elif action == "retablir":
        manu["retraits"] = [r for r in manu["retraits"] if (r.get("url") if isinstance(r, dict) else r) != url]
        print("Source rétablie : %s (%s)." % (demande.get("nom", url), url))
    else:
        print("Action inconnue : %s" % action)
        return 1
    with open(FICHIER, "w", encoding="utf-8") as f:
        json.dump(manu, f, ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
