"""
Cyber Watch — compréhension « par le sens » (v6), gratuite, sans IA générative.

Un modèle open source de classification multilingue (« zero-shot », famille NLI : il dit si une phrase
découle d'un texte, il ne rédige rien) répond à des questions posées en clair, quelle que soit la langue et
quels que soient les mots de l'article :
  reg     « Ce texte parle-t-il d'une loi, d'un règlement… ou d'un projet / d'une consultation ? »
  projet  « … d'un projet de texte ou d'une consultation ? »
  adopte  « … d'un texte adopté, publié ou entré en vigueur ? »
  sujet   « … de cybersécurité, de protection des données, d'IA, de données de santé ou de dispositifs médicaux ? »
  bruit   « … d'une attaque, d'une vulnérabilité, d'un événement ou d'une annonce commerciale ? »
Les probabilités sont enregistrées dans a['sens'] et utilisées par regles.evaluer, en plus des mots.

« Qui est concerné » : pour les phrases qui annoncent un champ d'application (lecture.phrases_candidates),
le modèle confirme que la phrase dit bien qui doit appliquer le texte, puis quelles catégories d'acteurs.
Seulement si c'est sûr (probabilités élevées) ; sinon rien n'est affiché.

Modèle : config/profil_pertinence.json › "modele_sens" (par défaut mDeBERTa-v3 multilingue NLI). S'il ne
peut pas être installé, la collecte continue sans (mots + note du modèle de pertinence).
"""

import time

MODELE_DEFAUT = "MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7"
VERSION = "s1"
QUESTIONS = {
    "reg": "This text is about a law, a regulation, a directive, a decree or official binding rules, or about a proposal or a public consultation for new rules.",
    "projet": "This text is about a draft law, a legislative proposal, ongoing negotiations on a law or a public consultation.",
    "adopte": "This text is about a law or regulation that has been adopted, published or has entered into force.",
    "sujet": "This text is about cybersecurity, data protection, artificial intelligence, health data or medical devices.",
    "bruit": "This text is about a cyber attack, a security vulnerability, a conference or event, or a company's commercial news.",
}
CHAMP = "This sentence says which organisations or companies have to comply with the rules."
# catégories d'acteurs : (id, libellé fr, libellé en, question, dans le périmètre de l'entreprise ?)
ACTEURS = [
    ("dm", "fabricants de dispositifs médicaux / de diagnostic in vitro", "medical device / IVD manufacturers",
     "The rules apply to manufacturers of medical devices or in vitro diagnostic devices.", True),
    ("produits", "fabricants de produits ou logiciels numériques", "manufacturers of digital products or software",
     "The rules apply to manufacturers of connected products, software or products with digital elements.", True),
    ("sante", "établissements de santé et laboratoires", "healthcare providers and laboratories",
     "The rules apply to hospitals, healthcare providers or laboratories.", True),
    ("entites", "entités essentielles / importantes, entités critiques", "essential / important / critical entities",
     "The rules apply to essential or important entities, critical entities or operators of essential services.", True),
    ("donnees", "toute organisation traitant des données personnelles", "any organisation processing personal data",
     "The rules apply to all companies or organisations that process personal data.", True),
    ("ia", "fournisseurs et utilisateurs de systèmes d'IA", "providers and deployers of AI systems",
     "The rules apply to providers or users of artificial intelligence systems.", True),
    ("tic", "prestataires informatiques, cloud et numériques", "IT, cloud and digital service providers",
     "The rules apply to cloud, IT or digital service providers.", True),
    ("finance", "banques, assurances et entités financières", "banks, insurers and financial entities",
     "The rules apply only to banks, insurers or other financial institutions.", False),
    ("public", "administrations publiques", "public administrations",
     "The rules apply only to public administrations or government bodies.", False),
    ("telecom", "opérateurs de télécommunications", "telecom operators",
     "The rules apply only to telecommunications operators.", False),
]
SEUIL_SUR = 0.90


class Sens:
    def __init__(self, profil, budget_secondes=1500):
        self.nom = profil.get("modele_sens", MODELE_DEFAUT)
        self.clf, self.erreur = None, ""
        self.budget = budget_secondes
        self.faits = 0
        try:
            from transformers import pipeline
            self.clf = pipeline("zero-shot-classification", model=self.nom, device=-1)
        except Exception as e:
            self.erreur = "Classifieur par le sens indisponible (%s) : tri par mots et note du modèle." % str(e)[:140]

    @property
    def actif(self):
        return self.clf is not None

    def _probas(self, textes, hypotheses, taille=8):
        res = self.clf(textes, candidate_labels=hypotheses, hypothesis_template="{}", multi_label=True, batch_size=taille)
        if isinstance(res, dict):
            res = [res]
        return [dict(zip(r["labels"], r["scores"])) for r in res]

    @staticmethod
    def premisse(a):
        en = ((a.get("trad") or {}).get("en") or {})
        morceaux = [a.get("titre", ""), en.get("titre", "") if en.get("titre") != a.get("titre") else "",
                    a.get("resume", ""), (a.get("_texte") or "")[:1200]]
        return " ".join(m for m in morceaux if m)[:1800]

    def analyser(self, articles, max_n=700):
        """Classe les articles qui n'ont pas encore été classés (ou dont le texte a changé : page lue)."""
        if not self.actif:
            return 0
        debut = time.time()
        a_faire = [a for a in articles if (a.get("sens") or {}).get("v") != VERSION
                   or (a.get("_texte") and not (a.get("sens") or {}).get("page"))][:max_n]
        n = 0
        for i in range(0, len(a_faire), 16):
            if time.time() - debut > self.budget:
                self.erreur = "Budget de temps atteint : %d articles classés, les autres le seront à la prochaine collecte." % n
                break
            lot = a_faire[i:i + 16]
            hyp = list(QUESTIONS.values())
            for a, p in zip(lot, self._probas([self.premisse(a) for a in lot], hyp)):
                a["sens"] = {k: round(p.get(q, 0), 3) for k, q in QUESTIONS.items()}
                a["sens"]["v"] = VERSION
                if a.get("_texte"):
                    a["sens"]["page"] = True
            n += len(lot)
        self.faits += n
        return n

    def concernes(self, articles, phrases_de):
        """Pour chaque article, cherche une phrase qui dit SÛREMENT qui est concerné, puis les catégories.
        phrases_de(a) -> phrases candidates. Écrit a['concernes'] = {acteurs, phrase, hors_perimetre}."""
        if not self.actif:
            return 0
        n = 0
        for a in articles:
            if (a.get("concernes") or {}).get("v") == VERSION and not a.get("_texte"):
                continue
            phrases = phrases_de(a)
            a["concernes"] = {"v": VERSION}      # analysé (même si rien de sûr n'est trouvé)
            if not phrases:
                continue
            p_champ = self._probas(phrases, [CHAMP])
            sures = [ph for ph, p in zip(phrases, p_champ) if p.get(CHAMP, 0) >= SEUIL_SUR]
            if not sures:
                continue
            phrase = sures[0]
            p = self._probas([phrase], [x[3] for x in ACTEURS])[0]
            acteurs = [x for x in ACTEURS if p.get(x[3], 0) >= SEUIL_SUR]
            if not acteurs:
                continue
            dedans = [x for x in acteurs if x[4]]
            # la phrase elle-même n'est pas enregistrée (pas de contenu de l'article sur le site)
            a["concernes"] = {"v": VERSION, "acteurs": [x[0] for x in acteurs],
                              # hors périmètre seulement si c'est SÛR : catégories exclusives et aucune dans le périmètre
                              "hors_perimetre": bool(acteurs) and not dedans}
            n += 1
        return n


LIBELLES_ACTEURS = {x[0]: {"fr": x[1], "en": x[2], "perimetre": x[4]} for x in ACTEURS}
