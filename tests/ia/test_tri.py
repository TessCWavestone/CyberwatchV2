"""
Cyber Watch — test du tri par l'IA sur le jeu de référence (tests/ia/jeu_reference.json).

Pour chacun des 300 articles réels : la page est lue (si le site l'autorise), l'IA juge, et son avis est comparé
à l'avis de référence (vérifié par un humain) ainsi qu'au classement actuel des règles.
Variables : IA_MODELE (qwen7b, phi35, llama3b), PAGES (oui / non), MAX (nombre d'articles, pour un essai rapide).
Rapport : tests/ia/rapport.md (et le résumé de l'exécution GitHub).
"""
import collections, datetime as dt, json, os, sys, time
from concurrent.futures import ThreadPoolExecutor
ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(os.path.dirname(ICI))
sys.path.insert(0, os.path.join(RACINE, "collecte"))
os.chdir(RACINE)
import collecte, lecture, tri_ia

cfg = collecte.charger_config()
jeu = json.load(open(os.path.join(ICI, "jeu_reference.json"), encoding="utf-8"))["articles"]
if os.environ.get("MAX"):
    jeu = jeu[:int(os.environ["MAX"])]
REGLES = {"elevee": "pertinent", "moyenne": "pertinent", "faible": "a_surveiller", "ecarte": "pas_pertinent"}
AV = ["pertinent", "a_surveiller", "pas_pertinent"]
COURT = {"pertinent": "P", "a_surveiller": "S", "pas_pertinent": "N"}


def main():
    t0 = time.time()
    lues = 0
    if os.environ.get("PAGES", "oui") != "non":
        client = collecte.Client(cfg)
        with ThreadPoolExecutor(max_workers=8) as pool:
            for a, (texte, err) in zip(jeu, pool.map(lambda a: lecture.lire_page(client, a["lien"]), jeu)):
                if texte and not err:
                    a["_texte"] = texte
                    lues += 1
    print("Pages lues : %d / %d (%d s)" % (lues, len(jeu), time.time() - t0))
    cfg.setdefault("ia_tri", {})
    cfg["ia_tri"].update({"budget_minutes": 10 ** 4, "max_articles": 10 ** 5})
    t1 = time.time()
    ia = tri_ia.TriIA(cfg)
    if not ia.actif:
        print(ia.erreur)
        open(os.path.join(ICI, "rapport.md"), "w").write("# Test du tri par l'IA\n\n" + ia.erreur + "\n")
        return
    print("Modèle chargé : %s (%d s)" % (ia.cfg["modele_fichier"], time.time() - t1))
    t2 = time.time()
    for k in range(0, len(jeu), 25):
        ia.trier(jeu[k:k + 25], garder_raison=True)
        print("  %d / %d articles jugés (%d s)" % (min(k + 25, len(jeu)), len(jeu), time.time() - t2))
    duree = time.time() - t2

    def final(a):
        """Avis appliqué sur le site : celui de l'IA, sauf garde-fou (texte suivi cité : jamais écarté)."""
        d = (a.get("ia") or {}).get("avis")
        if not d:
            return REGLES[a["niveau_regles"]]
        return "a_surveiller" if d == "pas_pertinent" and a.get("textes_cles") else d

    def matrice(f):
        m = collections.Counter((a["reference"], f(a)) for a in jeu)
        ok = sum(m[(x, x)] for x in AV)
        rates = sum(1 for a in jeu if a["reference"] == "pertinent" and f(a) == "pas_pertinent")
        bruit = sum(1 for a in jeu if a["reference"] == "pas_pertinent" and f(a) == "pertinent")
        bruit_s = sum(1 for a in jeu if a["reference"] == "pas_pertinent" and f(a) == "a_surveiller")
        lignes = ["| Référence \\ Avis | Pertinent | À surveiller | Pas pertinent |", "|---|---|---|---|"]
        for r in AV:
            lignes.append("| %s | %s |" % ({"pertinent": "**Pertinent**", "a_surveiller": "**À surveiller**",
                                             "pas_pertinent": "**Pas pertinent**"}[r], " | ".join(str(m[(r, x)]) for x in AV)))
        return ok, rates, bruit, bruit_s, lignes

    nP = sum(1 for a in jeu if a["reference"] == "pertinent")
    nN = sum(1 for a in jeu if a["reference"] == "pas_pertinent")
    verif = sum(1 for a in jeu if a.get("verifie"))
    erreurs = sum(1 for a in jeu if (a.get("ia") or {}).get("erreur"))
    L = ["# Test du tri par l'IA — %s" % dt.date.today().isoformat(), "",
         "Modèle : **%s** · %d articles (%d vérifiés par un humain) · pages lues : %d · durée de l'IA : %d min "
         "(%.0f s par article)%s." % (ia.cfg["modele_fichier"], len(jeu), verif, lues, duree / 60, duree / max(1, len(jeu)),
                                       (" · %d réponses hors format" % erreurs) if erreurs else ""), "",
         "Référence : %d pertinents, %d à surveiller, %d pas pertinents." % (nP, len(jeu) - nP - nN, nN), ""]
    for titre, f in (("Règles actuelles (sans IA)", lambda a: REGLES[a["niveau_regles"]]),
                     ("IA seule", lambda a: (a.get("ia") or {}).get("avis") or REGLES[a["niveau_regles"]]),
                     ("IA + garde-fou (ce qui serait appliqué sur le site)", final)):
        ok, rates, bruit, bruit_s, lignes = matrice(f)
        L += ["## " + titre, "",
              "- Avis identiques à la référence : **%d / %d** (%d %%)" % (ok, len(jeu), 100 * ok / len(jeu)),
              "- Vrais sujets **ratés** (pertinents jugés « pas pertinents ») : **%d / %d**" % (rates, nP),
              "- Hors-sujet gardés comme pertinents : **%d / %d** ; mis « à surveiller » : %d" % (bruit, nN, bruit_s), ""] + lignes + [""]
    L += ["## Désaccords entre l'IA et la référence", "",
          "| N° | Référence | IA | Motif IA | Raison donnée par l'IA (test seulement, jamais publiée) | Page | Titre |",
          "|---|---|---|---|---|---|---|"]
    for a in jeu:
        d = a.get("ia") or {}
        if d.get("avis") != a["reference"]:
            t = ((a.get("trad") or {}).get("fr") or {}).get("titre") or a["titre"]
            L.append("| %d | %s | %s | %s | %s | %s | %s |" % (
                a["n"], COURT[a["reference"]], COURT.get(d.get("avis"), "?"), d.get("motif", d.get("erreur", "")),
                (d.get("raison") or "").replace("|", "/")[:160], "oui" if d.get("page") else "—", t.replace("|", "/")[:110]))
    for a in jeu:
        a.pop("_texte", None)
    json.dump(jeu, open(os.path.join(ICI, "resultats.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    open(os.path.join(ICI, "rapport.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
    print("\n".join(L[:40]))


if __name__ == "__main__":
    main()
