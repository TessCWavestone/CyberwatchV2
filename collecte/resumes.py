"""
Cyber Watch — résumés et citations pour les slides (v11, décisions du 09/11/2026).

- L'IA open source de tri (même modèle, gratuite) écrit, pour les articles « très pertinent » et « pertinent »,
  un résumé de 2 ou 3 phrases EN ANGLAIS et choisit 1 ou 2 citations COPIÉES de l'article.
- Chaque citation est VÉRIFIÉE : elle doit figurer mot pour mot dans le texte de la page ; sinon elle est rejetée
  (une IA peut inventer). Une citation qui n'est pas en anglais est traduite par notre outil de traduction
  (Argos Translate ou, en secours, Opus-MT), dont le nom est enregistré pour être affiché dans la slide.
- Jamais pour la veille RKC (contenu payant), une page fermée ou un avis d'expert.
- Rien n'est affiché sur le site : tout est enregistré CHIFFRÉ (AES-256-GCM, clé tirée du mot de passe par
  PBKDF2-SHA256) dans data/resumes.enc.js. Le mot de passe est le secret GitHub SLIDES_MOT_DE_PASSE ; il est demandé
  au moment de générer les slides. Sans ce secret, aucun résumé n'est fait.
- Les nouveaux articles d'abord, puis les 60 derniers jours, dans le temps imparti (le reste à la collecte suivante).
"""

import base64
import datetime as dt
import json
import os
import re
import time
import unicodedata

import lecture

ITERATIONS = 310000
VERSION = "r1"


def _cle(mot_de_passe, sel):
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=sel, iterations=ITERATIONS).derive(mot_de_passe.encode("utf-8"))


def chiffrer(donnees, mot_de_passe):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    sel, iv = os.urandom(16), os.urandom(12)
    brut = json.dumps(donnees, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ct = AESGCM(_cle(mot_de_passe, sel)).encrypt(iv, brut, None)   # texte chiffré + étiquette (format WebCrypto)
    b = lambda x: base64.b64encode(x).decode("ascii")
    return {"v": 1, "kdf": "PBKDF2-SHA256", "iter": ITERATIONS, "sel": b(sel), "iv": b(iv), "data": b(ct)}


def dechiffrer(enveloppe, mot_de_passe):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    d = lambda x: base64.b64decode(x)
    brut = AESGCM(_cle(mot_de_passe, d(enveloppe["sel"]))).decrypt(d(enveloppe["iv"]), d(enveloppe["data"]), None)
    return json.loads(brut.decode("utf-8"))


def _norm(s):
    s = unicodedata.normalize("NFKC", s or "")
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"').replace("«", '"').replace("»", '"')
    s = re.sub(r"[   ]", " ", s)
    return re.sub(r"\s+", " ", s).strip().lower()


def verifier(citation, texte):
    """La citation figure-t-elle mot pour mot dans le texte (espaces, apostrophes et casse mis à part) ?"""
    c = _norm(citation).strip(' ."\'')
    return len(c) >= 25 and c in _norm(texte)


def _candidat(a, limite):
    return (a.get("pertinence") in ("elevee", "moyenne") and a.get("date", "") >= limite and a.get("lien", "").startswith("http")
            and a.get("nature") not in ("rkc", "opinion") and not a.get("base") and not a.get("payant") and not a.get("reserve")
            and not a.get("doublon_de"))


def _travail(cfg_ia, lots, budget_s, file):
    """Processus fils : charge le modèle, résume les articles un par un, envoie chaque résultat dès qu'il est prêt
    (tuyau direct, sans tampon : un résultat envoyé est gardé même si le processus plante juste après)."""
    import tri_ia
    ia = tri_ia.TriIA(cfg_ia)
    if not ia.actif:
        file.send(("erreur", ia.erreur[:120]))
        return
    debut = time.time()
    for a, texte in lots:
        if time.time() - debut > budget_s:
            file.send(("erreur", "time limit reached: the rest at the next collection"))
            break
        try:
            file.send(("ok", (a["id"],) + tuple(ia.resumer(a, texte))))
        except Exception as e:
            file.send(("erreur", "AI error: %s" % str(e)[:80]))
    file.send(("fin", None))
    file.close()


def _resumer_isole(ia, lots, budget_s):
    """Lance _travail dans un processus séparé ; retourne ({id: (résumé, citations)}, message)."""
    import multiprocessing as mp
    if not lots:
        return {}, ""
    # le modèle du tri est libéré d'abord (il n'est plus utilisé) : la mémoire va au processus fils
    ia.llm = None
    import gc
    gc.collect()
    ctx = mp.get_context("spawn")
    lecture_f, file = ctx.Pipe(duplex=False)
    legers = [({k: a.get(k, "") for k in ("id", "titre", "source", "zone", "date")}, t) for a, t in lots]
    p = ctx.Process(target=_travail, args=({"ia_tri": dict(ia.cfg)}, legers, budget_s, file), daemon=True)
    p.start()
    file.close()   # le parent ne garde que le bout « lecture »
    res, msg, fin = {}, "", time.time() + budget_s + 900
    while time.time() < fin:
        try:
            if not lecture_f.poll(30):
                if not p.is_alive():
                    break
                continue
            genre, val = lecture_f.recv()
        except (EOFError, OSError):
            break   # processus fils arrêté
        if genre == "ok":
            res[val[0]] = (val[1], val[2])
        elif genre == "erreur":
            msg = val
        else:
            break
    lecture_f.close()
    p.join(timeout=60)
    if p.is_alive():
        p.terminate()
        msg = "summary process stopped (too long)"
    elif p.exitcode not in (0, None):
        msg = "the model crashed (code %s): %d summaries kept, the rest at the next collection" % (p.exitcode, len(res))
    return res, msg


def mettre_a_jour(liste, ia, trad, client, cfg, aujourdhui, id_version, dossier):
    """Complète le registre chiffré. Retourne (nombre de nouveaux résumés, message)."""
    c = dict({"actif": True, "budget_minutes": 30, "max_articles": 60, "jours": 60}, **(cfg.get("ia_resume") or {}))
    mdp = os.environ.get("SLIDES_MOT_DE_PASSE", "").strip()
    chemin = os.path.join(dossier, "resumes.enc.json")
    if not c["actif"]:
        return 0, "disabled (config/veille.json › ia_resume)"
    if not mdp:
        return 0, "SLIDES_MOT_DE_PASSE secret missing: no summary"
    registre = {}
    if os.path.exists(chemin):
        try:
            with open(chemin, encoding="utf-8") as f:
                registre = dechiffrer(json.load(f), mdp).get("articles", {})
        except Exception:
            registre = {}   # mot de passe changé ou fichier abîmé : on repart de zéro
    ids = {a["id"] for a in liste}
    registre = {k: v for k, v in registre.items() if k in ids}   # articles sortis du site : oubliés
    n, msg = 0, ""
    if ia is not None and getattr(ia, "actif", False):
        limite = (aujourdhui - dt.timedelta(days=c["jours"])).isoformat()
        todo = [a for a in liste if _candidat(a, limite) and a["id"] not in registre]
        todo.sort(key=lambda a: a.get("date", ""), reverse=True)
        todo.sort(key=lambda a: (a.get("version") != id_version, a.get("pertinence") != "elevee"))
        # 1. textes des pages (lus ici, jamais enregistrés)
        lots = []
        for a in todo[:c["max_articles"]]:
            texte = a.get("_texte")
            if not texte:
                texte, err = lecture.lire_page(client, a["lien"])
                if err or not texte:
                    continue
                lecture.dates_page(a, texte, aujourdhui)   # au passage : dates réglementaires de la page
            lots.append((a, texte))
        # 2. l'IA écrit les résumés dans un PROCESSUS SÉPARÉ : si llama.cpp plante (collecte du 16/11/2026 :
        #    « grammar recursion depth limit exceeded » puis erreur 139), seule cette étape s'arrête ; la collecte
        #    continue et les résumés déjà écrits sont gardés.
        resultats, msg = _resumer_isole(ia, lots, 60 * c["budget_minutes"])
        par_id = {a["id"]: (a, texte) for a, texte in lots}
        for ident, (resume, citations) in resultats.items():
            if ident not in par_id or not resume:
                continue
            a, texte = par_id[ident]
            langue = a.get("langue") or "en"
            cits = []
            for q in citations:
                if not verifier(q, texte):
                    continue   # citation introuvable dans l'article : rejetée
                x = {"t": q, "l": langue}
                if langue != "en" and trad is not None and getattr(trad, "actif", False):
                    tr, outil = trad.traduire_citation(q, langue)
                    if tr:
                        x["tr"], x["m"] = tr, outil
                cits.append(x)
            registre[ident] = {"r": resume, "c": cits, "mod": ia.cfg.get("modele_fichier", ""), "le": aujourdhui.isoformat(), "v": VERSION}
            n += 1
    env = chiffrer({"articles": registre, "maj": aujourdhui.isoformat()}, mdp)
    texte = json.dumps(env)
    with open(chemin, "w", encoding="utf-8") as f:
        f.write(texte)
    with open(os.path.join(dossier, "resumes.enc.js"), "w", encoding="utf-8") as f:
        f.write("window.CW_RESUMES_ENC = %s;\n" % texte)
    return n, msg + ("" if msg else "") + (" ; %d summaries in total" % len(registre))
