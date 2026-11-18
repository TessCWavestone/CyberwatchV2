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
import collecte, lecture, regles, tri_ia

cfg = collecte.charger_config()
jeu = json.load(open(os.path.join(ICI, "jeu_reference.json"), encoding="utf-8"))["articles"]
if os.environ.get("MAX"):
    jeu = jeu[:int(os.environ["MAX"])]
REGLES = {"elevee": "pertinent", "moyenne": "pertinent", "faible": "a_surveiller", "ecarte": "pas_pertinent"}
AV = ["pertinent", "a_surveiller", "pas_pertinent"]
COURT = {"pertinent": "R", "a_surveiller": "M", "pas_pertinent": "N"}   # relevant / monitor / not relevant


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
    print("Pages read: %d / %d (%d s)" % (lues, len(jeu), time.time() - t0))
    cfg.setdefault("ia_tri", {})
    cfg["ia_tri"].update({"budget_minutes": 10 ** 4, "max_articles": 10 ** 5})
    t1 = time.time()
    _ok, _msg = tri_ia.sonde(cfg)   # v13.4 : message clair au lieu d'un plantage si l'IA ne tourne pas sur cette machine
    ia = tri_ia.TriIA(cfg if _ok else dict(cfg, ia_tri=dict(cfg.get("ia_tri") or {}, actif=False)))
    if not _ok:
        ia.erreur = _msg
    if not ia.actif:
        print(ia.erreur)
        open(os.path.join(ICI, "rapport.md"), "w").write("# AI triage test\n\n" + ia.erreur + "\n")
        return
    print("Model loaded: %s (%d s)" % (ia.cfg["modele_fichier"], time.time() - t1))
    t2 = time.time()
    for k in range(0, len(jeu), 25):
        ia.trier(jeu[k:k + 25], garder_raison=True)
        print("  %d / %d articles assessed (%d s)" % (min(k + 25, len(jeu)), len(jeu), time.time() - t2))
    duree = time.time() - t2

    def final(a):
        """Avis appliqué sur le site (comme regles.evaluer) : écartés pour bruit non soumis à l'IA ; l'IA ne repêche
        un écarté qu'en « à surveiller » ; texte suivi cité : jamais écarté par l'IA."""
        if a["niveau_regles"] == "ecarte" and a.get("bruit_regles"):
            # seules les alertes de vulnérabilité touchant le secteur sont repêchées (décision du 16/10)
            # comme la collecte : soumise à l'IA seulement si l'alerte évoque la santé ou les dispositifs
            tx = regles._sa(a["titre"] + " " + (a.get("resume") or ""))
            soumis = bool(regles.SANTE_METIER.search(tx) or regles.DISPO_NUM_SANTE.search(tx) or regles.REG_DISPOSITIFS.search(tx))
            return "pertinent" if soumis and (a.get("ia") or {}).get("motif") == "vulnerabilite_secteur" else "pas_pertinent"
        d = (a.get("ia") or {}).get("avis")
        if not d:
            return REGLES[a["niveau_regles"]]
        if d == "pertinent" and a["niveau_regles"] == "ecarte":
            return "a_surveiller"
        return "a_surveiller" if d == "pas_pertinent" and a.get("textes_cles") else d

    def matrice(f):
        m = collections.Counter((a["reference"], f(a)) for a in jeu)
        ok = sum(m[(x, x)] for x in AV)
        rates = sum(1 for a in jeu if a["reference"] == "pertinent" and f(a) == "pas_pertinent")
        bruit = sum(1 for a in jeu if a["reference"] == "pas_pertinent" and f(a) == "pertinent")
        bruit_s = sum(1 for a in jeu if a["reference"] == "pas_pertinent" and f(a) == "a_surveiller")
        lignes = ["| Reference \\ Verdict | Relevant | To monitor | Not relevant |", "|---|---|---|---|"]
        for r in AV:
            lignes.append("| %s | %s |" % ({"pertinent": "**Relevant**", "a_surveiller": "**To monitor**",
                                             "pas_pertinent": "**Not relevant**"}[r], " | ".join(str(m[(r, x)]) for x in AV)))
        return ok, rates, bruit, bruit_s, lignes

    nP = sum(1 for a in jeu if a["reference"] == "pertinent")
    nN = sum(1 for a in jeu if a["reference"] == "pas_pertinent")
    verif = sum(1 for a in jeu if a.get("verifie"))
    erreurs = sum(1 for a in jeu if (a.get("ia") or {}).get("erreur"))
    L = ["# AI triage test — %s" % dt.date.today().isoformat(), "",
         "Model: **%s** · %d articles (%d checked by a human) · pages read: %d · AI duration: %d min "
         "(%.0f s per article)%s." % (ia.cfg["modele_fichier"], len(jeu), verif, lues, duree / 60, duree / max(1, len(jeu)),
                                       (" · %d malformed answers" % erreurs) if erreurs else ""), "",
         "Reference: %d relevant, %d to monitor, %d not relevant." % (nP, len(jeu) - nP - nN, nN), ""]
    for titre, f in (("Current rules (no AI)", lambda a: REGLES[a["niveau_regles"]]),
                     ("AI alone", lambda a: (a.get("ia") or {}).get("avis") or REGLES[a["niveau_regles"]]),
                     ("AI + safeguard (what the site would apply)", final)):
        ok, rates, bruit, bruit_s, lignes = matrice(f)
        L += ["## " + titre, "",
              "- Verdicts matching the reference: **%d / %d** (%d %%)" % (ok, len(jeu), 100 * ok / len(jeu)),
              "- Real topics **missed** (relevant judged \"not relevant\"): **%d / %d**" % (rates, nP),
              "- Off-topic kept as relevant: **%d / %d**; put \"to monitor\": %d" % (bruit, nN, bruit_s), ""] + lignes + [""]
    L += ["## Article types seen by the AI", "", "| Type | Count | of which reference \"relevant\" |", "|---|---|---|"]
    for t, n in collections.Counter((a.get("ia") or {}).get("type", "?") for a in jeu).most_common():
        L.append("| %s | %d | %d |" % (t, n, sum(1 for a in jeu if (a.get("ia") or {}).get("type", "?") == t and a["reference"] == "pertinent")))
    L += ["", "## Disagreements between the AI and the reference", "",
          "| No. | Reference | AI | Type / cyber topic / applicable | Reason given by the AI (test only, never published) | Page | Title |",
          "|---|---|---|---|---|---|---|"]
    for a in jeu:
        d = a.get("ia") or {}
        if d.get("avis") != a["reference"]:
            t = ((a.get("trad") or {}).get("en") or {}).get("titre") or a["titre"]
            L.append("| %d | %s | %s | %s | %s | %s | %s |" % (
                a["n"], COURT[a["reference"]], COURT.get(d.get("avis"), "?"),
                "%s / %s / %s / sector %s" % (d.get("type", d.get("erreur", "")), d.get("sujet", ""), d.get("applicable", ""), d.get("secteur", "")),
                (d.get("raison") or "").replace("|", "/")[:160], "yes" if d.get("page") else "—", t.replace("|", "/")[:110]))
    for a in jeu:
        a.pop("_texte", None)
    json.dump(jeu, open(os.path.join(ICI, "resultats.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    open(os.path.join(ICI, "rapport.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
    print("\n".join(L[:40]))


if __name__ == "__main__":
    main()
