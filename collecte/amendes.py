"""
Cyber Watch — détection des montants d'amendes cités dans un article.

Cherche un montant (5 M€, 1,2 million d'euros, £14.47m, 6 MSEK, 50 millió Ft…)
à proximité d'un mot de sanction dans une des langues de la veille. Le montant
est converti en euros (taux approximatifs, pour trier et filtrer) ; le texte
d'origine est toujours conservé.
"""

import re

# Taux approximatifs (septembre 2026), uniquement pour comparer les montants
TAUX_EUR = {"EUR": 1, "GBP": 1.17, "CHF": 1.07, "SEK": 0.092, "NOK": 0.085, "DKK": 0.134,
            "PLN": 0.235, "CZK": 0.040, "HUF": 0.0026, "USD": 0.92}
KR_ZONE = {"Suède": "SEK", "Norvège": "NOK", "Danemark": "DKK"}

DEVISES = [
    (r"€|eur(?:os?)?\b|evro|ευρώ", "EUR"), (r"£|gbp\b|pounds?\b", "GBP"), (r"chf\b|francs? suisses?|franken", "CHF"),
    (r"sek\b", "SEK"), (r"nok\b", "NOK"), (r"dkk\b", "DKK"), (r"kr\b|kronor|kroner", "KR"),
    (r"pln\b|zł|złotych|zlotys?", "PLN"), (r"czk\b|kč|korun", "CZK"), (r"huf\b|ft\b|forint", "HUF"),
    (r"\$|usd\b|dollars?", "USD"),
]
RE_DEVISE = "|".join("(?:%s)" % d for d, _ in DEVISES)
MULT = r"(?:milliards?|billions?|bn|mrd\.?|mld|md|millions?|million|mio\.?|mln\.?|mill\.?|milj\.?|miljoen|miljoner|millioner|millió|milionů|milioni|miliony|milionów|millones|milhões|εκατ\.?|m\b|k\b|mille|thousand|tsd\.?|000)"
NOMBRE = r"\d{1,3}(?:[ .  ,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?"

RE_APRES = re.compile(r"(?<![\w.,])(%s)\s?(%s)?\s?(?:d['’]\s?|de\s|of\s)?(%s)" % (NOMBRE, MULT, RE_DEVISE), re.I)
RE_AVANT = re.compile(r"(%s)\s?(%s)\s?(%s)?(?![\w])" % (RE_DEVISE, NOMBRE, MULT), re.I)
# MSEK, MNOK, M€, M£, k€ collés
RE_COLLE = re.compile(r"(?<![\w.,])(%s)\s?(M|k|Md|Mrd)\s?(€|£|SEK|NOK|DKK|PLN|CHF|CZK|HUF|EUR|kr)(?![a-z])" % NOMBRE)

MOTS_SANCTION = re.compile(
    r"(amende|sanction|p[ée]nalit|condamn|fine[ds]?\b|fining|penalt|bu(ß|ss)geld|strafe|sanktion|boete|"
    r"multa|sanzion|sanción|coima|\bkar[aęyą]\b|grzywn|pokut|bírság|πρόστιμ|κυρώσ|sakko|seuraamusmaksu|"
    r"bøde|bot\b|sanktionsavgift|overtredelsesgebyr|tvangsmulkt|geldboete|dwangsom)", re.I)

# « jusqu'à 10 M€ » : montant maximal prévu par un texte, pas une amende prononcée
RE_PLAFOND = re.compile(r"(jusqu['’]\s?[àa]|up to|maximum|max\.|bis zu|hasta|fino a|até|tot (?:een maximum van )?|do wysokości|až do|legfeljebb|έως|enintään|op til|upp till|inntil)", re.I)


def _valeur(nombre, mult):
    n = nombre.replace(" ", " ").replace(" ", " ")
    if re.fullmatch(r"\d{1,3}(?:[ .,]\d{3})+", n):          # 1 200 000 / 1.200.000 / 1,200,000
        v = float(re.sub(r"[ .,]", "", n))
    elif re.fullmatch(r"\d{1,3}(?:[ .,]\d{3})+[.,]\d+", n):  # 1.200.000,50
        v = float(re.sub(r"[ .,]", "", n[:-3]) + "." + n[-2:]) if n[-3] in ".," else float(re.sub(r"\D", "", n))
    else:
        v = float(n.replace(",", ".").replace(" ", ""))
    m = (mult or "").lower().rstrip(".")
    if m in ("milliard", "milliards", "billion", "billions", "bn", "mrd", "mld", "md"):
        v *= 1e9
    elif m in ("k", "mille", "thousand", "tsd", "000"):
        v *= 1e3
    elif m:
        v *= 1e6
    return v


def _devise(txt, zone):
    for motif, code in DEVISES:
        if re.fullmatch(motif, txt.strip(), re.I):
            return KR_ZONE.get(zone, "SEK") if code == "KR" else code
    t = txt.strip().upper()
    if t in ("€",):
        return "EUR"
    if t == "£":
        return "GBP"
    if t == "KR":
        return KR_ZONE.get(zone, "SEK")
    return t if t in TAUX_EUR else "EUR"


def format_eur(v):
    if v >= 1e9:
        return ("%.1f Md€" % (v / 1e9)).replace(".0 ", " ").replace(".", ",")
    if v >= 1e6:
        return ("%.1f M€" % (v / 1e6)).replace(".0 ", " ").replace(".", ",")
    if v >= 1e3:
        return "%d k€" % round(v / 1e3)
    return "%d €" % round(v)


def detecter(texte, zone=""):
    """Retourne {"montant_eur": float, "texte": "…"} ou None."""
    if not texte or not MOTS_SANCTION.search(texte):
        return None
    candidats = []
    for rx, ordre in ((RE_APRES, "apres"), (RE_AVANT, "avant"), (RE_COLLE, "colle")):
        for m in rx.finditer(texte):
            debut, fin = m.span()
            contexte = texte[max(0, debut - 120):fin + 80]
            if not MOTS_SANCTION.search(contexte):
                continue
            try:
                if ordre == "apres":
                    nombre, mult, dev = m.group(1), m.group(2), m.group(3)
                elif ordre == "avant":
                    dev, nombre, mult = m.group(1), m.group(2), m.group(3)
                else:
                    nombre, mult, dev = m.group(1), m.group(2), m.group(3)
                    mult = {"M": "million", "k": "k", "Md": "milliard", "Mrd": "milliard"}[mult]
                v = _valeur(nombre, mult)
            except (ValueError, KeyError):
                continue
            code = _devise(dev, zone)
            eur = v * TAUX_EUR.get(code, 1)
            # on ignore les montants trop faibles pour être une amende d'entreprise
            # (prix, frais…) et les années prises pour des montants
            if eur < 1000 or (not mult and re.fullmatch(r"20\d\d", nombre)):
                continue
            brut = m.group(0).strip()
            candidats.append((eur, brut if code == "EUR" else "%s (≈ %s)" % (brut, format_eur(eur))))
    if not candidats:
        return None
    eur, txt = max(candidats)
    i = texte.find(txt.split(" (≈")[0])
    plafond = bool(RE_PLAFOND.search(texte[max(0, i - 40):i])) if i >= 0 else False
    return {"montant_eur": round(eur), "texte": txt, "plafond": plafond}
