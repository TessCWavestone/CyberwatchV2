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


def mettre_a_jour(liste, ia, trad, client, cfg, aujourdhui, id_version, dossier):
    """Complète le registre chiffré. Retourne (nombre de nouveaux résumés, message)."""
    c = dict({"actif": True, "budget_minutes": 30, "max_articles": 60, "jours": 60}, **(cfg.get("ia_resume") or {}))
    mdp = os.environ.get("SLIDES_MOT_DE_PASSE", "").strip()
    chemin = os.path.join(dossier, "resumes.enc.json")
    if not c["actif"]:
        return 0, "désactivé (config/veille.json › ia_resume)"
    if not mdp:
        return 0, "secret SLIDES_MOT_DE_PASSE absent : aucun résumé"
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
        debut = time.time()
        for a in todo:
            if n >= c["max_articles"] or time.time() - debut > 60 * c["budget_minutes"]:
                msg = "temps imparti atteint : la suite à la prochaine collecte"
                break
            texte = a.get("_texte")
            if not texte:
                texte, err = lecture.lire_page(client, a["lien"])
                if err or not texte:
                    continue
                lecture.dates_page(a, texte, aujourdhui)   # au passage : dates réglementaires de la page
            try:
                resume, citations = ia.resumer(a, texte)
            except Exception as e:
                msg = "erreur IA : %s" % str(e)[:80]
                continue
            if not resume:
                continue
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
            registre[a["id"]] = {"r": resume, "c": cits, "mod": ia.cfg.get("modele_fichier", ""), "le": aujourdhui.isoformat(), "v": VERSION}
            n += 1
    env = chiffrer({"articles": registre, "maj": aujourdhui.isoformat()}, mdp)
    texte = json.dumps(env)
    with open(chemin, "w", encoding="utf-8") as f:
        f.write(texte)
    with open(os.path.join(dossier, "resumes.enc.js"), "w", encoding="utf-8") as f:
        f.write("window.CW_RESUMES_ENC = %s;\n" % texte)
    return n, msg + ("" if msg else "") + (" ; %d résumés au total" % len(registre))
