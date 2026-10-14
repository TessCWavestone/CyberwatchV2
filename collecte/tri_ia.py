"""
Cyber Watch — tri des articles par une petite IA open source (v7, essai).

Pourquoi : les listes de mots et la note de proximité ne « comprennent » pas un article (« cyberharcèlement »
contient « cyber », « pharmacogénomique » est proche de « diagnostic »…). Une petite IA de langage open source,
gratuite, sans clé, exécutée sur le serveur GitHub, lit le titre, le résumé et le début de la page, puis répond
selon des critères écrits en clair : pertinent / à surveiller / pas pertinent, avec un motif pris dans une liste
fixe. Elle ne rédige rien pour le site : seuls l'avis et le motif (libellé fixe) sont enregistrés.

Modèle : config/veille.json › "ia_tri" › "modele" (voir MODELES : modèles open source à licence permissive,
format GGUF, exécutés avec llama.cpp sur le processeur du serveur GitHub). Le nom de l'entreprise suivie n'est jamais écrit dans le dépôt ni sur le site : il est lu, si
présent, dans le secret GitHub VEILLE_ENTREPRISE (variable d'environnement) et sert uniquement à l'IA.
Si l'IA ne peut pas être installée, la collecte continue avec les règles seules.
"""

import json
import os
import time

VERSION = "t1"

PAYS = ("Union européenne (textes européens), Allemagne, Autriche, Belgique, Bulgarie, Danemark, Espagne, "
        "Finlande, France, Grèce, Hongrie, Irlande, Italie, Luxembourg, Norvège, Pays-Bas, Pologne, Portugal, "
        "République tchèque, Royaume-Uni, Suède, Suisse")

ENTREPRISE = (
    "{nom}, fabricant européen de diagnostic in vitro (DIV), présent dans les pays listés. Activités : "
    "diagnostic clinique (microbiologie, immunoessais, biologie moléculaire, tests rapides, sepsis, résistance aux "
    "antibiotiques), automates de laboratoire connectés et logiciels associés (logiciels de laboratoire et LIMS, "
    "connectivité et maintenance à distance des instruments, logiciels médicaux), et applications industrielles "
    "(contrôle qualité pharmaceutique et biopharmaceutique, sécurité alimentaire, microbiologie industrielle, tests "
    "de stérilité, surveillance environnementale). Elle traite des données de santé, fournit des hôpitaux et des "
    "laboratoires (y compris publics), utilise le cloud et l'IA, et relève de NIS2 (fabrication de dispositifs "
    "médicaux), du règlement DIV (IVDR) et du Cyber Resilience Act.")

CRITERES = """Tu fais une veille réglementaire en cybersécurité pour : {entreprise}

Pays suivis : {pays}.

Juge si l'article est PERTINENT pour cette veille. Il est « pertinent » s'il remplit les TROIS conditions :
1. SUJET : cybersécurité ou sécurité de l'information ; protection des données personnelles ou de santé ;
   intelligence artificielle ; sécurité des logiciels, du cloud ou des produits connectés ; identité numérique ;
   résilience des entités critiques ; OU réglementation des dispositifs médicaux et du diagnostic in vitro (MDR,
   IVDR, organismes notifiés, vigilance, évaluation de la conformité, remboursement d'un dispositif de diagnostic) ;
   OU règles sur les systèmes informatisés et l'intégrité des données dans les laboratoires de contrôle qualité
   pharmaceutique ou agroalimentaire (BPF Annexe 11 / 22, GAMP5).
2. DIMENSION RÉGLEMENTAIRE : loi, règlement, décret, arrêté, projet de texte, consultation publique, analyse
   d'impact, appel à contributions, mandat de négociation, accord politique, adoption, entrée en vigueur,
   transposition nationale, lignes directrices ou recommandation officielle, norme ou certification, obligation ou
   échéance de mise en conformité, ou sanction d'une autorité qui fait jurisprudence sur des données de santé ou la
   sécurité des données.
3. APPLICABLE À L'ENTREPRISE : texte qui vise toutes les entreprises ou plusieurs secteurs dont la santé ;
   le secteur santé ; les dispositifs médicaux / DIV ; les fabricants de produits connectés ou de logiciels ; les
   fournisseurs des hôpitaux et laboratoires ; le traitement de données ; dans un pays suivi ou au niveau européen
   (un texte d'un autre pays seulement s'il a une portée mondiale).

« À SURVEILLER » : lien réel mais indirect ou incertain — commentaire ou analyse d'un texte existant sans étape
nouvelle, guide non contraignant, texte visant seulement les administrations publiques (les hôpitaux publics et
leurs fournisseurs peuvent être concernés), secteur voisin, article technique de cybersécurité sur des systèmes
industriels ou connectés sans règle nouvelle, enquête ou sondage sur la mise en conformité à un texte suivi, contenu
insuffisant pour trancher. Les recommandations et lignes directrices d'une autorité sont « pertinentes ».

« PAS PERTINENT » dans ces cas :
- attaque, fuite, menace ou vulnérabilité sans contenu réglementaire ; statistiques d'incidents ;
- vie des entreprises, produits, marchés, nominations, événements, webinaires, formations, enquêtes et sondages sans lien avec un texte suivi ;
- textes réservés à la finance (banques, assurances, crypto-actifs, DORA), aux télécoms (opérateurs, spectre,
  radiodiffusion, radio numérique) ou à un autre secteur industriel (automobile et véhicules connectés, aviation,
  ferroviaire, maritime, énergie seule) ;
- médicaments seuls (autorisation, essais cliniques, pénuries, remboursement de médicaments, pharmacovigilance,
  pharmacogénomique) ;
- santé mentale, cyberharcèlement, protection des mineurs en ligne et réseaux sociaux, désinformation, conseils au
  grand public ;
- organisation, financement ou personnel des soins sans lien numérique ou réglementaire ;
- rapports, études, appels à projets ou d'offres, subventions, stratégies et discours sans règle nouvelle ;
- DSA, DMA et protection des consommateurs en ligne (hors périmètre) ; sujets hors Europe sans portée mondiale.

Pièges connus : « cyber » dans « cyberharcèlement » ou « cybercriminalité » ne suffit pas ; « radio » peut être la
radiodiffusion ; « bill » peut vouloir dire « facture » ; un sigle d'organisme (ex. une agence) n'est pas un texte.

Réponds uniquement en JSON : {{"raison": "<une phrase courte>", "avis": "pertinent" | "a_surveiller" |
"pas_pertinent", "motif": "<code>"}}. Codes de motif possibles : {motifs}."""

MOTIFS = {
    # pertinent
    "nouvelle_regle": "nouvelle règle ou étape d'un texte",
    "projet_consultation": "projet de texte ou consultation",
    "lignes_directrices": "lignes directrices / recommandation officielle",
    "transposition": "transposition ou loi nationale d'application",
    "echeance": "obligation ou échéance de conformité",
    "sanction": "sanction qui fait jurisprudence",
    "dm_div": "réglementation des dispositifs médicaux / DIV",
    # à surveiller
    "commentaire": "commentaire d'un texte existant",
    "indirect": "lien indirect ou incertain",
    # pas pertinent
    "attaque_vulnerabilite": "attaque ou vulnérabilité sans règle",
    "entreprise_evenement": "vie des entreprises / événement",
    "autre_secteur": "autre secteur (finance, télécoms…)",
    "medicaments": "médicaments seuls",
    "sante_hors_sujet": "santé sans lien cyber ni réglementaire",
    "societe_grand_public": "société / grand public",
    "pas_une_regle": "pas une règle (rapport, appel, stratégie…)",
    "hors_europe": "hors Europe",
    "hors_sujet": "hors sujet",
}
LIBELLES = {k: "IA : " + v for k, v in MOTIFS.items()}

SCHEMA = {"type": "object", "properties": {
    "raison": {"type": "string", "maxLength": 200},
    "avis": {"type": "string", "enum": ["pertinent", "a_surveiller", "pas_pertinent"]},
    "motif": {"type": "string", "enum": list(MOTIFS)}},
    "required": ["raison", "avis", "motif"]}


# modèles possibles (licences permettant un usage professionnel) : (dépôt Hugging Face, fichier GGUF)
MODELES = {
    "qwen7b": ("bartowski/Qwen2.5-7B-Instruct-GGUF", "Qwen2.5-7B-Instruct-Q4_K_M.gguf"),       # Apache 2.0, multilingue
    "phi35": ("bartowski/Phi-3.5-mini-instruct-GGUF", "Phi-3.5-mini-instruct-Q4_K_M.gguf"),     # MIT, 3,8 Md, plus rapide
    "llama3b": ("bartowski/Llama-3.2-3B-Instruct-GGUF", "Llama-3.2-3B-Instruct-Q4_K_M.gguf"),   # licence Llama 3.2
}


class TriIA:
    def __init__(self, cfg):
        c = dict({"actif": True, "modele": "qwen7b", "contexte": 4096, "caracteres_page": 2000,
                  "budget_minutes": 120, "max_articles": 600}, **(cfg.get("ia_tri") or {}))
        if os.environ.get("IA_MODELE"):
            c["modele"] = os.environ["IA_MODELE"]
        c["modele_depot"], c["modele_fichier"] = MODELES.get(c["modele"], MODELES["qwen7b"])
        self.cfg, self.llm, self.erreur, self.faits = c, None, "", 0
        nom = os.environ.get("VEILLE_ENTREPRISE", "").strip() or "un fabricant de diagnostic in vitro"
        self.systeme = CRITERES.format(entreprise=ENTREPRISE.format(nom=nom), pays=PAYS,
                                       motifs=", ".join(MOTIFS))
        if not c.get("actif"):
            self.erreur = "Tri par l'IA désactivé (config/veille.json › ia_tri)."
            return
        try:
            from huggingface_hub import hf_hub_download
            from llama_cpp import Llama
            chemin = hf_hub_download(c["modele_depot"], c["modele_fichier"])
            self.llm = Llama(model_path=chemin, n_ctx=c["contexte"], n_threads=os.cpu_count() or 4,
                             verbose=False, seed=0)
        except Exception as e:
            self.erreur = "IA de tri indisponible (%s) : tri par les règles seules." % str(e)[:160]

    @property
    def actif(self):
        return self.llm is not None

    def message(self, a):
        tr = (a.get("trad") or {})
        lignes = ["Source : %s (%s)" % (a.get("source", ""), a.get("zone", "")),
                  "Date : %s" % a.get("date", ""), "Titre : %s" % a.get("titre", "")]
        for lg in ("fr", "en"):
            t = (tr.get(lg) or {}).get("titre")
            if t and t != a.get("titre"):
                lignes.append("Titre traduit (%s) : %s" % (lg, t))
                break
        if a.get("resume"):
            lignes.append("Résumé : %s" % a["resume"][:800])
        texte = (a.get("_texte") or "")[:self.cfg["caracteres_page"]]
        lignes.append(("Début de l'article : %s" % texte) if texte else "(page de l'article non lisible : juger sur le titre et le résumé)")
        return "\n".join(lignes)

    def juger(self, a):
        r = self.llm.create_chat_completion(
            messages=[{"role": "system", "content": self.systeme}, {"role": "user", "content": self.message(a)}],
            temperature=0, max_tokens=160, response_format={"type": "json_object", "schema": SCHEMA})
        d = json.loads(r["choices"][0]["message"]["content"])
        if d.get("avis") not in ("pertinent", "a_surveiller", "pas_pertinent") or d.get("motif") not in MOTIFS:
            raise ValueError("réponse hors format")
        return d

    def trier(self, articles, garder_raison=False):
        """Juge les articles donnés (dans l'ordre) qui ne l'ont pas encore été, dans le temps imparti.
        Écrit a['ia'] = {v, avis, motif, page} (+ raison seulement si garder_raison : tests, jamais publié)."""
        if not self.actif:
            return 0
        debut, n = time.time(), 0
        for a in articles:
            if (a.get("ia") or {}).get("v") == VERSION and not (a.get("_texte") and not a["ia"].get("page")):
                continue
            if n >= self.cfg["max_articles"] or time.time() - debut > 60 * self.cfg["budget_minutes"]:
                self.erreur = "Temps imparti atteint : %d articles triés par l'IA, les autres le seront à la prochaine collecte." % n
                break
            try:
                d = self.juger(a)
            except Exception as e:
                a["ia"] = {"v": VERSION, "erreur": str(e)[:80]}
                continue
            a["ia"] = {"v": VERSION, "avis": d["avis"], "motif": d["motif"], "page": bool(a.get("_texte"))}
            if garder_raison:   # tests seulement ; le nom de l'entreprise n'apparaît jamais dans un rapport
                r = d.get("raison", "")[:200]
                nom = os.environ.get("VEILLE_ENTREPRISE", "").strip()
                if nom:
                    import re
                    r = re.sub(re.escape(nom), "l'entreprise", r, flags=re.I)
                    r = re.sub(re.escape(nom.lower().replace("é", "e")), "l'entreprise", r, flags=re.I)
                a["ia"]["raison"] = r
            n += 1
        self.faits += n
        return n
