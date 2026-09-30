"""
Cyber Watch — sujets suivis : textes et normes, autorités (liste fermée, relue).

Remplace l'ancienne détection « tout mot en majuscules = acronyme », qui
produisait plus de 1 200 acronymes (dates, SQL, API, DELLA, BEREC…).

  - Seuls les sujets de cette liste servent de filtres (Veille › Affiner) et
    apparaissent dans « Sujets suivis » (onglet Sources).
  - Les autres acronymes repérés dans les articles pertinents deviennent des
    « candidats » proposés à un humain (onglet Sources) : s'ils sont utiles, on
    les ajoute ici. On ne rate donc pas un nouveau terme, sans polluer les filtres.

Format : (code, groupe, libellé FR, libellé EN, motif). Les motifs s'appliquent au
texte sans accents (titre + résumé + traduction anglaise). « (?-i:…) » = casse respectée.
"""

import re
import unicodedata


def _sa(s):
    return "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn")


T, A = "textes", "autorites"   # groupes

SUJETS = [
    # ------------------------------------------------------------------ textes et normes
    ("NIS2", T, "NIS2", "NIS2", r"\bNIS ?-?2\b|2022/2555|NIS2UmsuCG|Cyberbeveiligingswet|kyberturvallisuuslaki|cybersakerhetslag|"
     r"krajowym systemie cyberbezpieczenstwa|zakon\w* o kyberneticke bezpecnosti|decreto legislativo (n\. )?138|"
     r"entites essentielles et importantes|essential and important entities|Cyber Security and Resilience Bill|NISG 2026|"
     r"digitalsikkerhetslov|(?-i:\bKSC\b)"),
    ("CRA", T, "Cyber Resilience Act (CRA)", "Cyber Resilience Act (CRA)",
     r"Cyber ?Resilience Act|(?-i:\bCRA\b)|2024/2847|cyberresilience|Cyberresilienz|products? with digital elements"),
    ("AI Act", T, "AI Act (règlement IA)", "AI Act", r"\bAI Act\b|Artificial Intelligence Act|2024/1689|KI-Verordnung|"
     r"reglement (europeen )?sur l'(IA|intelligence artificielle)|high-risk AI|general-purpose AI|(?-i:\bGPAI\b)|AI-forordning"),
    ("GDPR", T, "RGPD", "GDPR", r"(?-i:\bGDPR\b|\bRGPD\b|\bDSGVO\b|\bRODO\b|\bAVG\b)|ΓΚΠΔ|2016/679|General Data Protection Regulation|"
     r"Datenschutz-Grundverordnung|reglement general sur la protection des donnees|Data \(?Use and Access\)? Act"),
    ("IVDR", T, "IVDR (diagnostic in vitro)", "IVDR (in vitro diagnostics)",
     r"(?-i:\bIVDR\b|\bIVD\b|\bDMDIV\b)|2017/746|in[- ]vitro[- ]diagnosti|diagnostic in vitro|In-vitro-Diagnosti|diagnostico in vitro|diagnostica in vitro"),
    ("MDR", T, "MDR (dispositifs médicaux)", "MDR (medical devices)",
     r"Medical Devices? Regulation|2017/745|(?-i:\bMDR\b)(?=.{0,80}(device|dispositif|medic|Medizin))|reglement (relatif )?aux dispositifs medicaux|"
     r"Medizinprodukte(recht|gesetz|verordnung)|(?-i:\bMPDG\b)"),
    ("MDCG", T, "MDCG (guides DM/DIV)", "MDCG (MD/IVD guidance)", r"(?-i:\bMDCG\b)|Medical Device Coordination Group"),
    ("EHDS", T, "EHDS (espace européen des données de santé)", "EHDS (European Health Data Space)",
     r"(?-i:\bEHDS\b)|European Health Data Space|espace europeen des donnees de sante|Gesundheitsdatenraum|2025/327"),
    ("Data Act", T, "Data Act", "Data Act", r"\bData Act\b|2023/2854|Datenverordnung"),
    ("CER", T, "CER (entités critiques)", "CER (critical entities)",
     r"Critical Entities Resilience|resilience des entites critiques|2022/2557|KRITIS-Dachgesetz|(?-i:\bCER\b)(?=.{0,40}(directive|Richtlinie|critical|critique|loi|act|lag|laki))|"
     r"kritieke entiteiten|Wet weerbaarheid kritieke"),
    ("Cybersecurity Act", T, "Cybersecurity Act (certification UE)", "Cybersecurity Act (EU certification)",
     r"Cyber ?security Act\b|2019/881|European cybersecurity certification|certification europeenne de cybersecurite"),
    ("EUCC", T, "EUCC", "EUCC", r"(?-i:\bEUCC\b)|Common Criteria"),
    ("EUCS", T, "EUCS (certification cloud UE)", "EUCS (EU cloud certification)", r"(?-i:\bEUCS\b)"),
    ("DORA", T, "DORA (résilience opérationnelle numérique)", "DORA (digital operational resilience)", r"(?-i:\bDORA\b)|Digital Operational Resilience Act|2022/2554"),
    ("eIDAS", T, "eIDAS 2 / portefeuille d'identité", "eIDAS 2 / digital identity wallet", r"(?-i:\beIDAS\b|\bEUDI\b)|European Digital Identity"),
    ("CADA", T, "Cloud and AI Development Act", "Cloud and AI Development Act", r"Cloud and AI Development Act|(?-i:\bCADA\b)"),
    ("Digital Omnibus", T, "Omnibus numérique", "Digital Omnibus", r"digital omnibus|omnibus numerique|digitale(s|n)? Omnibus"),
    ("PLD", T, "Responsabilité du fait des produits (PLD)", "Product Liability Directive (PLD)",
     r"Product Liability Directive|2024/2853|responsabilite du fait des produits|Produkthaftungsrichtlinie"),
    ("RED", T, "RED (équipements radio)", "RED (radio equipment)", r"Radio Equipment Directive|2022/30\b|equipements radioelectriques|Funkanlagenrichtlinie"),
    ("EN 18031", T, "EN 18031", "EN 18031", r"EN ?18031"),
    ("IEC 62443", T, "IEC 62443", "IEC 62443", r"(?<!\d)62443(?!\d)"),
    ("IEC 81001-5-1", T, "IEC 81001-5-1", "IEC 81001-5-1", r"81001-5-1|IEC ?81001"),
    ("ISO 27001", T, "ISO/IEC 27001 et famille 2700x", "ISO/IEC 27001 and 2700x family", r"ISO(/IEC)? ?2700[0-9]|ISO(/IEC)? ?27701"),
    ("ISO 13485", T, "ISO 13485 / ISO 14971", "ISO 13485 / ISO 14971", r"ISO ?13485|ISO ?14971"),
    ("ISO 42001", T, "ISO/IEC 42001 (IA)", "ISO/IEC 42001 (AI)", r"ISO(/IEC)? ?42001"),
    ("Normes harmonisées", T, "Normes harmonisées (CEN-CENELEC, ETSI)", "Harmonised standards (CEN-CENELEC, ETSI)",
     r"harmoni[sz]ed standards?|normes? harmonisees?|harmonisierte Normen?|standardisation request|(?-i:\bJTC ?13\b)|EN 303 645"),
    ("DTAC", T, "DTAC (NHS)", "DTAC (NHS)", r"(?-i:\bDTAC\b)|Digital Technology Assessment Criteria"),
    ("DSPT", T, "DSPT (NHS)", "DSPT (NHS)", r"(?-i:\bDSPT\b)|Data Security and Protection Toolkit"),
    ("Cyber Essentials", T, "Cyber Essentials", "Cyber Essentials", r"Cyber Essentials"),
    ("CAF", T, "Cyber Assessment Framework (CAF)", "Cyber Assessment Framework (CAF)", r"Cyber Assessment Framework"),
    ("ENS", T, "ENS (Espagne)", "ENS (Spain)", r"Esquema Nacional de Seguridad|(?-i:\bENS\b)(?=.{0,60}(segur|certific|CCN|conformidad|nivel|Spain|Espagne))|Real Decreto 311/2022"),
    ("CPSTIC", T, "CPSTIC (Espagne)", "CPSTIC (Spain)", r"(?-i:\bCPSTIC\b)"),
    ("HDS", T, "HDS (hébergement de données de santé)", "HDS (health data hosting)",
     r"hebergeurs? de donnees de sante|hebergement de donnees de sante|(?-i:\bHDS\b)(?=.{0,40}(sante|certif|heberg|referentiel|health))"),
    ("SecNumCloud", T, "SecNumCloud", "SecNumCloud", r"SecNumCloud"),
    ("PGSSI-S", T, "PGSSI-S", "PGSSI-S", r"PGSSI-S"),
    ("C5", T, "C5 (cloud, Allemagne)", "C5 (cloud, Germany)", r"(?-i:\bC5\b)(?=.{0,40}(BSI|cloud|Kriterienkatalog|Testat))|Cloud Computing Compliance Criteria"),
    ("B3S / KHZG", T, "B3S / KHZG (hôpitaux, Allemagne)", "B3S / KHZG (hospitals, Germany)", r"(?-i:\bB3S\b|\bKHZG\b)|Krankenhauszukunftsgesetz"),
    ("NEN 7510", T, "NEN 7510", "NEN 7510", r"NEN ?751[0-3]"),
    ("GMP Annexe 11/22", T, "BPF / GMP Annexe 11 et 22", "GMP Annex 11 and 22", r"Annex(e)? ?(11|22)\b|Anhang (11|22)\b"),
    ("NIST", T, "NIST (CSF, SP 800)", "NIST (CSF, SP 800)", r"(?-i:\bNIST\b)"),
    ("DiGA", T, "DiGA / DiPA (Allemagne)", "DiGA / DiPA (Germany)", r"(?-i:\bDiGA\b|\bDiPA\b)"),
    # ------------------------------------------------------------------ autorités (un même sigle pour les organismes homologues)
    ("ENISA", A, "ENISA", "ENISA", r"(?-i:\bENISA\b)"),
    ("EDPB", A, "CEPD / EDPB", "EDPB", r"(?-i:\bEDPB\b|\bCEPD\b)|European Data Protection Board|Comite europeen de la protection des donnees"),
    ("EDPS", A, "CEPD (contrôleur) / EDPS", "EDPS", r"(?-i:\bEDPS\b)|European Data Protection Supervisor"),
    ("ECCC", A, "ECCC (centre de compétences cyber UE)", "ECCC (EU cyber competence centre)", r"(?-i:\bECCC\b)|Cybersecurity Competence Centre"),
    ("ΕΑΚ", A, "Autorité nationale de cybersécurité (Grèce)", "National Cybersecurity Authority (Greece)", r"(?-i:ΕΑΚ)|Εθνικη Αρχη Κυβερνοασφαλειας"),
    ("AI Office", A, "Bureau de l'IA (UE)", "EU AI Office", r"\bAI Office\b|Bureau (europeen )?de l'IA"),
    ("CNIL", A, "CNIL", "CNIL", r"(?-i:\bCNIL\b)"),
    ("ANSSI", A, "ANSSI", "ANSSI", r"(?-i:\bANSSI\b)|cyber\.gouv\.fr"),
    ("ANS", A, "Agence du numérique en santé", "French Digital Health Agency (ANS)", r"Agence du numerique en sante|(?-i:\bANS\b)(?=.{0,40}(sante|numerique|referentiel))"),
    ("ANSM", A, "ANSM", "ANSM", r"(?-i:\bANSM\b)"),
    ("BSI", A, "BSI (Allemagne)", "BSI (Germany)", r"(?-i:\bBSI\b)(?!.{0,6}British)|Bundesamt fur Sicherheit in der Informationstechnik"),
    ("BfArM", A, "BfArM", "BfArM", r"(?-i:\bBfArM\b)"),
    ("gematik", A, "gematik", "gematik", r"\bgematik\b"),
    ("AEPD", A, "AEPD (Espagne)", "AEPD (Spain)", r"(?-i:\bAEPD\b)|Agencia Espanola de Proteccion de Datos"),
    ("INCIBE", A, "INCIBE", "INCIBE", r"(?-i:\bINCIBE\b)"),
    ("CCN", A, "CCN (Espagne)", "CCN (Spain)", r"(?-i:\bCCN\b)|Centro Criptologico Nacional"),
    ("AEMPS", A, "AEMPS", "AEMPS", r"(?-i:\bAEMPS\b)"),
    ("Garante", A, "Garante privacy (Italie)", "Garante privacy (Italy)", r"Garante (per la protezione|privacy)|\bGPDP\b"),
    ("ACN", A, "ACN (Italie)", "ACN (Italy)", r"Agenzia per la Cybersicurezza Nazionale|(?-i:\bACN\b)"),
    ("AgID", A, "AgID", "AgID", r"(?-i:\bAgID\b|\bAGID\b)"),
    ("CNPD", A, "CNPD (Portugal / Luxembourg)", "CNPD (Portugal / Luxembourg)", r"(?-i:\bCNPD\b)"),
    ("CNCS", A, "CNCS (Portugal)", "CNCS (Portugal)", r"(?-i:\bCNCS\b)|Centro Nacional de Ciberseguranca"),
    ("INFARMED", A, "INFARMED", "INFARMED", r"\bINFARMED\b"),
    ("NÚKIB", A, "NÚKIB (Tchéquie)", "NÚKIB (Czechia)", r"(?-i:\bNUKIB\b)"),
    ("ÚOOÚ", A, "ÚOOÚ (Tchéquie)", "ÚOOÚ (Czechia)", r"(?-i:\bUOOU\b)"),
    ("SÚKL", A, "SÚKL (Tchéquie)", "SÚKL (Czechia)", r"(?-i:\bSUKL\b)"),
    ("NKI", A, "NKI (Hongrie)", "NKI (Hungary)", r"(?-i:\bNKI\b|\bNBSZ\b)|Nemzeti Kibervedelmi Intezet"),
    ("NAIH", A, "NAIH (Hongrie)", "NAIH (Hungary)", r"(?-i:\bNAIH\b)"),
    ("SZTFH", A, "SZTFH (Hongrie)", "SZTFH (Hungary)", r"(?-i:\bSZTFH\b)"),
    ("UODO", A, "UODO (Pologne)", "UODO (Poland)", r"(?-i:\bUODO\b)"),
    ("CERT Polska", A, "CERT Polska / NASK", "CERT Polska / NASK", r"CERT Polska|(?-i:\bNASK\b)"),
    ("NCSC", A, "NCSC (Royaume-Uni, Pays-Bas, Suisse…)", "NCSC (UK, NL, CH…)", r"(?-i:\bNCSC\b|\bOFCS\b|\bBACS\b)"),
    ("ICO", A, "ICO (Royaume-Uni)", "ICO (UK)", r"(?-i:\bICO\b)|Information Commissioner"),
    ("MHRA", A, "MHRA", "MHRA", r"(?-i:\bMHRA\b)"),
    ("NHS", A, "NHS (Royaume-Uni)", "NHS (UK)", r"(?-i:\bNHS\b)"),
    ("Autoriteit Persoonsgegevens", A, "Autoriteit Persoonsgegevens (Pays-Bas)", "Dutch DPA (AP)", r"Autoriteit Persoonsgegevens"),
    ("RDI", A, "RDI (Pays-Bas)", "RDI (Netherlands)", r"Rijksinspectie Digitale Infrastructuur|(?-i:\bRDI\b)"),
    ("IGJ", A, "IGJ (Pays-Bas)", "IGJ (Netherlands)", r"(?-i:\bIGJ\b)|Inspectie Gezondheidszorg"),
    ("DSB", A, "DSB (Autriche)", "DSB (Austria)", r"Datenschutzbehorde|(?-i:\bDSB\b)"),
    ("BASG", A, "BASG (Autriche)", "BASG (Austria)", r"(?-i:\bBASG\b)"),
    ("CCB", A, "CCB (Belgique)", "CCB (Belgium)", r"(?-i:\bCCB\b)|Centre pour la Cybersecurite Belgique|Centrum voor Cybersecurity"),
    ("APD / GBA", A, "APD / GBA (Belgique)", "Belgian DPA (APD/GBA)", r"Autorite de protection des donnees|Gegevensbeschermingsautoriteit|(?-i:\bGBA\b)"),
    ("AFMPS", A, "AFMPS / FAGG (Belgique)", "FAMHP (Belgium)", r"(?-i:\bAFMPS\b|\bFAGG\b|\bFAMHP\b)"),
    ("Datatilsynet", A, "Datatilsynet (Norvège, Danemark)", "Datatilsynet (Norway, Denmark)", r"Datatilsynet"),
    ("NSM", A, "NSM (Norvège)", "NSM (Norway)", r"(?-i:\bNSM\b)|Nasjonal sikkerhetsmyndighet"),
    ("Nkom", A, "Nkom (Norvège)", "Nkom (Norway)", r"\bNkom\b"),
    ("Digdir", A, "Digdir (Norvège)", "Digdir (Norway)", r"\bDigdir\b"),
    ("IMY", A, "IMY (Suède)", "IMY (Sweden)", r"(?-i:\bIMY\b)|Integritetsskyddsmyndigheten"),
    ("PTS", A, "PTS (Suède)", "PTS (Sweden)", r"(?-i:\bPTS\b)|Post- och telestyrelsen"),
    ("MCF", A, "MCF / MSB (Suède)", "MCF / MSB (Sweden)", r"(?-i:\bMCF\b|\bMSB\b)|Myndigheten for civilt forsvar"),
    ("Läkemedelsverket", A, "Läkemedelsverket (Suède)", "Swedish MPA", r"Lakemedelsverket"),
    ("Traficom", A, "Traficom (Finlande)", "Traficom (Finland)", r"\bTraficom\b|Kyberturvallisuuskeskus"),
    ("Fimea", A, "Fimea (Finlande)", "Fimea (Finland)", r"\bFimea\b"),
    ("SAMSIK", A, "SAMSIK (Danemark)", "SAMSIK (Denmark)", r"(?-i:\bSAMSIK\b)|Styrelsen for Samfundssikkerhed"),
    ("Lægemiddelstyrelsen", A, "Lægemiddelstyrelsen (Danemark)", "Danish Medicines Agency", r"Laegemiddelstyrelsen"),
    ("PFPDT / EDÖB", A, "PFPDT / EDÖB (Suisse)", "FDPIC (Switzerland)", r"(?-i:\bPFPDT\b|\bEDOB\b|\bFDPIC\b)"),
    ("Swissmedic", A, "Swissmedic", "Swissmedic", r"\bSwissmedic\b"),
    ("EOF", A, "EOF (Grèce)", "EOF (Greece)", r"(?-i:\bEOF\b)|Εθνικος Οργανισμος Φαρμακων"),
    ("HDPA", A, "Autorité grecque de protection des données", "Hellenic DPA", r"Hellenic Data Protection|Αρχη Προστασιας Δεδομενων"),
]

_COMPILES = [(c, g, fr, en, re.compile(m, re.I)) for c, g, fr, en, m in SUJETS]

# Sources : un article publié par une autorité est rattaché à cette autorité
SOURCE_AUTORITE = [
    (r"ENISA", "ENISA"), (r"\bEDPB\b|European Data Protection Board", "EDPB"), (r"\bCNIL\b", "CNIL"), (r"ANSSI", "ANSSI"),
    (r"Agence du Num[ée]rique en Sant[ée]", "ANS"), (r"\bBSI\b", "BSI"), (r"BfArM", "BfArM"), (r"gematik", "gematik"),
    (r"AEPD", "AEPD"), (r"INCIBE", "INCIBE"), (r"\bCCN\b", "CCN"), (r"Garante", "Garante"), (r"\bACN\b", "ACN"), (r"AgID", "AgID"),
    (r"\bCNPD\b", "CNPD"), (r"\bCNCS\b", "CNCS"), (r"NÚKIB|Office national de la sécurité cybernétique", "NÚKIB"), (r"ÚOOÚ", "ÚOOÚ"),
    (r"SÚKL", "SÚKL"), (r"\bNKI\b", "NKI"), (r"NAIH", "NAIH"), (r"supervised activities|SZTFH|Autorité de régulation des activités", "SZTFH"),
    (r"UODO", "UODO"), (r"CERT Polska", "CERT Polska"), (r"Centre National de Cybersécurité|NCSC|OFCS", "NCSC"),
    (r"MHRA", "MHRA"), (r"NHS", "NHS"), (r"Autorité Nationale de Cybersécurité", "ΕΑΚ"), (r"\bRDI\b", "RDI"), (r"\bIGJ\b", "IGJ"), (r"\bDSB\b", "DSB"), (r"BASG", "BASG"),
    (r"Autorité de sécurité nationale", "NSM"), (r"Nkom", "Nkom"), (r"Digdir", "Digdir"), (r"\bIMY\b", "IMY"), (r"\bPTS\b", "PTS"),
    (r"Agence pour la défense civile", "MCF"), (r"Traficom", "Traficom"), (r"Fimea", "Fimea"), (r"sécurité sociétale", "SAMSIK"),
    (r"Lægemiddelstyrelsen", "Lægemiddelstyrelsen"), (r"PFPDT", "PFPDT / EDÖB"), (r"Swissmedic", "Swissmedic"), (r"EOF", "EOF"),
    (r"Hellenic Data Protection", "HDPA"), (r"Medical Device Coordination Group", "MDCG"),
]
_SOURCES = [(re.compile(m), c) for m, c in SOURCE_AUTORITE]

LIBELLES = {c: {"fr": fr, "en": en, "groupe": g} for c, g, fr, en, _ in SUJETS}


def texte_de(a):
    en = ((a.get("trad") or {}).get("en") or {})
    return _sa(" \n ".join(x for x in (a.get("titre", ""), a.get("resume", ""), en.get("titre", ""), en.get("resume", "")) if x))


def detecter(a):
    """Codes des sujets suivis présents dans l'article (texte, source)."""
    t = texte_de(a)
    codes = [c for c, _g, _fr, _en, rx in _COMPILES if rx.search(t)]
    src = a.get("source", "")
    for rx, c in _SOURCES:
        if rx.search(src) and c not in codes:
            codes.append(c)
    return codes


# ---------------------------------------------------------------- acronymes candidats (proposés à un humain)

RE_CANDIDAT = re.compile(r"(?<![\w-])([A-ZÀ-ÖØ-ÞΑ-Ω][A-ZÀ-ÖØ-ÞΑ-Ω0-9]{1,7})(?![\w-])")
MOIS = r"JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JANVIER|FEVRIER|MARS|AVRIL|JUIN|JUILLET|AOUT|SEPTEMBRE|OCTOBRE|NOVEMBRE|DECEMBRE"
# variantes déjà couvertes par un sujet suivi
VARIANTES = set("RGPD DSGVO RODO AVG CEPD OFCS BACS NBSZ NASK GPDP EDOB FDPIC FAGG FAMHP GBA MSB IVD DMDIV MPDG GPAI EUDI KSC DIPA".split())
EXCLUS = set("""EUR DG ISO IEC EN UNE DIN AFNOR BSI
THE AND FOR NEW WITH FROM THIS THAT YOUR OUR ARE HOW WHY WHAT WHO NOT ALL ONE TWO NOW
LE LA LES DES DU DE ET EN UN UNE AU AUX PAR POUR SUR DANS EST ONT
DER DIE DAS UND FUR MIT VON ZUR ZUM NEU NEUE
EL LOS LAS DEL CON POR UNA
IL DELLA DELLE DEL DEI DEGLI PER CON
NYHET NYHETER STAMPA NOTIZIE AKTUELL PRESSE UPDATE NEWS PDF HTML FAQ Q&A
EU UE EC EEA EEE UK US USA UN UNO NATO OTAN G7 G20 OECD OCDE WHO OMS
IT TI ICT TIC AI IA ML IOT OT API SQL PHP CSS XML JSON URL USB VPN DNS CPU GPU SAAS PAAS IAAS OS SDK
IBM SAP AWS F5 CE HP DELL MS
CEO CTO CIO CFO COO CISO DPO HR RH PR QA
EBA ESMA EIOPA ECB BCE ESRB SRB IFRS ESG RTS ITS MIFID PSD PSD2 PSD3 AML CFT MICA TIBER
BEREC ETSI CEN CENELEC ITU IEEE IETF
CVE CVSS NVD KEV NOR CELEX ELI COM SWD JOIN
PMR NIS CERT CSIRT SOC IDS IPS SIEM EDR XDR MFA OTP DDOS APT
""".split())


def candidats(articles, suivis_codes, glossaire, mini=3):
    """Acronymes inconnus vus dans au moins `mini` articles pertinents (hors listes d'exclusion)."""
    connus = {_sa(c).upper() for c in suivis_codes} | {_sa(k).upper() for k in glossaire} | VARIANTES
    vus = {}
    for a in articles:
        if a.get("base") or a.get("pertinence") not in ("elevee", "moyenne"):
            continue
        texte = a.get("titre", "") + " " + a.get("resume", "")
        lettres = [c for c in texte if c.isalpha()]
        if lettres and sum(c.isupper() for c in lettres) / len(lettres) > 0.6:
            continue   # titre écrit en majuscules : pas d'acronymes exploitables
        for m in set(RE_CANDIDAT.findall(texte)):
            s = _sa(m).upper()
            if s in EXCLUS or s in connus or re.fullmatch(MOIS, s) or re.fullmatch(r"[IVXLC]+", s) or s.isdigit() \
                    or re.fullmatch(r"\d.*|.*\d{4}", s) or len(s) < 2:
                continue
            e = vus.setdefault(m, {"code": m, "nb_articles": 0, "exemple": None})
            e["nb_articles"] += 1
            if e["exemple"] is None or a["date"] > e["exemple"]["date"]:
                tr = a.get("trad") or {}
                e["exemple"] = {"date": a["date"], "lien": a.get("lien", ""), "titre": a["titre"],
                                "titre_fr": (tr.get("fr") or {}).get("titre", ""), "titre_en": (tr.get("en") or {}).get("titre", ""),
                                "langue": a.get("langue", "")}
    return sorted((e for e in vus.values() if e["nb_articles"] >= mini), key=lambda e: -e["nb_articles"])[:60]
