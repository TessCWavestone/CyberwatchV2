"""
Cyber Watch — tri par l'IA en LOTS PARALLÈLES (étape 1 du passage à l'échelle mondiale, 24/11/2026).

Pourquoi : le tri par l'IA (~50 s par article sur le serveur gratuit de GitHub) prend l'essentiel de la collecte
(collecte du 23/11 : 2 h 35 d'IA sur 3 h 17, arrêt au budget de temps avec des articles en attente). Avec beaucoup
plus de sources (monde), une seule machine ne suffit plus.

La collecte du lundi se fait en 3 temps (voir .github/workflows/veille.yml) :
  1. PRÉPARATION (1 machine) : collecte.py avec MODE_COLLECTE=preparation lit les sources et les pages, applique
     les règles, puis écrit la liste des articles à faire juger par l'IA (ecrire_a_juger) et s'arrête ;
  2. TRI (N machines en parallèle) : « python collecte/lots.py juger <k> <N> <dossier> » juge le lot k sur N ;
  3. ASSEMBLAGE (1 machine) : collecte.py normal avec VERDICTS_DIR : les avis des lots sont repris (injecter),
     l'IA ne juge plus que les articles apparus entre-temps, puis tout le reste comme avant.
Si un lot échoue, ses articles sont simplement jugés à la collecte suivante (rien n'est bloqué).
Les fichiers échangés (texte des pages compris) restent dans les « artifacts » privés de l'exécution, quelques
jours, et ne sont jamais publiés.
"""
import glob
import json
import os
import sys
import time

CHAMPS = ("id", "titre", "resume", "source", "zone", "date", "lien", "langue", "nature", "trad", "textes_cles",
          "pertinence", "_texte", "ia")


def a_juger_encore(a, version):
    """Même règle que TriIA.trier : déjà jugé avec cette version (et avec la page si on l'a) -> rien à faire."""
    ia = a.get("ia") or {}
    return not (ia.get("v") == version and not (a.get("_texte") and not ia.get("page")))


def ecrire_a_juger(articles, chemin):
    """Préparation : écrit les articles à juger (dans l'ordre de priorité). Retourne leur nombre."""
    import tri_ia
    lot = [{k: a[k] for k in CHAMPS if k in a} for a in articles if a_juger_encore(a, tri_ia.VERSION)]
    os.makedirs(os.path.dirname(chemin) or ".", exist_ok=True)
    with open(chemin, "w", encoding="utf-8") as f:
        json.dump({"version": tri_ia.VERSION, "articles": lot}, f, ensure_ascii=False, default=str)
    return len(lot)


def injecter(articles, dossier):
    """Assemblage : reprend les avis écrits par les lots. Retourne (nombre repris, nombre de lots lus)."""
    import tri_ia
    if not dossier or not os.path.isdir(dossier):
        return 0, 0
    avis, n_lots = {}, 0
    for p in sorted(glob.glob(os.path.join(dossier, "**", "verdicts_*.json"), recursive=True)):
        try:
            with open(p, encoding="utf-8") as f:
                d = json.load(f)
        except Exception:
            continue
        if d.get("version") != tri_ia.VERSION:
            continue   # avis d'une ancienne version des consignes : ignorés
        n_lots += 1
        avis.update(d.get("avis") or {})
    n = 0
    for a in articles:
        x = avis.get(a.get("id"))
        if x and not x.get("erreur") and a_juger_encore(a, tri_ia.VERSION):
            # page lue à l'assemblage mais pas lors de la préparation : l'IA rejugera avec la page
            if a.get("_texte") and not x.get("page"):
                continue
            a["ia"] = x
            n += 1
    return n, n_lots


def juger(k, n, dossier):
    """Tri : juge le lot k (0 à n-1) et écrit verdicts_<k>.json. Toujours un fichier, même vide."""
    import tri_ia
    with open(os.path.join(dossier, "a_juger.json"), encoding="utf-8") as f:
        d = json.load(f)
    tous = d.get("articles") or []
    lot = [a for i, a in enumerate(tous) if i % n == k]    # répartition alternée : priorités équilibrées
    sortie = {"version": tri_ia.VERSION, "lot": k, "nb_lots": n, "avis": {}, "message": ""}
    chemin = os.path.join(dossier, "verdicts_%d.json" % k)
    if d.get("version") != tri_ia.VERSION:
        sortie["message"] = "liste préparée avec une autre version des consignes : rien jugé"
    elif lot:
        # même configuration que la collecte (config/veille.json › ia_tri)
        racine = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        try:
            with open(os.path.join(racine, "config", "veille.json"), encoding="utf-8") as f:
                cfg = {"ia_tri": json.load(f).get("ia_tri") or {}}
        except Exception:
            cfg = {"ia_tri": {}}
        t0 = time.time()
        ok, msg = tri_ia.sonde(cfg)
        ia = tri_ia.TriIA(cfg if ok else dict(cfg, ia_tri=dict(cfg["ia_tri"], actif=False)))
        if not ok:
            ia.erreur = msg
        n_faits = ia.trier(lot) if ia.actif else 0
        sortie["avis"] = {a["id"]: a["ia"] for a in lot if (a.get("ia") or {}).get("v") == tri_ia.VERSION}
        sortie["message"] = ia.erreur
        print("AI triage, batch %d/%d: %d articles in the batch, %d assessed (%d s)%s" % (
            k + 1, n, len(lot), n_faits, time.time() - t0, (" — " + ia.erreur) if ia.erreur else ""))
    else:
        print("AI triage, batch %d/%d: nothing to assess." % (k + 1, n))
    with open(chemin, "w", encoding="utf-8") as f:
        json.dump(sortie, f, ensure_ascii=False)


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    if len(sys.argv) == 5 and sys.argv[1] == "juger":
        juger(int(sys.argv[2]), int(sys.argv[3]), sys.argv[4])
    else:
        sys.exit("usage: python collecte/lots.py juger <k> <N> <dossier>")
