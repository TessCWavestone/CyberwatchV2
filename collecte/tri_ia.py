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

VERSION = "t4"

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

CRITERES = """Tu fais une veille sur les RÉGLEMENTATIONS CYBER (cybersécurité, sécurité et protection des données,
régulation de l'IA et du numérique) applicables à : {entreprise}

IMPORTANT : beaucoup d'articles concernent le secteur de l'entreprise (dispositifs médicaux, diagnostic, laboratoires,
hôpitaux, médicaments) SANS aspect cyber. Ils sont HORS SUJET, même s'ils concernent directement l'entreprise.

Pays suivis : {pays}.

Analyse l'article en répondant à CINQ questions. Le classement final est calculé à partir de tes réponses.

1. TYPE de l'article (un seul) :
- texte_officiel : loi, règlement, décret, arrêté, directive adopté, publié ou entré en vigueur ; transposition nationale.
- projet_consultation : projet ou proposition de texte, consultation publique, appel à contributions, analyse
  d'impact, mandat de négociation, accord politique, vote ou étape d'une procédure législative.
- lignes_directrices : lignes directrices, recommandation, guide, référentiel, norme ou schéma de certification
  PUBLIÉ PAR UNE AUTORITÉ ou un organisme officiel (Commission, autorité nationale, agence, CNIL, EDPB, ENISA…).
- obligation_echeance : annonce par une autorité d'une obligation ou d'une échéance de conformité (enregistrement,
  notification, date d'application).
- sanction : décision ou amende d'une autorité contre une organisation.
- commentaire : article de presse, de cabinet ou de blog qui explique ou commente un texte, ses obligations, ses
  échéances ou son évolution (même s'il ne fait que rappeler une obligation).
- alerte_vulnerabilite : vulnérabilité, correctif, mise à jour de sécurité, CVE.
- attaque_incident : attaque, fuite, menace, logiciel malveillant, incident, procès suite à un incident.
- entreprise_produit : actualité d'une entreprise, produit, offre, partenariat, investissement, nomination, Y COMPRIS
  une entreprise qui annonce sa propre mise en conformité ou une offre d'accompagnement à un texte.
- evenement : événement, webinaire, conférence, formation, réunion.
- etude_enquete : rapport, étude, enquête, sondage, statistiques.
- financement : subvention, appel à projets, appel d'offres, programme de financement.
- politique : stratégie, discours, déclaration, prise de position, débat.
- autre.

2. SUJET CYBER (oui / non) : « oui » seulement si le sujet principal est la cybersécurité ou la sécurité de
   l'information ; la protection ou la sécurité des données personnelles ou de santé ; la régulation de l'intelligence
   artificielle ; la sécurité des logiciels, du cloud ou des produits connectés ; l'identité numérique ; la résilience
   des entités critiques (NIS2, CER) ; ou l'intégrité des données des systèmes informatisés en laboratoire (BPF
   Annexe 11 / 22, GAMP5).
   Pour les dispositifs médicaux / de diagnostic (MDR, IVDR, MDCG) : « oui » SEULEMENT si l'article porte sur leur
   cybersécurité, leurs logiciels ou leurs données ; « non » pour le remboursement, la prise en charge, l'évaluation
   clinique, la vigilance, le marquage CE ou les organismes notifiés sans aspect cyber.
   Pour une sanction : « oui » seulement si elle porte sur des données de santé, la sécurité des données, l'IA ou
   les dispositifs médicaux (pas le télémarketing, la publicité, les célébrités…).
   « cyber » dans « cyberharcèlement » ou « cybercriminalité » ne suffit pas ; « radio » peut être la radiodiffusion.

3. APPLICABLE à l'entreprise (oui / incertain / non) : « oui » si le texte vise toutes les entreprises, plusieurs
   secteurs dont la santé, le secteur santé, les dispositifs médicaux / DIV, les fabricants de produits connectés ou
   de logiciels, les fournisseurs des hôpitaux et laboratoires ou le traitement de données, dans un pays suivi ou au
   niveau européen. « incertain » si le texte vise seulement les administrations publiques, ou si l'article ne
   permet pas de savoir. « non » si le texte vise un autre secteur ou un pays non suivi (sauf portée mondiale).

4. SECTEUR VISÉ (oui / non), pour une alerte de vulnérabilité : « oui » seulement si la vulnérabilité (aspect
   cybersécurité) touche SPÉCIFIQUEMENT des dispositifs médicaux ou de diagnostic, des instruments, automates ou
   logiciels de laboratoire, ou des systèmes informatiques de santé (ex. faille d'un automate de laboratoire, d'un
   dispositif médical connecté, d'un logiciel hospitalier). Logiciel généraliste (messagerie, système
   d'exploitation, outil de développement…) : « non ». Pour les autres types d'article : « non ».

5. EXCLUSION (une seule, « aucune » sinon) :
- autre_secteur : finance (banques, assurances, crypto-actifs, DORA), télécoms (opérateurs, spectre, radiodiffusion),
  automobile et véhicules connectés, aviation, ferroviaire, maritime, énergie seule ;
- medicaments : médicaments seuls (autorisation, essais cliniques, pénuries, remboursement, pharmacovigilance,
  pharmacogénomique) ;
- sante_hors_sujet : santé, dispositifs médicaux, diagnostic ou laboratoires SANS aspect cyber (remboursement,
  prise en charge, évaluation des technologies de santé, organisation, financement ou personnel des soins, santé
  publique, recherche médicale, vigilance…) ;
- societe_grand_public : santé mentale, cyberharcèlement, protection des mineurs en ligne et réseaux sociaux,
  désinformation, conseils au grand public ;
- dsa_dma : DSA, DMA, protection des consommateurs en ligne ;
- hors_europe : sujet hors des pays suivis sans portée mondiale.

Réponds uniquement en JSON : {{"raison": "<une phrase courte>", "type": "<type>", "sujet": "oui|non",
"applicable": "oui|incertain|non", "secteur_vise": "oui|non", "exclusion": "<exclusion>"}}."""

TYPES = ["texte_officiel", "projet_consultation", "lignes_directrices", "obligation_echeance", "sanction",
         "commentaire", "alerte_vulnerabilite", "attaque_incident", "entreprise_produit", "evenement",
         "etude_enquete", "financement", "politique", "autre"]
OFFICIELS = {"texte_officiel", "projet_consultation", "lignes_directrices", "obligation_echeance", "sanction"}
A_SURVEILLER = {"politique", "etude_enquete"}
EXCLUSIONS = ["aucune", "autre_secteur", "medicaments", "sante_hors_sujet", "societe_grand_public", "dsa_dma",
              "hors_europe"]

MOTIFS = {
    "texte_officiel": "texte adopté, publié ou en vigueur",
    "projet_consultation": "projet de texte ou consultation",
    "lignes_directrices": "lignes directrices / recommandation officielle",
    "obligation_echeance": "obligation ou échéance de conformité",
    "sanction": "sanction d'une autorité",
    "commentaire": "commentaire / évolution d'un texte",
    "vulnerabilite_secteur": "vulnérabilité touchant le secteur (dispositifs, laboratoires, santé)",
    "politique": "stratégie / prise de position",
    "etude_enquete": "étude ou enquête",
    "alerte_vulnerabilite": "alerte de vulnérabilité",
    "attaque_incident": "attaque ou incident",
    "entreprise_produit": "actualité d'entreprise",
    "evenement": "événement / formation",
    "financement": "financement / appel à projets",
    "autre": "pas une règle",
    "autre_secteur": "autre secteur (finance, télécoms, automobile…)",
    "medicaments": "médicaments seuls",
    "sante_hors_sujet": "santé sans lien cyber ni réglementaire",
    "societe_grand_public": "société / grand public",
    "dsa_dma": "DSA / DMA (hors périmètre)",
    "hors_europe": "hors Europe",
    "hors_sujet": "hors du sujet suivi",
    "non_applicable": "ne vise pas l'entreprise",
    "incertain": "applicabilité incertaine",
}
LIBELLES = {k: "IA : " + v for k, v in MOTIFS.items()}

SCHEMA = {"type": "object", "properties": {
    "raison": {"type": "string", "maxLength": 200},
    "type": {"type": "string", "enum": TYPES},
    "sujet": {"type": "string", "enum": ["oui", "non"]},
    "applicable": {"type": "string", "enum": ["oui", "incertain", "non"]},
    "secteur_vise": {"type": "string", "enum": ["oui", "non"]},
    "exclusion": {"type": "string", "enum": EXCLUSIONS}},
    "required": ["raison", "type", "sujet", "applicable", "secteur_vise", "exclusion"]}


# textes suivis qui sont par nature des réglementations cyber / données / IA : s'ils sont cités dans un article
# officiel ou un commentaire, le sujet est cyber (test du 16/10 : l'IA répondait « sujet non » sur des articles du CRA)
TEXTES_CYBER = {"NIS2", "CRA", "AI Act", "RGPD / GDPR", "Data Act", "CER (entités critiques)",
                "Cybersecurity Act / certification UE", "Cloud and AI Development Act (CADA)",
                "eIDAS 2 / portefeuille européen d'identité", "RED (équipements radio) / EN 18031",
                "IEC 81001-5-1 / IEC 62443", "ISO/IEC 27001 et normes ISO", "EHDS", "ENS / CPSTIC (Espagne)",
                "HDS / SecNumCloud / PGSSI-S (France)", "C5 / B3S / KHZG (Allemagne)", "NEN 7510 (Pays-Bas)",
                "DTAC / DSPT / Cyber Essentials (NHS)"}


def decider(d, textes_cles=()):
    """Classement calculé (et non choisi par l'IA) à partir de ses réponses : (avis, motif).
    Test du 16/10 : l'IA remplissait souvent « exclusion » même pour des articles pertinents (sanctions sur des
    données de santé, CRA…) ; l'exclusion ne compte donc que si le sujet ou l'applicabilité est déjà douteux."""
    if d["type"] == "alerte_vulnerabilite":
        # décision du 16/10 : une vulnérabilité n'est pertinente que si elle touche le secteur (et seulement alors)
        return ("pertinent", "vulnerabilite_secteur") if d.get("secteur_vise") == "oui" else ("pas_pertinent", d["type"])
    sujet = d["sujet"]
    if set(textes_cles or ()) & TEXTES_CYBER and (d["type"] in OFFICIELS or d["type"] == "commentaire"):
        sujet = "oui"
    if d["exclusion"] != "aucune" and not (sujet == "oui" and d["applicable"] == "oui"):
        return "pas_pertinent", d["exclusion"]
    if sujet != "oui":
        return "pas_pertinent", "hors_sujet"
    if d["applicable"] == "non":
        return "pas_pertinent", "non_applicable"
    if d["type"] in OFFICIELS or d["type"] == "commentaire":
        # décision du 16/10 : un commentaire qui explique une obligation ou une évolution d'un texte est pertinent
        return ("pertinent", d["type"]) if d["applicable"] == "oui" else ("a_surveiller", "incertain")
    if d["type"] in A_SURVEILLER:
        return "a_surveiller", d["type"]
    return "pas_pertinent", d["type"]


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
        self.systeme = CRITERES.format(entreprise=ENTREPRISE.format(nom=nom), pays=PAYS)
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
            temperature=0, max_tokens=200, response_format={"type": "json_object", "schema": SCHEMA})
        d = json.loads(r["choices"][0]["message"]["content"])
        if d.get("type") not in TYPES or d.get("sujet") not in ("oui", "non") or \
                d.get("applicable") not in ("oui", "incertain", "non") or d.get("exclusion") not in EXCLUSIONS or \
                d.get("secteur_vise") not in ("oui", "non"):
            raise ValueError("réponse hors format")
        d["avis"], d["motif"] = decider(d, a.get("textes_cles"))
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
            a["ia"] = {"v": VERSION, "avis": d["avis"], "motif": d["motif"], "type": d["type"], "sujet": d["sujet"],
                       "applicable": d["applicable"], "secteur": d["secteur_vise"], "exclusion": d["exclusion"],
                       "page": bool(a.get("_texte"))}
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
