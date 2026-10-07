"""
Cyber Watch — note de pertinence de chaque article (gratuit, sans clé API,
sans IA générative).

Deux étages :
  1. Un petit modèle open source multilingue (sentence-transformers, exécuté
     hors ligne sur le serveur GitHub) compare le SENS de l'article aux thèmes
     de config/profil_pertinence.json. Il donne une note de proximité (0 à 1)
     avec les thèmes utiles, et une note de proximité avec des thèmes « bruit »
     (alertes de vulnérabilités, événements, vœux, marchés…).
  2. Des règles explicites (regles.py) décident du niveau final : essentiel,
     très pertinent, pertinent, à surveiller ou écarté. Un texte clé cité
     (NIS2, CRA, IVDR…) n'est jamais écarté ; « très pertinent » exige un
     signal réglementaire ; le bruit est écarté (sauf source officielle).

Les avis des lecteurs (boutons « Important » / « Pas pertinent » du site,
enregistrés dans config/retours.json) priment sur le calcul et servent aussi
d'exemples au modèle.
"""

import hashlib
import json
import os

import regles

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def lire_retours():
    try:
        with open(os.path.join(RACINE, "config", "retours.json"), encoding="utf-8") as f:
            return json.load(f).get("articles", {})
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


class Pertinence:
    def __init__(self, cfg):
        with open(os.path.join(RACINE, "config", "profil_pertinence.json"), encoding="utf-8") as f:
            self.profil = json.load(f)
        self.retours = lire_retours()
        self.themes = [t for t in self.profil["themes"] if not t.get("negatif")]
        self.negatifs = [t for t in self.profil["themes"] if t.get("negatif")]
        # les avis des lecteurs servent d'exemples supplémentaires
        imp = [r["titre"] for r in self.retours.values() if r.get("avis") == "important" and r.get("titre")][-60:]
        pas = [r["titre"] for r in self.retours.values() if r.get("avis") == "pas_pertinent" and r.get("titre")][-60:]
        if imp:
            self.themes.append({"id": "retours_importants", "fr": "Jugé important par un lecteur",
                                "en": "Marked important by a reader", "rubrique": "reglementation", "phrases": imp})
        if pas:
            self.negatifs.append({"id": "retours_non_pertinents", "fr": "Jugé non pertinent", "en": "Marked not relevant",
                                  "rubrique": "autres", "phrases": pas, "negatif": True})
        self.seuils = self.profil.get("seuils", {})
        self.bonus = self.profil.get("bonus_mots_cles", {})
        self.non_suff = set(cfg.get("groupes_non_suffisants", []))
        empreinte = json.dumps([self.profil, imp, pas], sort_keys=True)
        self.version = "v4-" + hashlib.sha1(empreinte.encode()).hexdigest()[:10]
        self.modele, self.erreur = None, ""
        self._charger()

    def _charger(self):
        try:
            from sentence_transformers import SentenceTransformer
            self.modele = SentenceTransformer(self.profil.get("modele"), device="cpu")
            phrases, self._idx = [], []
            for i, th in enumerate(self.themes + self.negatifs):
                for p in th["phrases"] + ([th["fr"], th["en"]] if not th.get("negatif") else []):
                    phrases.append(p)
                    self._idx.append(i)
            self._vec_themes = self.modele.encode(phrases, normalize_embeddings=True, batch_size=32)
        except Exception as e:  # modèle absent : mode mots-clés
            self.modele = None
            self.erreur = "Modèle de pertinence indisponible (%s) : note calculée à partir des mots-clés." % str(e)[:120]

    @property
    def mode(self):
        return "modele" if self.modele is not None else "mots_cles"

    # ------------------------------------------------------------------ calcul du score (modèle)

    def _scorer(self, articles):
        a_noter = [a for a in articles if not a.get("base") and not self._fige(a)
                   and (a.get("pertinence_v") != self.version + self.mode or "score" not in a)]
        if not a_noter:
            return 0
        sims = None
        n_pos = len(self.themes)
        if self.modele is not None:
            # un texte long (extrait RKC privé) est découpé : on garde le meilleur morceau
            textes, proprio = [], []
            for k, a in enumerate(a_noter):
                if a.get("_texte"):
                    brut = a["_texte"]
                    morceaux = [a["titre"] + ". " + brut[i:i + 600] for i in range(0, min(len(brut), 6000), 550)] or [a["titre"]]
                else:
                    t = (a["titre"] + ". " + (a.get("resume") or ""))[:900]
                    en = (a.get("trad") or {}).get("en") or {}
                    if en.get("titre") and en["titre"] != a["titre"]:
                        t += " / " + en["titre"]
                    morceaux = [t]
                for m in morceaux:
                    textes.append(m)
                    proprio.append(k)
            vec = self.modele.encode(textes, normalize_embeddings=True, batch_size=32, show_progress_bar=False)
            brutes = vec @ self._vec_themes.T
            sims = [None] * len(a_noter)
            for ligne, k in zip(brutes, proprio):
                sims[k] = ligne if sims[k] is None else [max(x, y) for x, y in zip(sims[k], ligne)]
        for k, a in enumerate(a_noter):
            groupes = a.get("groupes") or []
            fort = any(g not in self.non_suff for g in groupes)
            bonus = self.bonus.get("groupe_fort", 0.08) if fort else (self.bonus.get("groupe_faible", 0.03) if groupes else 0)
            if sims is not None:
                par_theme = {}
                for j, s in enumerate(sims[k]):
                    i = self._idx[j]
                    th = (self.themes + self.negatifs)[i]
                    par_theme[i] = max(par_theme.get(i, -1), float(s) * th.get("poids", 1))
                pos = sorted(((i, v) for i, v in par_theme.items() if i < n_pos), key=lambda x: -x[1])
                neg = max((v for i, v in par_theme.items() if i >= n_pos), default=0)
                meilleur = pos[0][1]
                score = min(1.0, meilleur + bonus)
                themes = [self.themes[i]["id"] for i, v in pos[:3] if v >= meilleur - 0.06][:2]
                a["score_bruit"] = round(neg, 3)
            else:
                score = 0.6 if fort else (0.45 if groupes else 0.3)
                themes = []
                a.pop("score_bruit", None)
            a["score"] = round(score, 3)
            a["themes"] = themes
            a["pertinence_v"] = self.version + self.mode
        return len(a_noter)

    @staticmethod
    def _fige(a):
        """Article RKC déjà noté lors d'une collecte précédente : son extrait privé n'est
        plus disponible (jamais enregistré), on garde donc la décision prise à l'époque."""
        return a.get("nature") == "rkc" and not a.get("_texte") and "score" in a and a.get("pertinence")

    # ------------------------------------------------------------------ niveau final (règles)

    def noter(self, articles):
        """Calcule le score (si besoin) puis applique les règles à TOUS les
        articles (rapide) : a['pertinence'] = elevee / moyenne / faible / ecarte."""
        n = self._scorer(articles)
        for a in articles:
            if a.get("base"):
                continue
            avis = (self.retours.get(a["id"]) or {}).get("avis")
            if self._fige(a):
                if avis == "important":
                    a["pertinence"], a["essentiel"], a["motif"] = "elevee", True, "jugé important par un lecteur"
                elif avis == "pas_pertinent":
                    a["pertinence"], a["essentiel"], a["motif"] = "ecarte", False, "jugé non pertinent par un lecteur"
                continue
            r = regles.evaluer(a, self.seuils, a.get("score_bruit"))
            niveau = r["niveau"]
            if avis == "important":
                niveau, r["essentiel"], r["a_verifier"] = "elevee", True, False
                r["motif"] = "jugé important par un lecteur"
            elif avis == "pas_pertinent":
                niveau, r["essentiel"], r["motif"] = "ecarte", False, "jugé non pertinent par un lecteur"
            # source très volumineuse (journal officiel, flux de presse généraliste) :
            # le niveau « à surveiller » n'est pas gardé
            # Veille RKC et Débats et signaux : seuls « pertinent » et « très pertinent » sont gardés (choix validé)
            if a.get("nature") in ("rkc", "opinion") and niveau == "faible" and not avis:
                niveau = "ecarte"
                r["motif"] = r["motif"] or ("veille RKC" if a.get("nature") == "rkc" else "avis d'expert") + " : moins que « pertinent »"
            if a.get("filtre_pertinence") and niveau == "faible" and not avis:
                niveau = "ecarte"
                r["motif"] = r["motif"] or "source volumineuse : seuls les articles pertinents sont gardés"
            a["pertinence"] = niveau
            a["essentiel"] = bool(r["essentiel"])
            a["a_verifier"] = bool(r["a_verifier"])
            a["textes_cles"] = r["textes_cles"]
            if r.get("sens_fort"):
                a["sens_fort"] = True
            else:
                a.pop("sens_fort", None)
            a["motif"] = r["motif"]
            if r["bruit"]:
                a["bruit"] = r["bruit"]
            else:
                a.pop("bruit", None)
            if r["statut"] and not a.get("statut_manuel"):
                a["statut"] = r["statut"]
            if avis:
                a["avis_lecteur"] = avis
            # rubrique : texte clé > mots-clés > thème le plus proche ; « autres » en dessous de « pertinent »
            if niveau in ("elevee", "moyenne"):
                if r["rubrique_texte"]:
                    a["rubrique"] = r["rubrique_texte"]
                elif not a.get("rubrique_mots_cles"):
                    th = next((t for t in self.themes if a.get("themes") and t["id"] == a["themes"][0]), None)
                    a["rubrique"] = th["rubrique"] if th else "autres"
            else:
                a["rubrique"] = "autres"
        return n

    def libelles(self):
        return {t["id"]: {"fr": t["fr"], "en": t["en"]} for t in self.themes}
