"""
Cyber Watch — test rétrospectif « à l'aveugle » (v6).

Question : l'outil aurait-il fait remonter un texte au bon moment S'IL NE LE CONNAISSAIT PAS ?

Deux corpus de publications réelles (titres exacts, dates, sources) :
  - corpus.json          NIS2, CRA, AI Act, EHDS, ENS  -> textes ayant servi à régler les règles
  - corpus_controle.json DORA, Data Act, CER, PLD, UK Cyber Security and Resilience Bill (contrôle)

Mode AVEUGLE : le NOM du texte est « oublié » partout (textes clés, sujets suivis, mots-clés de l'Excel) ;
le sujet reste visible, comme pour un vrai texte futur. Mode CONNU : listes actuelles (référence).

Trois façons de lire chaque publication (variable MODES, par défaut « mots,sens,page ») :
  mots  titre + résumé, mots + note du modèle de pertinence (comme v5)
  sens  + classement par le sens (modèle NLI open source) sur le titre et le résumé
  page  + lecture de la page de la publication (si le site l'autorise) et sens sur le texte de la page,
        + « qui est concerné »
Plus :
  - « Qui est concerné » : phrases de contrôle dont la bonne réponse est connue (dont des textes HORS
    périmètre : banques, administrations, télécoms) et des phrases qui ne disent rien (rien ne doit sortir).
  - Bruit sur les vraies données (data/actualites.json + ecartes.json, 120 derniers jours) : collectes
    hebdomadaires rejouées, nombre de NOUVEAUX points clés par mois avec et sans le sens, et leurs titres.

Lancement : python tests/retro/test_aveugle.py      (rapport : tests/retro/rapport.md)
"""
import datetime as dt, json, os, re, sys, time
from concurrent.futures import ThreadPoolExecutor
ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(os.path.dirname(ICI))
sys.path.insert(0, os.path.join(RACINE, "collecte"))
os.chdir(RACINE)
import openpyxl
import collecte, regles, alertes, pertinence, sujets

NOTE_IMPOSEE = os.environ.get("NOTE_IMPOSEE")
MODES = [m for m in os.environ.get("MODES", "mots,sens,page").split(",") if m in ("mots", "sens", "page")] or ["mots"]
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

SENS, lecture, NOTE_SENS = None, None, ""
if any(m in MODES for m in ("sens", "page")):
    import sens as sens_mod, lecture
    t0 = time.time()
    SENS = sens_mod.Sens(PERT.profil, 4 * 3600)
    NOTE_SENS = ("classifieur « %s » chargé en %d s" % (SENS.nom, time.time() - t0)) if SENS.actif else SENS.erreur
    print(NOTE_SENS)
    if not SENS.actif:
        MODES = ["mots"]

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

# ----------------------------------------------------------------------------- pages des publications
PAGES = {}


def lire_pages_corpus():
    client = collecte.Client(cfg)
    urls = sorted({it["url"] for it in CORPUS})
    with ThreadPoolExecutor(max_workers=8) as pool:
        for u, r in zip(urls, pool.map(lambda u: lecture.lire_page(client, u), urls)):
            PAGES[u] = r


def evaluer(item, aveugle, mode):
    rx = re.compile(NOMS[item["texte"]], re.I) if aveugle else None
    OUBLI["rx"] = rx
    mc = [x for x in MC if not (rx and (rx.search(x[1]) or rx.search(x[2].pattern)))]
    a = {"titre": item["titre"], "resume": item["resume"], "lien": item["url"], "date": dt.date.fromisoformat(item["date"])}
    art = collecte.nouvel_article(a, {"nom": item["source"], "zone": item["zone"]}, "test", mc, cfg, item["nature"])
    art["langue"] = item["langue"]
    art["id"] = "t" + str(abs(hash((item["texte"], item["date"], item["titre"]))))[:12]
    if mode == "page":
        texte, err = PAGES.get(item["url"], ("", "non lue"))
        if texte and not err:
            art["_texte"] = texte
            art["indices_page"] = regles.indices_page(texte)
    if mode in ("sens", "page"):
        SENS.analyser([art])
    PERT.noter([art])
    r = {"niveau": art["pertinence"], "essentiel": bool(art.get("essentiel")), "statut": art.get("statut", ""),
         "score": art.get("score"), "alerte": alertes.type_article(art) or "", "motif": art.get("motif", ""),
         "sens_fort": bool(art.get("sens_fort")), "sens": {k: v for k, v in (art.get("sens") or {}).items() if k != "v"},
         "page": bool(art.get("_texte"))}
    if mode == "page" and aveugle and r["niveau"] in ("elevee", "moyenne"):
        SENS.concernes([art], lambda x: lecture.phrases_candidates(
            x.get("_texte") or ((x.get("titre") or "") + ". " + (x.get("resume") or ""))))
        c = art.get("concernes") or {}
        if c.get("acteurs"):
            r["concernes"] = {k: c[k] for k in ("acteurs", "hors_perimetre")}
            if c.get("hors_perimetre"):      # comme dans la collecte : un texte sûrement hors périmètre n'est pas un point clé
                r["alerte"] = ""
    OUBLI["rx"] = None
    art.pop("_texte", None)
    return r, art


def emergence(texte, arts_aveugles):
    """Première date à laquelle le détecteur de sujets émergents aurait levé une alerte sur le nom du texte."""
    rx = re.compile(NOMS[texte], re.I)
    def connu(m):
        return False if rx.search(m) else _connu_orig(m)
    dates = sorted({a["date"] for a in arts_aveugles if a["_nom"] == texte})
    for d in dates:
        for terme, arts in alertes.emergents(arts_aveugles, dt.date.fromisoformat(d), connu):
            if rx.search(terme) or all(a["_nom"] == texte for a in arts):
                return d, terme
    return None, None


# ----------------------------------------------------------------------------- « qui est concerné » : contrôle
# (phrase, catégories attendues, hors périmètre attendu) ; None = la phrase ne dit pas qui est concerné
PHRASES_CONCERNES = [
    ("This Regulation applies to credit institutions, payment institutions, investment firms, insurance and "
     "reinsurance undertakings and other financial entities.", {"finance"}, True),
    ("Le présent règlement s'applique aux institutions, organes et organismes de l'Union.", {"public"}, True),
    ("These obligations apply only to providers of public electronic communications networks and services.", {"telecom"}, True),
    ("Diese Vorschriften gelten nur für Kreditinstitute und Versicherungsunternehmen.", {"finance"}, True),
    ("This Directive applies to public or private entities referred to in the Annexes, including manufacturers of "
     "medical devices and in vitro diagnostic medical devices, which qualify as medium-sized enterprises.", {"entites", "dm"}, False),
    ("This Regulation applies to products with digital elements made available on the market whose intended purpose "
     "includes a data connection to a device or network.", {"produits"}, False),
    ("This Regulation applies to providers placing on the market AI systems in the Union and to deployers of AI systems.", {"ia"}, False),
    ("Ce règlement s'applique aux fabricants de dispositifs médicaux de diagnostic in vitro et à leurs mandataires.", {"dm"}, False),
    ("Diese Verordnung gilt für Krankenhäuser und Labore, die Gesundheitsdaten verarbeiten.", {"sante"}, False),
    ("El reglamento se aplicará a los proveedores de servicios de computación en la nube.", {"tic"}, False),
    ("The Commission published its annual report on the state of the digital decade on Tuesday.", None, None),
    ("Ransomware attack hits hospital in northern Italy, systems offline for days.", None, None),
    ("Les entreprises devront être attentives aux prochaines annonces du gouvernement.", None, None),
]


def test_concernes():
    lignes = []
    for i, (ph, attendu, hors) in enumerate(PHRASES_CONCERNES):
        a = {"id": "c%d" % i, "_texte": ph}
        cand = lecture.phrases_candidates(ph)
        SENS.concernes([a], lambda x: cand)
        c = a.get("concernes") or {}
        trouve = set(c.get("acteurs") or [])
        if attendu is None:
            verdict = "OK (rien)" if not trouve else "ERREUR : a trouvé quelque chose"
        elif not trouve:
            verdict = "prudent (rien d'affiché)" + ("" if cand else " — phrase non repérée")
        elif bool(c.get("hors_perimetre")) != hors:
            verdict = "ERREUR : hors périmètre %s" % ("non détecté" if hors else "à tort")
        elif not (trouve & attendu):
            verdict = "ERREUR : mauvaise catégorie"
        else:
            verdict = "OK"
        lignes.append((ph, attendu, hors, trouve, bool(c.get("hors_perimetre")), verdict))
    return lignes


# ----------------------------------------------------------------------------- bruit sur les vraies données
def bruit_reel(mode, jours=120):
    """Rejoue les collectes hebdomadaires des `jours` derniers jours sur les vraies données ; retourne
    {mois: [titres des nouveaux points clés]} ou None si les données sont absentes."""
    def lire(n):
        try:
            return json.load(open(os.path.join(RACINE, "data", n + ".json"), encoding="utf-8")).get("articles", [])
        except Exception:
            return []
    arts = [a for a in lire("actualites") + lire("ecartes") if not a.get("base")]
    if not arts:
        return None
    fin = dt.date.today()
    debut = fin - dt.timedelta(days=jours)
    arts = [a for a in arts if a.get("date", "") >= (debut - dt.timedelta(days=60)).isoformat()]
    for a in arts:
        a.pop("concernes", None)
        if mode == "mots":
            a.pop("sens", None)
    if mode != "mots":
        cand = [a for a in arts if a.get("nature") not in ("rkc", "opinion") and a.get("date", "") >= debut.isoformat()]
        SENS.analyser(cand, 5000)
    PERT.noter(arts)
    ref = json.load(open(os.path.join(RACINE, "config", "referentiel.json"), encoding="utf-8")) \
        if os.path.exists(os.path.join(RACINE, "config", "referentiel.json")) else {}
    ancien, nouveaux, vus = {}, {}, set()
    jour = debut + dt.timedelta(days=(7 - debut.weekday()) % 7)   # lundis
    while jour <= fin:
        visibles = [a for a in arts if a.get("date", "") <= jour.isoformat()]
        liste = [a for a in visibles if a.get("pertinence") != "ecarte"]
        ecartes = [a["id"] for a in visibles if a.get("pertinence") == "ecarte"]
        als = alertes.construire(liste, ancien, ref, jour, None, ecartes)
        for al in als:
            if al.get("active") and al["id"] not in vus and al.get("type") != "echeance":
                vus.add(al["id"])
                nouveaux.setdefault(jour.isoformat()[:7], []).append(
                    "%s — %s%s" % (jour.isoformat(), ("[%s] " % al["texte"]) if al.get("texte") else "",
                                  ((al.get("articles") or [{}])[0].get("titre") or "")[:110]))
        ancien = {"alertes": als}
        jour += dt.timedelta(days=7)
    return nouveaux


NIV = {"elevee": "très pertinent", "moyenne": "pertinent", "faible": "à surveiller", "ecarte": "écarté"}


def main():
    t0 = time.time()
    if "page" in MODES:
        lire_pages_corpus()
        print("Pages du corpus : %d / %d lues" % (sum(1 for t, e in PAGES.values() if t and not e), len(PAGES)))
    meilleur = MODES[-1]
    res, flux = [], {m: [] for m in MODES}
    for it in CORPUS:
        r = dict(it)
        for m in MODES:
            av, art = evaluer(it, True, m)
            art["_nom"] = it["texte"]
            flux[m].append(art)
            r[m] = av
        r["connu"], _ = evaluer(it, False, meilleur)
        res.append(r)
    regles.textes_cles = _tc_orig
    emerg = {m: {t: emergence(t, flux[m]) for t in NOMS} for m in MODES}
    print("Corpus évalué (%d s)" % (time.time() - t0))

    note = ("note imposée %s" % NOTE_IMPOSEE) if NOTE_IMPOSEE else (
        "vrai modèle de pertinence" if PERT.modele is not None else "note de secours par mots-clés (modèle absent)")
    NOM_MODE = {"mots": "mots", "sens": "+ sens", "page": "+ sens + page"}
    L = ["# Test rétrospectif à l'aveugle (v6) — %s" % dt.date.today().isoformat(), "",
         "Notation : **%s**. Classement par le sens : %s." % (note, NOTE_SENS or "non testé"),
         "« Aveugle » = le nom du texte est inconnu de l'outil. Colonnes : 1er point clé selon la façon de lire "
         "(**mots** = titre et résumé comme en v5 ; **+ sens** = + classement par le sens ; **+ sens + page** = "
         "+ lecture de la page).", ""]
    if "page" in MODES:
        err = {}
        for t, e in PAGES.values():
            if e or not t:
                err[e or "vide"] = err.get(e or "vide", 0) + 1
        L += ["Pages des publications lues : **%d / %d**%s." % (
            sum(1 for t, e in PAGES.values() if t and not e), len(PAGES),
            (" (non lues : " + ", ".join("%s × %d" % (k[:50], v) for k, v in sorted(err.items(), key=lambda x: -x[1])[:5]) + ")") if err else ""), ""]
    for groupe, titre in (("réglage", "Textes ayant servi au réglage"), ("contrôle", "Textes de CONTRÔLE (jamais utilisés pour régler)")):
        L += ["## " + titre, "",
              "| Texte | Proposition / projet | " + " | ".join("1er point clé (%s)" % NOM_MODE[m] for m in MODES) +
              " | Sujet émergent | 1er point clé (connu) | Points clés aveugle (%s) |" % NOM_MODE[meilleur],
              "|---|---|" + "---|" * len(MODES) + "---|---|---|"]
        for t in NOMS:
            X = sorted([r for r in res if r["texte"] == t and r["corpus"] == groupe], key=lambda r: r["date"])
            if not X:
                continue
            prop = min((r["date"] for r in X if r["etape"] in ("proposition", "projet", "transposition_projet")), default="—")
            def premier(mode):
                y = [r for r in X if r[mode]["alerte"]]
                return ("%s (%s)" % (y[0]["date"], y[0]["etape"])) if y else "**jamais**"
            e = emerg[meilleur][t]
            L.append("| %s | %s | %s | %s | %s | %d / %d |" % (
                t, prop, " | ".join(premier(m) for m in MODES), ("%s (« %s »)" % e) if e[0] else "—",
                premier("connu"), sum(1 for r in X if r[meilleur]["alerte"]), len(X)))
        L.append("")

    # qui est concerné
    if SENS is not None and SENS.actif:
        lignes = test_concernes()
        ok = sum(1 for x in lignes if x[5].startswith("OK"))
        err = sum(1 for x in lignes if x[5].startswith("ERREUR"))
        L += ["## « Qui est concerné » — phrases de contrôle", "",
              "Règle : n'afficher que si c'est sûr ; « hors périmètre » seulement si toutes les catégories trouvées "
              "sont hors périmètre. **%d OK, %d prudents (rien affiché), %d erreurs** sur %d." % (ok, len(lignes) - ok - err, err, len(lignes)), "",
              "| Phrase | Attendu | Trouvé | Hors périmètre | Verdict |", "|---|---|---|---|---|"]
        for ph, att, hors, tr, h, v in lignes:
            L.append("| %s | %s | %s | %s | %s |" % (ph[:110].replace("|", "/"), ", ".join(sorted(att)) if att else "rien",
                                                     ", ".join(sorted(tr)) or "—", "oui" if h else "non", v))
        L.append("")
        if "page" in MODES:
            trouves = [r for r in res if r["page"].get("concernes")]
            L += ["Dans le corpus (pages lues, publications pertinentes) : « qui est concerné » trouvé pour **%d** publications." % len(trouves), ""]
            if trouves:
                L += ["| Texte | Date | Acteurs | Hors périmètre | Titre |", "|---|---|---|---|---|"]
                for r in trouves:
                    c = r["page"]["concernes"]
                    L.append("| %s | %s | %s | %s | %s |" % (r["texte"], r["date"], ", ".join(c["acteurs"]),
                                                             "**oui**" if c["hors_perimetre"] else "non", r["titre"][:100].replace("|", "/")))
                L.append("")

    # bruit sur les vraies données
    L += ["## Bruit sur les vraies données (120 derniers jours, collectes hebdomadaires rejouées)", "",
          "Nombre de NOUVEAUX points clés par mois (hors échéances). Objectif : environ 5 à 8 par mois.", ""]
    bruits = {}
    for m in ["mots"] + (["sens"] if SENS is not None and SENS.actif else []):
        t1 = time.time()
        bruits[m] = bruit_reel(m)
        print("Bruit (%s) : %d s" % (m, time.time() - t1))
    if all(v is None for v in bruits.values()):
        L += ["_Données absentes (data/actualites.json) : test non fait._", ""]
    else:
        mois = sorted({k for v in bruits.values() if v for k in v})
        L += ["| Mois | " + " | ".join(NOM_MODE[m] for m in bruits) + " |", "|---|" + "---|" * len(bruits)]
        for mo in mois:
            L.append("| %s | %s |" % (mo, " | ".join(str(len((bruits[m] or {}).get(mo, []))) for m in bruits)))
        L.append("")
        for m, v in bruits.items():
            L += ["<details><summary>Nouveaux points clés (%s)</summary>" % NOM_MODE[m], ""]
            for mo in sorted(v or {}):
                L += ["- " + x.replace("|", "/") for x in v[mo]]
            L += ["", "</details>", ""]

    L += ["## Détail", "", "| Corpus | Texte | Date | Étape | Note | " + " | ".join(NOM_MODE[m] for m in MODES) +
          " | Sens (reg / sujet / bruit) | Page lue | Titre |", "|---|---|---|---|---|" + "---|" * len(MODES) + "---|---|---|"]
    for r in sorted(res, key=lambda r: (r["corpus"], r["texte"], r["date"])):
        b = r[meilleur]
        s = b.get("sens") or {}
        cell = lambda x: NIV.get(x["niveau"], x["niveau"]) + (" ★" if x["alerte"] else "")
        L.append("| %s | %s | %s | %s | %s | %s | %s | %s | %s |" % (
            r["corpus"], r["texte"], r["date"], r["etape"], b["score"], " | ".join(cell(r[m]) for m in MODES),
            ("%.2f / %.2f / %.2f" % (s.get("reg", 0), s.get("sujet", 0), s.get("bruit", 0))) if s else "—",
            "oui" if b.get("page") else "—", r["titre"][:90].replace("|", "/")))
    L += ["", "★ = devient un point clé. Durée totale : %d s." % (time.time() - t0)]
    json.dump(res, open(os.path.join(ICI, "resultats.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
    open(os.path.join(ICI, "rapport.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
    print("\n".join(L[:40]))


if __name__ == "__main__":
    main()
