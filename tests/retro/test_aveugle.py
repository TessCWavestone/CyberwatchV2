"""
Cyber Watch — test rétrospectif « à l'aveugle ».

Question : l'outil aurait-il fait remonter un texte au bon moment S'IL NE LE CONNAISSAIT PAS ?

Deux corpus de publications réelles (titres exacts, dates, sources) :
  - corpus.json          NIS2, CRA, AI Act, EHDS, ENS  -> textes ayant servi à régler les règles
  - corpus_controle.json DORA, Data Act, CER, PLD, UK Cyber Security and Resilience Bill
                         -> textes de CONTRÔLE : aucune règle n'a été réglée sur eux ; ce sont eux qui
                            disent si l'outil saura capter un futur texte inconnu.

Mode AVEUGLE : le NOM du texte est « oublié » partout (textes clés de regles.py, sujets suivis, mots-clés
de l'Excel) ; le sujet, lui, reste visible, comme pour un vrai texte futur.
Mode CONNU   : listes actuelles (référence).

Chaîne identique à la collecte : mots-clés -> note du modèle de pertinence -> règles -> L'essentiel ->
point clé ; plus le détecteur de « sujets émergents » (nom inconnu repris par plusieurs sources).
Notation : vrai modèle s'il est installé (GitHub Actions) ; sinon note de secours par mots-clés, ou note
imposée (NOTE_IMPOSEE=0.6 / 0.7) pour simuler ce que dirait le modèle.

Lancement : python tests/retro/test_aveugle.py      (rapport : tests/retro/rapport.md)
"""
import datetime as dt, json, os, re, sys
ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(os.path.dirname(ICI))
sys.path.insert(0, os.path.join(RACINE, "collecte"))
os.chdir(RACINE)
import openpyxl
import collecte, regles, alertes, pertinence, sujets

NOTE_IMPOSEE = os.environ.get("NOTE_IMPOSEE")
cfg = collecte.charger_config()
classeur = openpyxl.load_workbook(os.path.join(RACINE, cfg["fichier_sources"]), read_only=True, data_only=True)
MC = collecte.charger_mots_cles(cfg, classeur)
CORPUS = [dict(x, corpus="réglage") for x in json.load(open(os.path.join(ICI, "corpus.json"), encoding="utf-8"))] + \
         [dict(x, corpus="contrôle") for x in json.load(open(os.path.join(ICI, "corpus_controle.json"), encoding="utf-8"))]
PERT = pertinence.Pertinence(cfg)
PERT.retours = {}
if NOTE_IMPOSEE:
    _sc = pertinence.Pertinence._scorer
    def _force(self, arts):
        n = _sc(self, arts)
        for a in arts:
            a["score"] = float(NOTE_IMPOSEE)
        return n
    pertinence.Pertinence._scorer = _force

# le NOM de chaque texte (ce qu'un outil ne peut pas connaître à l'avance) ; le sujet reste visible
NOMS = {
    "NIS2": r"\bNIS ?-?2\b|2022/2555|NIS2UmsuCG|Cyberbeveiligingswet|high common level of cybersecurity|Nis2",
    "CRA": r"Cyber ?Resilience Act|\bCRA\b|2024/2847|cyberresilience|cyber-resilience|products with digital elements|horizontal cybersecurity requirements",
    "AI Act": r"\bAI Act\b|Artificial Intelligence Act|2024/1689|reglement (europeen )?sur l'IA|harmoni[sz]ed rules on artificial intelligence",
    "EHDS": r"\bEHDS\b|\bEEDS\b|Health Data Space|espace europeen des donnees de sante|Gesundheitsdatenraum|2025/327",
    "ENS": r"Esquema Nacional de Seguridad|\bENS\b|311/2022|CPSTIC|\bRD\b",
    "DORA": r"\bDORA\b|Digital Operational Resilience|digital operational resilience|2022/2554|resilience operationnelle numerique",
    "Data Act": r"\bData Act\b|2023/2854|fair access to and use of data|Datenverordnung",
    "CER": r"\bCER\b|Critical Entities Resilience|resilience of critical entities|2022/2557|KRITIS-Dachgesetz|Wet weerbaarheid kritieke entiteiten",
    "PLD": r"Product Liability Directive|\bPLD\b|2024/2853|ProdHaftG|Produkthaftungsrecht",
    "UK CSR Bill": r"Cyber Security and Resilience|Cyber Security Bill",
}
TC_ORIG = list(regles.TEXTES_CLES)
_tc_orig = regles.textes_cles
OUBLI = {"rx": None}


def textes_cles_aveugle(texte):
    """Textes clés reconnus, sauf si la seule chose reconnue est le nom oublié."""
    rx = OUBLI["rx"]
    if rx is None:
        return _tc_orig(texte)
    res = []
    for ident, rub, niv, r in TC_ORIG:
        if any(not rx.search(m.group(0)) for m in r.finditer(texte)):
            res.append((ident, rub, niv))
    return res


regles.textes_cles = textes_cles_aveugle
_connu_orig = alertes.est_connu_defaut


def evaluer(item, aveugle):
    rx = re.compile(NOMS[item["texte"]], re.I) if aveugle else None
    OUBLI["rx"] = rx
    mc = [x for x in MC if not (rx and (rx.search(x[1]) or rx.search(x[2].pattern)))]
    a = {"titre": item["titre"], "resume": item["resume"], "lien": item["url"], "date": dt.date.fromisoformat(item["date"])}
    art = collecte.nouvel_article(a, {"nom": item["source"], "zone": item["zone"]}, "test", mc, cfg, item["nature"])
    art["langue"] = item["langue"]
    art["id"] = "t" + str(abs(hash((item["texte"], item["date"], item["titre"]))))[:12]
    PERT.noter([art])
    r = {"niveau": art["pertinence"], "essentiel": bool(art.get("essentiel")), "statut": art.get("statut", ""),
         "score": art.get("score"), "alerte": alertes.type_article(art) or "", "motif": art.get("motif", ""),
         "sens_fort": bool(art.get("sens_fort"))}
    OUBLI["rx"] = None
    return r, art


def emergence(texte, arts_aveugles):
    """Première date à laquelle le détecteur de sujets émergents aurait levé une alerte sur le nom du texte."""
    rx = re.compile(NOMS[texte], re.I)
    def connu(m):
        return False if rx.search(m) else _connu_orig(m)
    dates = sorted({a["date"] for a in arts_aveugles if a["_texte"] == texte})
    for d in dates:
        for terme, arts in alertes.emergents(arts_aveugles, dt.date.fromisoformat(d), connu):
            if rx.search(terme) or all(a["_texte"] == texte for a in arts):
                return d, terme
    return None, None


NIV = {"elevee": "très pertinent", "moyenne": "pertinent", "faible": "à surveiller", "ecarte": "écarté"}


def main():
    res, par_texte = [], {}
    for it in CORPUS:
        av, art = evaluer(it, True)
        co, _ = evaluer(it, False)
        art["_texte"] = it["texte"]
        par_texte.setdefault(it["texte"], []).append(art)
        res.append({**it, "aveugle": av, "connu": co})
    regles.textes_cles = _tc_orig
    # détecteur de sujets émergents : flux de TOUTES les publications du corpus (chaque texte vu « à l'aveugle »)
    emerg = {}
    for t in NOMS:
        flux = [a for x, arts in par_texte.items() for a in arts]
        emerg[t] = emergence(t, flux)
    json.dump(res, open(os.path.join(ICI, "resultats.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    note = ("note imposée %s" % NOTE_IMPOSEE) if NOTE_IMPOSEE else (
        "vrai modèle de pertinence" if PERT.modele is not None else "note de secours par mots-clés (modèle absent)")
    L = ["# Test rétrospectif à l'aveugle — %s" % dt.date.today().isoformat(), "",
         "Notation : **%s**. « Aveugle » = le nom du texte est inconnu de l'outil." % note, ""]
    for groupe, titre in (("réglage", "Textes ayant servi au réglage"), ("contrôle", "Textes de CONTRÔLE (jamais utilisés pour régler)")):
        L += ["## " + titre, "",
              "| Texte | Proposition / projet | Visible « pertinent » dès | 1er point clé (aveugle) | Sujet émergent (aveugle) | 1er point clé (connu) | Points clés aveugle |",
              "|---|---|---|---|---|---|---|"]
        for t in NOMS:
            X = [r for r in res if r["texte"] == t and r["corpus"] == groupe]
            if not X:
                continue
            prop = min((r["date"] for r in X if r["etape"] in ("proposition", "projet", "transposition_projet")), default="—")
            def premier(mode, cond):
                y = [r for r in sorted(X, key=lambda r: r["date"]) if cond(r[mode])]
                return ("%s (%s)" % (y[0]["date"], y[0]["etape"])) if y else "**jamais**"
            e = emerg[t]
            L.append("| %s | %s | %s | %s | %s | %s | %d / %d |" % (
                t, prop, premier("aveugle", lambda a: a["niveau"] in ("elevee", "moyenne")),
                premier("aveugle", lambda a: bool(a["alerte"])), ("%s (« %s »)" % e) if e[0] else "—",
                premier("connu", lambda a: bool(a["alerte"])), sum(1 for r in X if r["aveugle"]["alerte"]), len(X)))
        L.append("")
    L += ["## Détail", "", "| Corpus | Texte | Date | Étape | Note | Aveugle | Point clé aveugle | Connu | Point clé connu | Titre |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    for r in sorted(res, key=lambda r: (r["corpus"], r["texte"], r["date"])):
        a, c = r["aveugle"], r["connu"]
        L.append("| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |" % (
            r["corpus"], r["texte"], r["date"], r["etape"], a["score"], NIV.get(a["niveau"], a["niveau"]), a["alerte"] or "—",
            NIV.get(c["niveau"], c["niveau"]), c["alerte"] or "—", r["titre"][:90].replace("|", "/")))
    open(os.path.join(ICI, "rapport.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
    print("\n".join(L[:30]))


if __name__ == "__main__":
    main()
