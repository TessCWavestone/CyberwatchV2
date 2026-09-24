"""
Cyber Watch — traduction automatique gratuite (sans clé API, sans IA payante).

Moteur : Argos Translate (open source, tourne sur le serveur GitHub, hors ligne
une fois les modèles de langue téléchargés). Qualité correcte, pas parfaite :
le texte d'origine reste toujours disponible sur le site.

Garde-fous sur les acronymes :
  1. Chaque acronyme (NIS2, CRA, ISO 27001, ΓΚΠΔ, BSI…) est remplacé par un
     jeton neutre avant traduction, puis remis à l'identique après : le moteur
     ne peut ni le traduire, ni le déformer.
  2. Les acronymes nationaux d'un même texte européen sont harmonisés grâce au
     glossaire config/acronymes.json (ex. ΓΚΠΔ, DSGVO, RODO -> GDPR en anglais,
     RGPD en français). Pour un acronyme en alphabet non latin, l'original est
     conservé entre parenthèses : « GDPR (ΓΚΠΔ) ».

Toutes les traductions sont mises en cache (data/traductions.json) : un texte
n'est traduit qu'une seule fois.
"""

import hashlib
import json
import os
import re

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(RACINE, "data", "traductions.json")

# Langue par défaut d'une source, si la détection automatique échoue
LANGUE_ZONE = {
    "Allemagne": "de", "Autriche": "de", "Belgique": "fr", "Bulgarie": "en", "Danemark": "da",
    "Espagne": "es", "Europe": "en", "Finlande": "fi", "France": "fr", "Grèce": "el",
    "Hongrie": "hu", "Italie": "it", "Norvège": "nb", "Pays-Bas": "nl", "Pologne": "pl",
    "Portugal": "pt", "Rép. Tchèque": "cs", "Royaume-Uni": "en", "Suède": "sv",
    "Suisse": "fr", "Worldwide": "en",
}
LANGUES_CONNUES = set(LANGUE_ZONE.values()) | {"en"}

# Acronyme = mot de 2 caractères ou plus, en majuscules (latin, grec, accents),
# chiffres et tirets autorisés : NIS2, CRA, ISO/IEC, ΓΚΠΔ, NÚKIB, EU-CyCLONe…
MAJ = "A-ZÀ-ÖØ-ÞΑ-ΩΆ-Ώ"
RE_ACRONYME = re.compile(
    r"(?<![\w-])(?:ISO(?:/IEC)?\s?\d{4,5}(?:-\d+)?"
    r"|[%(m)s][%(m)s0-9/]{1,7}(?:\s?\d+)?(?:-[\w]+)*)(?![\w])" % {"m": MAJ})
RE_JETON = re.compile(r"Q\s?Z\s?X\s?(\d+)", re.I)
LATIN = re.compile(r"^[\x00-\x7FÀ-ÿĀ-ž\s\d\-/]+$")


class Traducteur:
    def __init__(self, cfg):
        conf = cfg.get("traduction", {})
        self.actif = conf.get("active", True)
        self.cibles = conf.get("cibles", ["en", "fr"])
        self.budget = conf.get("max_segments_par_collecte", 800)
        self.faits = 0
        self.erreur = ""
        self.cache = self._lire_cache()
        try:
            with open(os.path.join(RACINE, "config", "acronymes.json"), encoding="utf-8") as f:
                self.glossaire = {k: v for k, v in json.load(f).items() if not k.startswith("_")}
        except (OSError, ValueError):
            self.glossaire = {}
        self.moteur = None
        self.detecteur = None
        if self.actif:
            self._charger_moteur()

    # ------------------------------------------------------------------ outils

    def _lire_cache(self):
        try:
            with open(CACHE, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return {}

    def enregistrer(self):
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        # on ne garde que les 20 000 traductions les plus récentes
        if len(self.cache) > 20000:
            self.cache = dict(list(self.cache.items())[-20000:])
        with open(CACHE, "w", encoding="utf-8") as f:
            json.dump(self.cache, f, ensure_ascii=False)

    def _charger_moteur(self):
        try:
            import argostranslate.package  # noqa: F401
            import argostranslate.translate
            self.moteur = argostranslate
        except Exception as e:  # moteur absent : le site reste en langue d'origine
            self.erreur = "Moteur de traduction indisponible (%s)." % str(e)[:120]
            self.moteur = None
        try:
            from langdetect import DetectorFactory, detect
            DetectorFactory.seed = 0
            self.detecteur = detect
        except Exception:
            self.detecteur = None
        self._installes = set()

    def _paire(self, de, vers):
        """Installe à la demande le modèle de → vers (téléchargé une fois, puis en cache)."""
        cle = (de, vers)
        if cle in self._installes:
            return True
        pkg = self.moteur.package
        deja = {(p.from_code, p.to_code) for p in pkg.get_installed_packages()}
        if cle not in deja:
            if not getattr(self, "_index", False):
                pkg.update_package_index()
                self._index = True
            dispo = [p for p in pkg.get_available_packages() if p.from_code == de and p.to_code == vers]
            if not dispo:
                return False
            pkg.install_from_path(dispo[0].download())
        self._installes.add(cle)
        return True

    def langue(self, texte, zone):
        defaut = LANGUE_ZONE.get(zone, "en")
        if self.detecteur and texte and len(texte) > 25:
            try:
                code = self.detecteur(texte)
                code = {"no": "nb", "nn": "nb"}.get(code, code)
                if code in LANGUES_CONNUES:
                    return code
            except Exception:
                pass
        return defaut

    # ------------------------------------------------------------ acronymes

    def _proteger(self, texte):
        trouves = []
        lettres = [c for c in texte if c.isalpha()]
        # Titre écrit tout en majuscules (fréquent dans la presse grecque) : on ne
        # protège alors que les acronymes connus ou contenant un chiffre.
        tout_maj = len(lettres) > 20 and sum(c.isupper() for c in lettres) / len(lettres) > 0.8

        def rempl(m):
            mot = m.group(0)
            if tout_maj and mot not in self.glossaire and not re.search(r"\d", mot):
                return mot
            trouves.append(mot)
            return "QZX%d" % (len(trouves) - 1)
        return RE_ACRONYME.sub(rempl, texte), trouves

    def _restaurer(self, texte, trouves, source, cible):
        def rempl(m):
            i = int(m.group(1))
            if i >= len(trouves):
                return m.group(0)
            acro = trouves[i]
            regle = self.glossaire.get(acro)
            if regle and source in regle.get("langues", [source]) and regle.get(cible) and regle[cible] != acro:
                cible_acro = regle[cible]
                return cible_acro if LATIN.match(acro) else "%s (%s)" % (cible_acro, acro)
            return acro
        return RE_JETON.sub(rempl, texte)

    # ------------------------------------------------------------ traduction

    def _brut(self, texte, de, vers):
        if de == vers:
            return texte
        if de != "en" and vers != "en":  # pivot par l'anglais
            return self._brut(self._brut(texte, de, "en"), "en", vers)
        if not self._paire(de, vers):
            raise LookupError("pas de modèle %s→%s" % (de, vers))
        return self.moteur.translate.translate(texte, de, vers)

    def traduire(self, texte, de, vers):
        """Retourne la traduction, ou None si elle n'est pas (encore) disponible."""
        if not texte or de == vers:
            return texte
        cle = hashlib.sha1(("%s|%s|%s" % (de, vers, texte)).encode("utf-8")).hexdigest()[:16]
        if cle in self.cache:
            return self.cache[cle]
        if not self.moteur or self.faits >= self.budget:
            return None
        try:
            protege, trouves = self._proteger(texte)
            sortie = self._restaurer(self._brut(protege, de, vers), trouves, de, vers)
        except Exception as e:
            self.erreur = "Traduction %s→%s impossible : %s" % (de, vers, str(e)[:100])
            return None
        self.faits += 1
        self.cache[cle] = sortie
        return sortie

    def traduire_article(self, a):
        """Complète a['langue'] et a['trad'] = {cible: {titre, resume}}."""
        if not self.actif:
            return
        de = a.get("langue") or self.langue(a["titre"] + " " + a.get("resume", ""), a.get("zone", ""))
        a["langue"] = de
        trad = a.get("trad") or {}
        for cible in self.cibles:
            if cible == de or (cible in trad and trad[cible].get("titre")):
                continue
            titre = self.traduire(a["titre"], de, cible)
            resume = self.traduire(a.get("resume", ""), de, cible) if a.get("resume") else ""
            if titre is not None and resume is not None:
                trad[cible] = {"titre": titre, "resume": resume}
        if trad:
            a["trad"] = trad


# --------------------------------------------------------------- registre des acronymes

MOTS_MAJ_COURANTS = {"THE", "AND", "FOR", "NEW", "DE", "LA", "LE", "LES", "ET", "DES", "DU", "EN", "UN", "UNE",
                     "DER", "DIE", "DAS", "UND", "EL", "LOS", "DEL", "IL", "DI", "OF", "TO", "IN", "ON", "AT",
                     "ΚΑΙ", "ΓΙΑ", "ΤΗΝ", "ΤΟΝ", "ΤΗΣ", "ΤΟΥ", "ΣΤΗΝ", "ΣΤΟ", "UPDATE", "NEWS", "PDF"}


def normaliser_acronyme(a):
    """« NIS 2 », « NIS-2 » -> « NIS2 » ; « ISO/IEC 27001 » -> « ISO/IEC 27001 »."""
    a = a.strip()
    if a.upper().startswith("ISO"):
        return re.sub(r"\s+", " ", a)
    return re.sub(r"^([^\d\s-]+)[\s-]+(\d{1,2})$", r"\1\2", a)   # seulement « NIS 2 », pas « MDCG 2019-16 »


def extraire_acronymes(texte, glossaire):
    """Acronymes d'un texte, sous leur forme canonique (équivalent anglais du glossaire s'il existe)."""
    if not texte:
        return []
    lettres = [c for c in texte if c.isalpha()]
    tout_maj = len(lettres) > 12 and sum(c.isupper() for c in lettres) / len(lettres) > 0.8
    vus = []
    for m in RE_ACRONYME.finditer(texte):
        brut = normaliser_acronyme(m.group(0))
        if "-" in brut and not brut.split("-")[0].isupper():
            continue
        # « NIS2-Umsetzung » -> « NIS2 » (acronyme + mot ordinaire), sauf entrée du glossaire
        if "-" in brut and brut not in glossaire and re.match(r"^[^\W\d_][^\W\d_A-Z]+$", brut.split("-", 1)[1]):
            brut = brut.split("-", 1)[0]
        if brut.upper() in MOTS_MAJ_COURANTS or re.match(r"^[IVXLC]+$", brut):  # mots courants, chiffres romains
            continue
        if tout_maj and brut not in glossaire and not re.search(r"\d", brut):
            continue
        regle = glossaire.get(brut)
        code = (regle or {}).get("en") or brut
        if (code, brut) not in vus:
            vus.append((code, brut))
    return vus


def registre_acronymes(articles, glossaire, precedent, aujourdhui):
    """Met à jour la liste de tous les acronymes rencontrés (avec date de première apparition)."""
    reg = {a["code"]: a for a in (precedent or {}).get("acronymes", [])}
    compte = {}
    for art in articles:
        for code, brut in extraire_acronymes(art.get("titre", "") + " " + art.get("resume", ""), glossaire):
            e = reg.setdefault(code, {"code": code, "variantes": [], "langues": [], "premier_vu": aujourdhui,
                                      "exemple": art.get("titre", ""), "lien_exemple": art.get("lien", "")})
            if brut not in e["variantes"]:
                e["variantes"].append(brut)
            if art.get("langue") and art["langue"] not in e["langues"]:
                e["langues"].append(art["langue"])
            compte[code] = compte.get(code, 0) + 1
    for code, e in reg.items():
        e["nb_articles"] = compte.get(code, 0)
        e["dans_glossaire"] = code in glossaire or any(v in glossaire for v in e["variantes"])
        e["fr"] = (glossaire.get(code) or {}).get("fr") or next(
            ((glossaire.get(v) or {}).get("fr") for v in e["variantes"] if (glossaire.get(v) or {}).get("fr")), code)
    return sorted(reg.values(), key=lambda e: (-e["nb_articles"], e["code"]))
