"""
Cyber Watch — note de pertinence de chaque article (gratuit, sans clé API).

Principe : AUCUN article n'est écarté. Chaque article reçoit une note
(élevée / moyenne / faible) et une justification « pourquoi il est là ».

Moteur : un petit modèle de langage open source et multilingue
(sentence-transformers, exécuté sur le serveur GitHub, hors ligne une fois
téléchargé). Il compare le SENS de l'article aux thèmes décrits dans
config/profil_pertinence.json : il reconnaît donc les synonymes, les autres
langues et les réglementations larges, sans liste de mots rigide.

Les mots-clés de l'Excel servent de justification et donnent un petit bonus ;
ils ne décident jamais seuls. Si le modèle n'est pas disponible, la note est
calculée à partir des mots-clés (mode dégradé, signalé sur le site).
"""

import hashlib
import json
import os

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Pertinence:
    def __init__(self, cfg):
        with open(os.path.join(RACINE, "config", "profil_pertinence.json"), encoding="utf-8") as f:
            self.profil = json.load(f)
        self.themes = self.profil["themes"]
        self.seuils = self.profil.get("seuils", {})
        self.bonus = self.profil.get("bonus_mots_cles", {})
        self.non_suff = set(cfg.get("groupes_non_suffisants", []))
        self.version = hashlib.sha1(json.dumps(self.profil, sort_keys=True).encode()).hexdigest()[:10]
        self.modele, self.erreur = None, ""
        self._charger()

    def _charger(self):
        try:
            from sentence_transformers import SentenceTransformer
            self.modele = SentenceTransformer(self.profil.get("modele"), device="cpu")
            phrases, self._idx = [], []
            for i, th in enumerate(self.themes):
                for p in th["phrases"] + [th["fr"], th["en"]]:
                    phrases.append(p)
                    self._idx.append(i)
            self._vec_themes = self.modele.encode(phrases, normalize_embeddings=True, batch_size=32)
        except Exception as e:  # modèle absent : mode mots-clés
            self.modele = None
            self.erreur = "Modèle de pertinence indisponible (%s) : note calculée à partir des mots-clés." % str(e)[:120]

    @property
    def mode(self):
        return "modele" if self.modele is not None else "mots_cles"

    # ------------------------------------------------------------------ calcul

    def _niveau(self, score):
        if score >= self.seuils.get("elevee", 0.55):
            return "elevee"
        if score >= self.seuils.get("moyenne", 0.40):
            return "moyenne"
        return "faible"

    def noter(self, articles):
        """Ajoute pertinence, score, themes et rubrique aux articles qui n'ont
        pas encore de note pour ce profil. Les articles de la base de
        connaissance gardent la note attribuée lors de la recherche."""
        a_noter = [a for a in articles if not a.get("base")
                   and (a.get("pertinence_v") != self.version + self.mode or "pertinence" not in a)]
        if not a_noter:
            return 0
        sims = None
        if self.modele is not None:
            textes = []
            for a in a_noter:
                t = (a["titre"] + ". " + (a.get("resume") or ""))[:700]
                en = (a.get("trad") or {}).get("en") or {}
                if en.get("titre"):
                    t += " / " + en["titre"]
                textes.append(t)
            vec = self.modele.encode(textes, normalize_embeddings=True, batch_size=32, show_progress_bar=False)
            sims = vec @ self._vec_themes.T  # similarité cosinus article × phrase
        for k, a in enumerate(a_noter):
            groupes = a.get("groupes") or []
            fort = any(g not in self.non_suff for g in groupes)
            bonus = self.bonus.get("groupe_fort", 0.12) if fort else (self.bonus.get("groupe_faible", 0.05) if groupes else 0)
            par_theme = {}
            if sims is not None:
                for j, s in enumerate(sims[k]):
                    i = self._idx[j]
                    v = float(s) * self.themes[i].get("poids", 1)
                    par_theme[i] = max(par_theme.get(i, -1), v)
                classes = sorted(par_theme.items(), key=lambda x: -x[1])
                meilleur = classes[0][1]
                score = min(1.0, meilleur + bonus)
                themes = [self.themes[i]["id"] for i, v in classes[:3]
                          if v >= meilleur - 0.06 and v >= self.seuils.get("moyenne", 0.40) - 0.1][:2]
            else:
                # mode dégradé : un mot-clé d'un groupe « fort » = élevée, autre mot-clé = moyenne
                score = 0.6 if fort else (0.45 if groupes else 0.2)
                themes = []
            a["score"] = round(score, 3)
            a["pertinence"] = self._niveau(score)
            a["themes"] = themes
            a["pertinence_v"] = self.version + self.mode
            # rubrique : celle des mots-clés si elle existe, sinon celle du thème le plus proche
            if not a.get("rubrique_mots_cles"):
                th = next((t for t in self.themes if themes and t["id"] == themes[0]), None)
                a["rubrique"] = th["rubrique"] if th and a["pertinence"] != "faible" else "autres"
        return len(a_noter)

    def libelles(self):
        return {t["id"]: {"fr": t["fr"], "en": t["en"]} for t in self.themes}
