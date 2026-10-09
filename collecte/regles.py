"""
Cyber Watch — règles de décision de la pertinence (v4), sans IA générative.

Le modèle open source (pertinence.py) mesure à quel point un article « parle
de » cyber / données / santé. Ce module ajoute des règles explicites, lisibles
et modifiables, qui décident du NIVEAU final :

    essentiel   -> onglet « L'essentiel » (textes et normes importants)
    elevee      -> « très pertinent »  (Veille)
    moyenne     -> « pertinent »       (Veille)
    faible      -> « à surveiller »    (Veille, section repliée)
    ecarte      -> liste des écartés   (onglet Sources, consultable)

Principes (validés) :
  1. Filet de sécurité : un article qui cite un TEXTE CLÉ (NIS2, CRA, IVDR…)
     n'est jamais écarté ni rangé en « à surveiller » : au moins « pertinent ».
  2. « Très pertinent » exige un SIGNAL RÉGLEMENTAIRE (loi, décret, lignes
     directrices, consultation, norme, sanction… dans toutes les langues) :
     le modèle seul ne peut plus classer un vœu de Pâques en très pertinent.
  3. BRUIT (alertes de vulnérabilités, événements, vœux, recrutement, marchés,
     finance, télécoms…) : écarté, sauf source officielle (« à surveiller »)
     ou texte clé cité.
  4. Hors Europe : seuls les textes à portée mondiale (ISO/IEC, IMDRF, FDA
     cybersécurité des dispositifs médicaux…) sont gardés.
  5. Les mots-clés ne décident jamais seuls ; ils ne font que justifier.
"""

import re
import unicodedata


def _sa(s):
    return "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn")


def _rx(motif):
    return re.compile(motif, re.I)


# --------------------------------------------------------------------------- textes clés
# id : (libellé, rubrique, niveau A/B, motif). Niveau A = peut aller dans L'essentiel.
# Motifs appliqués au texte SANS accents (titre + résumé + traduction anglaise).

TEXTES_CLES = [
    ("NIS2", "reglementation", "A",
     r"\bNIS ?-?2\b|2022/2555|NIS2UmsuCG|Cyberbeveiligingswet|kyberturvallisuuslaki|cybersakerhetslag|"
     r"krajowym systemie cyberbezpieczenstwa|ustaw\w* o (krajowym systemie )?cyberbezpieczenstw|"
     r"zakon\w* o kyberneticke bezpecnosti|kiberbiztonsag\w* (szolo )?torveny|"
     r"ley de coordinacion y gobernanza de la ciberseguridad|decreto legislativo (n\. )?138|"
     r"loi (relative a la )?resilience des infrastructures critiques|projet de loi resilience|"
     r"network and information security directive|Cyber Security and Resilience Bill|"
     r"Netz- und Informationssicherheit|NIS-(Umsetzungs|Richtlinie)|NISG 2024|lov om net- og informationssikkerhed|"
     r"Kyberbezpecnost|cybersikkerhetslov|entites essentielles et importantes|essential and important entities|"
     r"(besonders )?wichtige(n)? Einrichtungen|entidades esenciales e importantes|soggetti essenziali e importanti|"
     r"essentiele en belangrijke entiteiten|podmiot\w* kluczow\w*|securite des reseaux et (des )?systemes d'information|"
     r"ciberseguranca.{0,40}(decreto-lei|regime juridico)|"
     # titre officiel de la directive (les textes de la Commission ne disent pas « NIS2 »)
     r"high common level of cybersecurity|niveau eleve commun de cybersecurite|hohes gemeinsames Cybersicherheitsniveau|"
     r"livello comune elevato di cibersicurezza|elevado nivel comun de ciberseguridad"),
    ("CRA", "reglementation", "A",
     r"Cyber ?Resilience Act|(?-i:\bCRA\b)|2024/2847|cyber ?resilience regulation|reglement sur la cyberresilience|"
     r"Cyberresilienz(-)?(verordnung|gesetz)|ley de ciberresiliencia|regolamento sulla ciberresilienza|"
     r"products? with digital elements|produits comportant des elements numeriques|"
     r"horizontal cybersecurity requirements|exigences horizontales en matiere de cybersecurite"),
    ("AI Act", "reglementation", "A",
     r"\bAI Act\b|Artificial Intelligence Act|2024/1689|reglement (europeen )?sur l'(IA|intelligence artificielle)|"
     r"\bRIA\b.{0,30}(IA|intelligence)|KI-Verordnung|KI-VO\b|AI-verordening|reglamento (europeo )?de (IA|inteligencia artificial)|"
     r"regolamento (europeo )?(sull'|sulla )?(IA|intelligenza artificiale)|AI-forordning|akt\w* o sztucznej inteligencji|"
     r"\bAIA\b.{0,30}(high-risk|haut risque)|(providers|deployers) of (general-purpose )?AI|AI systems.{0,60}(obligations|guidelines)|high-risk AI|IA a haut risque|Hochrisiko-KI|general-purpose AI|GPAI"),
    ("RGPD / GDPR", "reglementation", "B",
     r"\bGDPR\b|\bRGPD\b|\bDSGVO\b|\bRODO\b|\bGDPR\b|General Data Protection Regulation|"
     r"reglement general sur la protection des donnees|Datenschutz-Grundverordnung|2016/679|"
     r"Data \(?Use and Access\)? Act|\bUK GDPR\b|\bEDPB\b|\bCEPD\b|Europaischer Datenschutzausschuss|"
     r"(?-i:\bAVG\b)|ΓΚΠΔ|dataskyddsforordning|databeskyttelsesforordning|personvernforordning|tietosuoja-asetus|"
     r"obecne narizeni o ochrane osobnich udaju|regulamento geral (sobre a|de) protecao de dados|regolamento generale sulla protezione|"
     r"reglamento general de proteccion de datos|Algemene verordening gegevensbescherming|revDSG|\bnLPD\b|nouvelle loi sur la protection des donnees"),
    ("IVDR", "secteur", "A",
     r"\bIVDR\b|2017/746|in[- ]vitro diagnostics?\b|diagnostic in vitro|In-vitro-Diagnosti|"
     r"diagnostico in vitro|diagnostica in vitro|diagnostiek in vitro|\bIVD\b|(?-i:\bDMDIV\b)"),
    ("MDR (dispositifs médicaux)", "secteur", "A",
     r"Medical Devices? Regulation|2017/745|reglement (relatif )?aux dispositifs medicaux|"
     r"\bMDR\b.{0,60}(device|dispositif|medic|Medizin)|(device|dispositif|medic|Medizin).{0,60}\bMDR\b|"
     r"Medizinprodukte(-)?(verordnung|recht|gesetz|durchfuhrungsgesetz)|\bMPDG\b|reglamento de productos sanitarios|"
     r"regolamento (sui|dei) dispositivi medici|medische hulpmiddelen|wyrob\w* medyczn|zdravotnick\w* prostredk|"
     r"medical device (software|cybersecurity|regulation)|dispositifs? medicaux|logiciels? dispositifs? medica"),
    ("MDCG", "secteur", "A", r"\bMDCG\b|Medical Device Coordination Group"),
    ("EHDS", "secteur", "A",
     r"\bEHDS\b|European Health Data Space|espace europeen des donnees de sante|Gesundheitsdatenraum|2025/327|"
     r"espacio europeo de datos (sanitarios|de salud)|spazio europeo dei dati sanitari|Europese ruimte voor gezondheidsgegevens"),
    ("Data Act", "reglementation", "A",
     r"\bData Act\b|2023/2854|reglement sur les donnees\b|Datenverordnung|Data-Act|\bDatengesetz\b"),
    ("CER (entités critiques)", "reglementation", "A",
     r"Critical Entities Resilience|resilience des entites critiques|2022/2557|KRITIS-Dachgesetz|"
     r"\bCER\b.{0,40}(directive|Richtlinie|critical|critique)|entites critiques|kritische(n)? Anlagen|kritieke entiteiten"),
    ("Cybersecurity Act / certification UE", "reglementation", "A",
     r"Cyber ?security Act|2019/881|\bEUCC\b|\bEUCS\b|\bEU5G\b|(EU|European) cybersecurity certification|"
     r"certification europeenne de cybersecurite|Cyber Solidarity Act|2025/38\b|Digital Omnibus|omnibus numerique|"
     r"Omnibus digital|digitale(s|n)? Omnibus"),
    ("Cloud and AI Development Act (CADA)", "reglementation", "A",
     r"Cloud and AI Development Act|(?-i:\bCADA\b)"),
    ("eIDAS 2 / portefeuille européen d'identité", "reglementation", "B",
     r"\beIDAS ?2?\b|EUDI ?Wallet|European Digital Identity|portefeuille europeen d'identite"),
    ("Directive responsabilité produits (PLD)", "reglementation", "A",
     r"Product Liability Directive|2024/2853|responsabilite du fait des produits (defectueux)?|Produkthaftung"),
    ("RED (équipements radio) / EN 18031", "standards", "A",
     r"Radio Equipment Directive|2022/30\b|equipements radioelectriques|Funkanlagen(richtlinie)?|EN ?18031|"
     r"\bRED\b.{0,40}(delegated|delegue|cyber|article 3)"),
    ("IEC 81001-5-1 / IEC 62443", "standards", "A", r"81001-5-1|IEC ?81001|(?<![\d])62443(?![\d])"),
    ("ISO/IEC 27001 et normes ISO", "standards", "A",
     r"ISO(/IEC)? ?2700[0-9]|ISO(/IEC)? ?27701|ISO(/IEC)? ?42001|ISO ?13485|ISO ?14971|ISO(/IEC)? ?2703[0-9]|"
     r"ISO/IEC ?15408|Common Criteria"),
    ("Normes européennes harmonisées (CEN-CENELEC, ETSI)", "standards", "A",
     r"harmoni[sz]ed standards?|normes? harmonisees?|harmonisierte Normen?|standardisation request|demande de normalisation|"
     r"\bJTC ?13\b|CEN-CENELEC|\bETSI EN\b|ETSI TS 103|EN 303 645"),
    ("DTAC / DSPT / Cyber Essentials (NHS)", "secteur", "A",
     r"\bDTAC\b|Digital Technology Assessment Criteria|\bDSPT\b|Data Security and Protection Toolkit|"
     r"Cyber Essentials|\bDCB ?01(29|60)\b|Cyber Assessment Framework|\bCAF\b.{0,30}(NHS|NCSC)"),
    ("ENS / CPSTIC (Espagne)", "reglementation", "A",
     r"Esquema Nacional de Seguridad|\bENS\b.{0,60}(segur|certific|CCN|conformidad)|Real Decreto 311/2022|\bCPSTIC\b"),
    ("HDS / SecNumCloud / PGSSI-S (France)", "secteur", "A",
     r"hebergeurs? de donnees de sante|hebergement de donnees de sante|\bHDS\b.{0,40}(sante|certif|heberg|referentiel)|"
     r"SecNumCloud|PGSSI-S|politique generale de securite des systemes d'information de sante"),
    ("C5 / B3S / KHZG (Allemagne)", "secteur", "A",
     r"\bC5\b.{0,40}(BSI|cloud|Kriterienkatalog|Testat)|Cloud Computing Compliance Criteria|\bB3S\b|"
     r"Krankenhauszukunftsgesetz|\bKHZG\b|Gesundheitsdatennutzungsgesetz|\bGDNG\b|Digital-Gesetz|\bDigiG\b"),
    ("NEN 7510 (Pays-Bas)", "secteur", "A", r"NEN ?751[0-3]"),
    ("BPF / GMP Annexe 11 et 22", "secteur", "A",
     r"Annex(e)? ?(11|22)\b|Anhang (11|22)\b|computeri[sz]ed systems.{0,40}(GMP|BPF)|GMP.{0,40}(artificial intelligence|AI\b)"),
]
TEXTES_CLES = [(i, rub, niv, re.compile(m, re.I)) for i, rub, niv, m in TEXTES_CLES]

# Libellés anglais des textes clés (affichés sur le site en anglais)
LIBELLES_EN = {
    "RGPD / GDPR": "GDPR", "MDR (dispositifs médicaux)": "MDR (medical devices)", "CER (entités critiques)": "CER (critical entities)",
    "Cybersecurity Act / certification UE": "Cybersecurity Act / EU certification",
    "eIDAS 2 / portefeuille européen d'identité": "eIDAS 2 / European digital identity wallet",
    "Directive responsabilité produits (PLD)": "Product Liability Directive (PLD)", "RED (équipements radio) / EN 18031": "RED (radio equipment) / EN 18031",
    "ISO/IEC 27001 et normes ISO": "ISO/IEC 27001 and ISO standards",
    "Normes européennes harmonisées (CEN-CENELEC, ETSI)": "European harmonised standards (CEN-CENELEC, ETSI)",
    "ENS / CPSTIC (Espagne)": "ENS / CPSTIC (Spain)", "HDS / SecNumCloud / PGSSI-S (France)": "HDS / SecNumCloud / PGSSI-S (France)",
    "C5 / B3S / KHZG (Allemagne)": "C5 / B3S / KHZG (Germany)", "NEN 7510 (Pays-Bas)": "NEN 7510 (Netherlands)",
    "BPF / GMP Annexe 11 et 22": "GMP Annex 11 and 22",
}

# Textes à portée mondiale (gardés même s'ils viennent d'une source ou d'un pays hors Europe)
PORTEE_MONDIALE = _rx(
    r"\bISO(/IEC)?\b ?\d{4,5}|\bIEC\b ?\d{4,5}|\bIMDRF\b|\bMDSAP\b|"
    r"FDA.{0,80}(cyber|premarket|524B|medical device)|(cyber|premarket).{0,60}\bFDA\b|\b524B\b|"
    r"\bWHO\b.{0,40}(guidance|regulat|digital health)|\bOECD\b.{0,40}(AI|artificial intelligence|guideline)")

# --------------------------------------------------------------------------- signal réglementaire
SIGNAL = _rx(
    # anglais
    r"\b(law|laws|act|(the|a|new|draft|protection|security|resilience|data|safety|health) bill|regulation|regulations|regulatory|directive|decree|ordinance|guideline|guidelines|guidance|"
    r"code of (practice|conduct)|consultation|draft|proposal|transpos\w*|implementing (act|regulation)|delegated (act|regulation)|"
    r"standard|standards|framework|requirement|requirements|obligation|obligations|compliance|comply|enforcement|enforce\w*|"
    r"fine|fined|fines|penalt\w*|sanction\w*|supervis\w*|certification|certified|adopt\w*|enters? into force|entry into force|"
    r"in force|official journal|parliament|legislat\w*|mandatory|deadline|notified bod\w*|harmoni[sz]ed|assessment criteria|"
    r"toolkit|scheme|roadmap|reform|amend\w*|repeal\w*|rules|ruling|judgment|court|authority|regulator)\b|"
    # français
    r"\b(loi|lois|decret|decrets|arrete|ordonnance|reglement|directive|lignes directrices|recommandation|referentiel|norme|normes|"
    r"consultation|projet de (loi|decret|texte)|proposition de loi|transposition|entree en vigueur|obligation\w*|conformite|"
    r"sanction\w*|amende\w*|mise en demeure|certification|journal officiel|deliberation|circulaire|doctrine|guide|"
    r"exigences?|reforme|abrog\w*|jurisprudence|conseil d'etat|autorite)\b|"
    # allemand
    r"(gesetz|verordnung|richtlinie|leitlinie|leitfaden|\bnorm\b|normen|entwurf|umsetzung|inkrafttreten|pflicht|bussgeld|"
    r"konsultation|referentenentwurf|bundesgesetzblatt|anforderung|zertifizierung|aufsicht|vorschrift)|"
    # espagnol / portugais / italien
    r"\b(ley|leyes|real decreto|decreto|decreto-lei|reglamento|directiva|guia|norma|normas|consulta publica|anteproyecto|"
    r"proyecto de|transposicion|entrada en vigor|obligaci\w*|sancion\w*|multa|multas|BOE|certificacion|esquema nacional|"
    r"lei|regulamento|diretiva|orientacoes|transposicao|entrada em vigor|coima|diario da republica|"
    r"legge|regolamento|direttiva|linee guida|consultazione|recepimento|entrata in vigore|obblig\w*|sanzion\w*|gazzetta)\b|"
    # néerlandais / nordiques / finnois
    r"\b(wet|wetsvoorstel|besluit|verordening|richtlijn|richtsnoeren|consultatie|internetconsultatie|inwerkingtreding|boete|"
    r"verplicht\w*|lov|lag|lagen|loven|forskrift|forordning|bekendtgorelse|foreskrift\w*|direktiv|vejledning|veiledning|"
    r"vagledning|horing|remiss|lovforslag|bode|sanktionsavgift|krav|laki|asetus|direktiivi|ohje|lausunto|luonnos|"
    r"seuraamusmaksu|maarays)\b|"
    # polonais / tchèque / hongrois
    r"(ustaw|rozporzadzeni|dyrektyw|wytyczn|konsultacj|wdrozeni|obowiaz|dziennik ustaw|zakon|vyhlask|narizeni|smernic|"
    r"metodik|povinnost|pokut|torveny|rendelet|iranyelv|utmutato|birsag|kotelezettseg)|"
    # grec
    r"(νομος|νομοσχεδιο|διαταγμα|κανονισμος|οδηγια|διαβουλευση|προστιμο|υποχρεωσ|ΦΕΚ|ΚΥΑ)")

# Signal réglementaire « net » : exigé pour « très pertinent » quand aucun texte clé n'est cité
SIGNAL_NET = _rx(
    r"\b(law|laws|(?-i:[A-Z]\w+ Act)|regulation|regulations|directive|decree|ordinance|guidelines?|guidance|code of practice|"
    r"consultation|call for evidence|draft (law|act|bill|regulation|guidance|guidelines|standard)|proposal for a|transpos\w*|"
    r"implementing (act|regulation)|delegated (act|regulation)|obligations?|fined?|fines|penalt\w*|sanction\w*|"
    r"enforcement (action|notice)|certification scheme|adopt(ed|s)|enters? into force|entry into force|official journal|"
    r"mandatory|harmoni[sz]ed standards?|notified bod\w*|new standard|standard (published|adopted))\b|"
    r"\b(loi|decret|arrete|ordonnance|reglement|directive|lignes directrices|recommandations?|referentiel|consultation|"
    r"projet de (loi|decret)|proposition de loi|transposition|entree en vigueur|obligations?|sanctions?|amendes?|"
    r"mise en demeure|journal officiel|deliberation|norme)\b|"
    r"(gesetz|verordnung|richtlinie|leitlinie|leitfaden|referentenentwurf|gesetzentwurf|umsetzung|inkrafttreten|"
    r"pflichten|bussgeld|konsultation)|"
    r"\b(ley|real decreto|decreto|decreto-lei|reglamento|directiva|guia|consulta publica|anteproyecto|transposicion|proyecto de (ley|real decreto|r\.? ?d)|regulacion|"
    r"entrada en vigor|obligaciones|sancion|multa|lei|regulamento|diretiva|orientacoes|transposicao|entrada em vigor|coima|"
    r"legge|regolamento|direttiva|linee guida|consultazione|recepimento|entrata in vigore|sanzione)\b|"
    r"\b(wet|wetsvoorstel|besluit|verordening|richtlijn|richtsnoeren|internetconsultatie|inwerkingtreding|boete|lov|lag|"
    r"forskrift|forordning|bekendtgorelse|foreskrift\w*|vejledning|veiledning|vagledning|horing|remiss|lovforslag|bode|"
    r"sanktionsavgift|laki|asetus|ohje|lausunto|luonnos|seuraamusmaksu)\b|"
    r"(ustaw|rozporzadzeni|dyrektyw|wytyczn|konsultacj|zakon|vyhlask|narizeni|smernic|metodik|pokut|torveny|rendelet|"
    r"iranyelv|utmutato|birsag|νομος|νομοσχεδιο|κανονισμος|οδηγια|διαβουλευση|προστιμο)")

# Journaux officiels : des centaines de textes par semaine ; sans texte clé, il faut un sujet « fort »
JOURNAL_OFFICIEL = re.compile(r"L[ée]gifrance|EUR-Lex|Bundesgesetzblatt|f[öo]rfattningssamling|\bBOE\b|Gazzetta Ufficiale|"
                              r"Di[áa]rio da Rep[úu]blica|Dziennik Ustaw|Staatsblad|Moniteur belge|Lovtidend|Sbírka zákonů", re.I)
# Bruit propre aux journaux officiels et à EUR-Lex
BRUIT_JO = _rx(r"replacing (a|an) (full |alternate )?member|appointment of|restrictive measures|prior notification of a concentration|"
               r"non-opposition to a notified concentration|indice des prix|tarification (des|de la)|cuestion de inconstitucionalidad|"
               r"recurso de inconstitucionalidad|zone (interdite|protegee)|dissolution d'une association")

# Sujet « fort » : exigé pour faire entrer dans L'essentiel un texte officiel qui ne cite aucun texte clé connu
SUJET_FORT = _rx(
    r"critical (entities|infrastructures?)|entites critiques|infrastructures? critiques|kritische infrastruktur|kritis|"
    r"infraestructuras? criticas|infrastrutture critiche|kritieke entiteiten|"
    r"cyber|kyber|ciber|kiber|κυβερνο|informationssicherheit|IT-Sicherheit|information security|informatiebeveiliging|"
    r"securite (informatique|numerique|des systemes d'information)|seguridad de la informacion|sicurezza informatica|"
    r"tietoturva|informationssakerhet|informasjonssikkerhet|data protection|protection des donnees|datenschutz|"
    r"proteccion de datos|protezione dei dati|protecao de dados|gegevensbescherming|ochron\w* danych|tietosuoja|adatvedelem|"
    r"personal data|donnees personnelles|personenbezogen|datos personales|dati personali|dane osobowe|ΓΚΠΔ|"
    r"artificial intelligence|intelligence artificielle|kunstliche intelligenz|inteligencia artificial|intelligenza artificiale|"
    r"kunstmatige intelligentie|sztuczn\w* inteligencj|umel\w* inteligenc|tekoaly|mesterseges intelligencia|"
    r"(?-i:\bAI\b|\bIA\b|\bKI\b)|medical devices?|dispositifs? medica|medizinprodukt|productos? sanitario|dispositivi medic|"
    r"in vitro|diagnosti|health data|donnees de sante|gesundheitsdaten|datos de salud|dati sanitari|e-?health|e-?sante|"
    r"sante numerique|digital health|zarzadzaniu danymi|data governance|gouvernance des donnees|cloud|"
    r"systemes? d'information|information systems?|informationssystem|biologie medicale|laboratoires? de biologie|"
    r"medizinische(n)? Labor|in-vitro|Medizinprodukt|telematik|elektronische Patientenakte|"
    # v5.1 : cadres nationaux de sécurité dont le titre ne dit pas « cyber »
    r"seguridad de las redes|seguridad de la informacion|sistemas de informacion|"
    r"sicurezza delle reti|informationssicherheit|reseaux et (des )?systemes d'information|netz- und informationssicherheit")

# --------------------------------------------------------------------------- bruit
BRUIT = [
    ("vulnérabilités / alertes techniques", _rx(
        r"\bCVE-\d|schwachstelle|\[update\]|\[(niedrig|mittel|hoch|kritisch)\]|security (update|advisory|bulletin)s?\b|"
        r"\bpatch(es|ed)?\b|exploit(ed|s|ation)?\b|zero-day|0-day|vulnerabilit(y|ies) (in|affecting|found)|"
        r"mise a jour de securite|vulnerabilidad(es)? (en|critica)|vulnerabilita|zranitelnost|podatnos|sarbarhed|"
        r"haavoittuvuu|sebezhetoseg|kwetsba(ar|arheid) in|bulletin d'alerte|avis de securite")),
    ("menaces / incidents", _rx(
        r"ransomware (attack|gang|group|operators?)|cyber ?attack (on|against|hits)|\bhackers?\b|breach(ed)? at\b|"
        r"data leak at|phishing (campaign|attack|scam)|\bmalware\b|\bbotnet\b|\bDDoS\b|\bAPT ?\d+|threat actors?|"
        r"cyberattaque contre|piratage|hackerangriff|ciberataque (a|contra)|attacco informatico|arnaque|scam\b|"
        r"infostealer|spyware|trojan|backdoor")),
    ("événements / webinaires", _rx(
        r"webinar|webinaire|\bconference\b|\brencontres\b|participez|colloque|\bassises\b|congress|congres\b|summit|sommet|save the date|register now|inscri(vez|ption)|"
        r"\bevenement|\bevent\b|veranstaltung|tagung|jornada|\bevento\b|seminar|seminaire|workshop|atelier|meetup|"
        r"hackathon|podcast|livestream|\bsalon\b|round ?table|table ronde|masterclass|bootcamp|info day|infoday|"
        r"\btraining\b|\bcours\b|\bcourse\b|szkoleni|\bkurs\b|\bcurso\b|\bcorso\b|e-learning|\bmooc\b")),
    ("vœux / prix / RH", _rx(
        r"(joyeuses?|happy|merry|frohe|feliz|buon[ae]?|god|glaedelig|hyvaa) (fetes|holidays|christmas|easter|new year|"
        r"ostern|weihnachten|navidad|pascua|pasqua|natale|jul|paaskeaften)|season'?s greetings|meilleurs voeux|"
        r"\bawards?\b|\bprix\b|trophee|\bwinners?\b|laureat|\bjobs?\b|vacanc(y|ies)|we'?re hiring|recrute|recrutement|"
        r"internship|\bstage\b|appointed|appointment of|nomination|nomme(e)? |obituary|anniversary|anniversaire|"
        r"legal leaders|top \d+ (lawyers|firms)|ranking of")),
    ("marchés / entreprises", _rx(
        r"funding round|raises? \$|leve \d|levee de fonds|\bacquisition\b|\bacquires?\b|\bmerger\b|\bfusion\b|"
        r"partnership with|partenariat avec|\blaunch(es|ed)?\b(?! (a |an |the |its |new )?(public |targeted |open )?(consultation|call|initiative|review|evaluation|survey|procedure|investigation|dialogue))|lance (son|sa)|new product|market (size|report|growth|share)|"
        r"\bCAGR\b|stock|shares|earnings|quarterly results|chiffre d'affaires|\bIPO\b|credit rating|marketsandmarkets|"
        r"press release.{0,20}(announces|launch)|announces? (new|the launch)")),
    ("finance / banque", _rx(
        r"\bbank(s|ing)?\b|\bbanques?\b|\bDORA\b|\bMiCA\b|crypto|payment services|\bPSD[23]\b|anti-money|\bAML\b|"
        r"insurance|compagnies? d.assurance|stablecoin|capital requirements|credit institutions?|investment firms?|"
        r"\bEBA\b|\bESMA\b|\bEIOPA\b|fund managers?|securities")),
    ("télécoms", _rx(
        r"spectrum|\b5G\b|roaming|broadband|\bfibre\b|haut debit|net neutrality|numbering|termination rates|"
        r"universal service|\bBEREC\b|frequenc(y|ies) (band|auction)|telecoms? operators?")),
    ("sensibilisation / conseils", _rx(
        r"\btips\b|conseils pour|how to (protect|stay|spot)|comment (se proteger|reconnaitre)|stay safe|"
        r"awareness (month|week|campaign)|mois (europeen )?de la cybersecurite|\bquiz\b|infographi")),
    ("médicaments (hors dispositifs)", _rx(
        r"medicinal products?|\bmedicaments?\b|\bvaccin|clinical trials?|essais? cliniques?|drug shortages?|penuries? de|"
        r"arzneimittel|medicamentos?|farmac\w*|\bpharmacovigilance|marketing authori[sz]ation|autorisation de mise sur le marche")),
    ("hors sujet (autres domaines)", _rx(
        r"\bpollen|\bweather\b|football|\brecipes?\b|horoscope|tourism|tourisme|agricultur|fishing|peche\b|"
        r"obesity|anti-obesity|nutrition|diet\b|real estate|immobilier")),
]

# Sujets nettement centrés sur les États-Unis (ou un autre pays hors Europe)
HORS_EUROPE = _rx(
    r"\bHIPAA\b|\bHITECH\b|\bHITRUST\b|\bFTC\b|\bSEC\b|\bCISA\b|\bCMS\b|\bU\.?S\.? (state|federal|congress|senate)|"
    r"\b(state|federal) law\b|\bCongress\b|\bSenate\b|\bWhite House\b|California|Texas|New York|Colorado|Missouri|Georgia\b|"
    r"Alabama|Virginia|Illinois|Washington state|\bCCPA\b|\bCPRA\b|Canada|Australia|India\b|Japan|China|Singapore|"
    r"Brazil|South Korea|Saudi|UAE|Nigeria|Kenya|Philippines|Indonesia|Vietnam|Malaysia")

# L'article parle de l'Europe (même publié par une source internationale)
EUROPE_SUJET = _rx(
    r"\bEurop\w*|€|\bEUR\b|\beuros?\b|\bEU\b|\bUE\b|\bEU-|\bEU's|Brussels|Bruxelles|Commission europeenne|European Commission|"
    r"Germany|German|Allemagne|Deutschland|France|French|Francais\w*|Spain|Spanish|Espagne|Italy|Italian|Italie|"
    r"Netherlands|Dutch|Pays-Bas|Belgium|Belgique|Poland|Polish|Pologne|Portugal|Czech|Tcheque|Austria|Autriche|"
    r"Sweden|Swedish|Suede|Denmark|Danish|Danemark|Norway|Norwegian|Norvege|Finland|Finnish|Finlande|Greece|Greek|Grece|"
    r"Hungary|Hungarian|Hongrie|Switzerland|Swiss|Suisse|United Kingdom|\bUK\b|Britain|British|England|\bNHS\b|Ireland|Irish")

# Sujet cyber / données / IA / santé numérique / diagnostic (toutes langues). Ne sert
# jamais à ÉCARTER : il faut ce sujet pour être classé « pertinent » sans texte clé cité.
SUJET = _rx(
    r"cyber|kyber|ciber|kiber|κυβερνο|securit|sicherheit|seguridad|sicurezza|seguranca|beveiliging|bezpieczenstw|"
    r"bezpecnost|sakerhet|sikkerhet|turvallisuu|biztonsag|ασφαλει|resilien|telematik|ΓΚΠΔ|securit(y|e) (informatique|numerique|des (SI|systemes)|de l'information|of (network|information))|"
    r"information security|informationssicherheit|IT-Sicherheit|seguridad (de la informacion|informatica|digital)|"
    r"sicurezza (informatica|digitale)|informatiebeveiliging|bezpieczenstw\w* (informacji|teleinformatyczn|cyfrow)|"
    r"informacni bezpecnost|informationssakerhet|informasjonssikkerhet|informationssikkerhed|tietoturva|informaciobiztonsag|"
    r"data protection|protection des donnees|datenschutz|proteccion de datos|protezione dei dati|protecao de dados|"
    r"gegevensbescherming|ochron\w* danych|ochran\w* (osobnich )?udaj|dataskydd|personvern|databeskyttelse|tietosuoja|"
    r"adatvedelem|προσωπικ\w* δεδομ|privacy|vie privee|personal data|donnees personnelles|personenbezogen|"
    r"datos personales|dati personali|dados pessoais|persoonsgegevens|dane osobowe|osobni udaje|personuppgift|"
    r"personopplysning|personoplysning|henkilotie|szemelyes adat|artificial intelligence|intelligence artificielle|"
    r"kunstliche intelligenz|(?-i:\bKI\b)|inteligencia artificial|intelligenza artificiale|inteligencia artificial|"
    r"kunstmatige intelligentie|sztuczn\w* inteligencj|umel\w* inteligenc|artificiell intelligens|kunstig intelligens|"
    r"tekoaly|mesterseges intelligencia|τεχνητ\w* νοημοσ|(?-i:\bAI\b|\bIA\b|\bGenAI\b)|digital|numerique|digitali|cyfrow|"
    r"digitaln|ψηφιακ|cloud|software|logiciel|\bdata\b|donnees|\bdaten|\bdatos\b|\bdati\b|\bdados\b|gegevens|"
    r"\bdane\b|\budaj|\bdata\w*|e-?health|e-?sante|telemedic|telemedecine|telesante|dossier (medical|patient)|"
    r"electronic (health|patient) record|patient record|health data|gesundheitsdaten|elektronische patientenakte|\bePA\b|"
    r"medical devices?|dispositifs? medica|medizinprodukt|productos? sanitario|dispositivi? medic|dispositivos? medic|"
    r"medische hulpmiddel|wyrob\w* medyczn|zdravotnick\w* prostred|medicintekni|medisinsk utstyr|medicinsk udstyr|"
    r"in vitro|diagnosti|laborator|microbiol|biolog|genom|(?-i:\bICT\b|\bTIC\b|\bIT\b)|informatique|information systems?|"
    r"systemes? d'information|eIDAS|\bEUDI\b|encryption|chiffrement|verschlussel|cifrado|crittograf|"
    r"cryptograph|kryptograf|quantum|quantique|critical (infrastructure|entities)|infrastructures? critiques|"
    r"kritische infrastruktur|\bKRITIS\b|supply chain|chaine d'approvisionnement|lieferkette|ransomware|"
    r"vulnerab|interoperab|"
    r"elektronische patientenakte|dossier medical partage|historia clinica electronica|fascicolo sanitario elettronico")

EUROPE = {"Europe", "Union européenne", "UE", "Allemagne", "Autriche", "Belgique", "Bulgarie", "Danemark", "Espagne",
          "Finlande", "France", "Grèce", "Hongrie", "Italie", "Norvège", "Pays-Bas", "Pologne", "Portugal",
          "Rép. Tchèque", "République tchèque", "Royaume-Uni", "Suède", "Suisse", "Irlande", "Luxembourg"}

# Signaux « forts » (texte adopté / publié) : permettent L'essentiel sans texte clé connu,
# pour une source officielle (badge « à vérifier »)
SIGNAL_FORT = _rx(
    r"(adopted|adopte|published in the official journal|journal officiel|entre(s|e)? en vigueur|enters? into force|"
    r"in kraft|entrada en vigor|entrata in vigore|inwerkingtreding|trer i kraft|trader i kraft|voimaan|hatalyba|"
    r"wchodzi w zycie|nabyva ucinnosti|new (law|act|regulation|decree)|nouvelle loi|nouveau decret|"
    r"\b(loi|decret|arrete|ordonnance) n\W|real decreto|decreto-lei|\bgesetz zur\b|verordnung zur|"
    r"ustawa z dnia|zakon c\.|zakon o|torveny|lov om|lag om|laki|wet van|\bact 20\d\d\b|guidelines on|lignes directrices sur|"
    r"guidance on|consultation (on|sur)|call for evidence|draft (law|act|bill|regulation|directive|decree|guidelines)|"
    # v5 : propositions et projets de texte (pour voir venir un texte AVANT son adoption, ex. NIS2 en 2020)
    r"proposal for a (new )?(regulation|directive|decision|law)|legislative proposal|commission propos\w*|"
    r"proposition de (loi|reglement|directive)|projet de (loi|decret|reglement|directive)|avant-projet de loi|"
    r"gesetzentwurf|referentenentwurf|regierungsentwurf|entwurf (eines|einer) (gesetz|verordnung)|"
    r"anteproyecto de ley|proyecto de (ley|real decreto|r\.? ?d\.?\b)|disegno di legge|schema di (decreto|regolamento)|"
    r"proposta de lei|projeto de (lei|decreto)|wetsvoorstel|ontwerpbesluit|voorontwerp|wetsontwerp|"
    r"lovforslag|forslag til lov|lagforslag|lagradsremiss|hallituksen esitys|luonnos laiksi|"
    r"projekt ustawy|projekt rozporzadzenia|navrh zakona|navrh vyhlasky|torvenyjavaslat|torvenytervezet|"
    r"σχεδιο νομου|νομοσχεδιο|bill (introduced|published|tabled)|"
    # v5.1 : un acte numéroté est un texte adopté (titres du Journal officiel : « Directive (EU) 2022/2555 … »)
    r"\b(directive|regulation|decision|reglement|richtlinie|verordnung|directiva|reglamento|direttiva|regolamento)\s*\((eu|ue)\)\s*(no\s*)?\d{4}/\d+|"
    r"real decreto \d+/\d{4}|decreto legislativo,? \d|decreto-lei n|gesetz zur umsetzung|\bwet van \d|ustawa z dnia|"
    # v6 : étapes de la procédure législative (valables pour n'importe quel texte)
    r"\badopts? (a |an |its |the |new )?([\w-]+ ){0,3}(law|regulation|directive|act|rules|position|mandate|text|bill|decree|legislation|framework)\b|negotiating (mandate|position)|general approach|common position|(political|provisional) (agreement|deal)|"
    r"strike a deal|reach(es|ed)? (a )?(deal|agreement)|trilogue|first reading|new (eu )?rules|new (eu )?law|"
    r"mandat de negociation|orientation generale|accord (provisoire|politique)|nouvelles regles|premiere lecture|"
    r"allgemeine ausrichtung|vorlaufige einigung|politische einigung|trilog|neue regeln|"
    r"orientacion general|acuerdo (provisional|politico)|nuevas normas|orientamento generale|accordo (provvisorio|politico)|nuove norme)", )

# Statut d'un texte, déduit du titre / résumé (multilingue, prudent)
STATUTS = [
    ("consultation", _rx(r"consultation|call for (evidence|input|views|feedback)|have your say|share (their|your) views|appel a contributions|consulta publica|konsultation|consultatie|"
                         r"horing|remiss|lausunto|konsultacj|konzultac|διαβουλευση|consultazione")),
    ("projet", _rx(r"negotiating (mandate|position)|general approach|common position|(political|provisional) (agreement|deal)|"
                   r"strike a deal|trilogue|mandat de negociation|orientation generale|accord (provisoire|politique)|"
                   r"\bdraft\b|proposal|proposition de|projet de (loi|decret|texte|reglement)|\bentwurf|referentenentwurf|"
                   r"anteproyecto|proyecto de (ley|real decreto|r\.? ?d\.?\b)|wetsvoorstel|lovforslag|projekt ustawy|navrh zakona|"
                   r"tervezet|disegno di legge|proposta de lei|\bbill\b")),
    ("adopte", _rx(r"adopted|adopte|\badopts? (a |an |its |the |new )?([\w-]+ ){0,3}(law|regulation|directive|act|text|bill|decree|legislation)\b|published in the official journal|journal officiel|promulg|verkundet|"
                            r"bundesgesetzblatt|\bBOE\b|gazzetta ufficiale|staatsblad|dziennik ustaw|sbirka zakonu|"
                            r"magyar kozlony|ΦΕΚ|diario da republica|svensk forfattningssamling|lovtidend|signed into law")),
    ("en_vigueur", _rx(r"enters? into force|entry into force|entre(e)? en vigueur|in kraft|entrada en vigor|entrata in vigore|"
                       r"inwerkingtreding|i kraft|voimaan|hatalyba|wchodzi w zycie|ucinnost|applicable from|applies from|"
                       r"s'applique a partir")),
    ("lignes_directrices", _rx(r"guideline|guidance|lignes directrices|leitlinie|leitfaden|orientaciones|guia\b|linee guida|"
                               r"richtsnoeren|vejledning|veiledning|vagledning|wytyczn|metodik|utmutato|recommandation")),
]


def texte_article(a):
    parties = [a.get("titre", ""), a.get("resume", "")]
    en = ((a.get("trad") or {}).get("en") or {})
    parties += [en.get("titre", ""), en.get("resume", "")]
    # v6 : le texte de la page n'est jamais enregistré ni affiché ; ce qu'il apporte est gardé sous forme
    # d'indices (a['indices_page'], voir indices_page) et de note / classement par le sens.
    return _sa(" \n ".join(p for p in parties if p))


# --------------------------------------------------------------------------- compréhension par le sens (v6)
# Probabilités données par le classifieur « par le sens » (collecte/sens.py) : elles complètent les listes de
# mots — un article peut être reconnu comme « nouvelle règle sur notre sujet » sans contenir aucun mot attendu.
SEUIL_SENS = 0.80


LONGUEUR_INDICES = 1500   # début de la page : une simple mention en bas de page ne suffit pas


def indices_page(texte):
    """Indices tirés du début de la page de l'article (lue une seule fois, jamais enregistrée) : textes clés
    cités, signal réglementaire, sujet, statut. Seuls ces indices (pas le texte) sont gardés dans les données,
    pour que le jugement reste le même d'une collecte à l'autre."""
    t = _sa(texte[:LONGUEUR_INDICES])
    ind = {"tc": [x[0] for x in textes_cles(t)], "sig": bool(SIGNAL.search(t)), "sig_net": bool(SIGNAL_NET.search(t)),
           "sig_fort": bool(SIGNAL_FORT.search(t)), "sujet": bool(SUJET.search(t)), "sujet_fort": bool(SUJET_FORT.search(t)),
           "statut": statut(t)}
    return {k: v for k, v in ind.items() if v}


def lire_sens(a):
    x = a.get("sens") or {}
    return {k: x.get(k, 0) >= SEUIL_SENS for k in ("reg", "projet", "adopte", "sujet", "bruit")}


def textes_cles(texte):
    res = []
    for ident, rub, niv, rx in TEXTES_CLES:
        if rx.search(texte):
            res.append((ident, rub, niv))
    return res


def bruits(texte):
    return [nom for nom, rx in BRUIT if rx.search(texte)]


def statut(texte):
    for nom, rx in STATUTS:
        if rx.search(texte):
            return nom
    return ""


def evaluer(a, seuils, score_neg=None):
    """Décide du niveau final d'un article déjà noté (a['score']).
    Trois sources d'indices, combinées : les mots (listes multilingues), la note du modèle de pertinence et,
    s'il a tourné, le classifieur par le sens (a['sens']). Retourne : niveau, essentiel, a_verifier, textes_cles,
    bruit, motif, statut."""
    t = texte_article(a)
    tc = textes_cles(t)
    br = bruits(t)            # le bruit se juge sur le titre et le résumé seulement (pas sur la page)
    sn = lire_sens(a)
    ip = a.get("indices_page") or {}
    par_id = {x[0]: x[:3] for x in TEXTES_CLES}
    tc += [par_id[i] for i in ip.get("tc", []) if i in par_id and all(i != x[0] for x in tc)]
    sig = bool(SIGNAL.search(t)) or sn["reg"] or bool(ip.get("sig"))
    sig_net = bool(SIGNAL_NET.search(t)) or sn["reg"] or bool(ip.get("sig_net"))
    # test du 08/10 : le sens seul (« projet », « adopté ») multipliait les points clés sur les vraies données ;
    # il sert au niveau de pertinence (rien d'oublié) mais jamais seul à créer un point clé.
    sig_fort = bool(SIGNAL_FORT.search(t)) or bool(ip.get("sig_fort"))
    nature = a.get("nature", "presse")
    officiel = nature == "officielle"
    zone = a.get("zone", "")
    hors_eu_source = zone not in EUROPE and zone not in ("", "—")
    hors_eu_sujet = bool(HORS_EUROPE.search(t))
    mondial = bool(PORTEE_MONDIALE.search(t))
    s = a.get("score") or 0
    haut, moy, bas = seuils.get("elevee", 0.55), seuils.get("moyenne", 0.45), seuils.get("bas", 0.33)
    # « sens fort » : le modèle juge le texte très proche des thèmes suivis, même sans aucun mot attendu
    tres_haut = seuils.get("tres_haut", round(haut + 0.15, 2))
    sens_fort = s >= tres_haut
    if score_neg is not None and score_neg > s + 0.02:   # le modèle rapproche l'article d'un thème « bruit »
        br = br or ["proche d'un thème hors sujet (modèle)"]
    # le classifieur par le sens corrige les listes de mots dans les deux sens
    if br and sn["reg"] and sn["sujet"] and not sn["bruit"]:
        br = [b for b in br if b.split(" ")[0] in ("événements", "vœux", "hors")]   # « launches », « acquisition »… ignorés
    elif not br and sn["bruit"] and not sn["reg"] and not tc:
        br = ["hors sujet (sens)"]
    statut_t = statut(t) or ip.get("statut", "")

    europe_cite = bool(EUROPE_SUJET.search(t))
    hors_eu = (hors_eu_source and not europe_cite) or (hors_eu_sujet and not europe_cite)
    sujet = bool(SUJET.search(t)) or sn["sujet"] or bool(ip.get("sujet"))
    sujet_fort = bool(SUJET_FORT.search(t)) or bool(ip.get("sujet_fort"))
    motif = ""
    br_forts = [b for b in br if b.split(" ")[0] in ("événements", "vœux", "marchés", "hors", "sensibilisation")]
    jo = bool(JOURNAL_OFFICIEL.search(a.get("source", "")))
    informatif = len(re.findall(r"\w{3,}", t)) >= 8   # titre + résumé assez parlants pour juger
    if jo and (BRUIT_JO.search(t) or (informatif and not tc and not sujet_fort and not sens_fort)):
        # v6 : un acte numéroté jugé proche par le modèle n'est plus écarté : gardé « à surveiller »
        if not BRUIT_JO.search(t) and SIGNAL_FORT.search(t) and s >= haut:
            return {"niveau": "faible", "essentiel": False, "a_verifier": False, "textes_cles": [x[0] for x in tc], "bruit": br,
                    "motif": "journal officiel : acte proche du sujet, à vérifier", "rubrique_texte": None, "statut": statut_t,
                    "sens_fort": False}
        return {"niveau": "ecarte", "essentiel": False, "a_verifier": False, "textes_cles": [x[0] for x in tc], "bruit": br,
                "motif": "journal officiel : texte sans lien avec la cyber, les données, l'IA ou la santé numérique",
                "rubrique_texte": None, "statut": statut_t, "sens_fort": False}
    if tc:
        # texte clé cité : jamais écarté ; mais un article « vie des entreprises » ou « événement »
        # qui cite le CRA en passant reste « pertinent » et n'entre pas dans L'essentiel
        niveau = "elevee" if (sig and s >= bas and not br_forts) else "moyenne"
        motif = "texte clé : " + ", ".join(x[0] for x in tc)
    elif hors_eu and not mondial and not officiel:
        niveau, motif = "ecarte", "sujet hors Europe sans portée mondiale"
    elif br and not officiel:
        niveau, motif = "ecarte", "hors sujet : " + ", ".join(br)
    elif br and not (sig_net and sujet_fort):
        # même venant d'une source officielle : alertes de vulnérabilités, événements, vœux, police… sont écartés
        niveau, motif = "ecarte", "source officielle, hors sujet : " + ", ".join(br)
    elif br:
        niveau, motif = "faible", "source officielle, sujet secondaire : " + ", ".join(br)
    elif sujet and sig_net and s >= haut:
        niveau = "elevee"
    elif officiel and sens_fort and (sig_net or sig_fort):
        niveau = "elevee"   # source officielle + signal réglementaire + sens très proche (sans mot attendu)
    elif sujet and s >= moy and (sig or officiel):
        niveau = "moyenne"
    elif officiel and (sujet or s >= moy):
        niveau = "faible"   # source officielle proche du sujet : gardée « à surveiller »
    elif officiel:
        niveau, motif = "ecarte", "source officielle, sans lien direct avec la cyber, les données ou la santé numérique"
    elif (sujet and s >= bas) or s >= moy:
        niveau = "faible"
    else:
        niveau, motif = "ecarte", ("note trop faible (%.2f), aucun texte clé" % s) if sujet else "aucun lien avec la cyber, les données, l'IA ou la santé"
    if mondial and niveau in ("faible", "ecarte") and not br:
        niveau, motif = "moyenne", "texte à portée mondiale"

    # L'essentiel : textes et normes importants, même en cas de doute (badge « à vérifier »)
    essentiel, a_verifier = False, False
    if niveau == "elevee":
        tier_a = [x for x in tc if x[2] == "A"]
        gdpr_fort = any(x[0].startswith("RGPD") for x in tc) and re.search(
            r"guideline|lignes directrices|leitlinie|omnibus|reform|amend|revision|new law|nouvelle loi|consultation", t, re.I)
        if tier_a or gdpr_fort:
            essentiel = True
            a_verifier = not officiel
        elif officiel and s >= haut and sig_fort and (sujet_fort or sens_fort):
            essentiel, a_verifier = True, True
        elif (nature == "cabinet" and s >= haut and sig_fort and (sujet_fort or sens_fort)
              and statut_t in ("projet", "adopte", "en_vigueur")):
            # cabinet d'avocats qui annonce un projet ou un texte adopté inconnu
            essentiel, a_verifier = True, True
        if br_forts or (br and not tier_a):
            essentiel = False
    rub = None
    if tc:
        rub = tc[0][1]
    return {"niveau": niveau, "essentiel": essentiel, "a_verifier": a_verifier, "sens_fort": sens_fort,
            "textes_cles": [x[0] for x in tc], "bruit": br, "motif": motif, "rubrique_texte": rub,
            "statut": statut_t}
