"""
Cyber Watch — export PDF de la veille complète (français et anglais).

Généré à chaque collecte par le serveur GitHub (bibliothèque libre ReportLab),
publié avec le site : data/cyberwatch_veille_fr.pdf et data/cyberwatch_veille_en.pdf.
Le bouton « La veille complète (PDF) » du site télécharge directement ce fichier.

Contenu : L'essentiel (textes et normes importants, regroupés par texte),
puis les articles « très pertinent » et « pertinent » des 60 derniers jours,
par rubrique. Chaque titre est un lien cliquable vers l'article.
"""

import datetime as dt
import os
from xml.sax.saxutils import escape

POLICES = ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf",
           "/usr/share/fonts/TTF/DejaVuSans.ttf", "/Library/Fonts/DejaVuSans.ttf", "C:/Windows/Fonts/DejaVuSans.ttf"]

L = {
    "fr": {"titre": "Veille réglementaire cyber, données, IA et santé numérique", "maj": "Mise à jour du",
           "essentiel": "L'essentiel — textes et normes importants", "veille": "Veille — articles pertinents des 60 derniers jours",
           "autres_textes": "Autres textes officiels", "elevee": "Très pertinent", "moyenne": "Pertinent",
           "verifier": "à vérifier", "sources": "sources", "aucun": "Aucun élément.", "page": "Page",
           "intro": "%d articles dans L'essentiel, %d articles pertinents sur 60 jours. Liste complète, filtres et "
                    "archives sur le site. Document généré automatiquement ; les titres sont des liens vers les articles.",
           "echeance": "Échéance", "payant": "Payant"},
    "en": {"titre": "Cyber, data, AI and digital health regulatory watch", "maj": "Updated on",
           "essentiel": "Key points — important texts and standards", "veille": "Watch — relevant articles from the last 60 days",
           "autres_textes": "Other official texts", "elevee": "Highly relevant", "moyenne": "Relevant",
           "verifier": "to be checked", "sources": "sources", "aucun": "Nothing.", "page": "Page",
           "intro": "%d articles in Key points, %d relevant articles over 60 days. Full list, filters and archives on "
                    "the website. Automatically generated document; titles link to the articles.",
           "echeance": "Deadline", "payant": "Paywall"},
}


def _police():
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    candidats = list(POLICES)
    try:
        import matplotlib
        candidats.append(os.path.join(os.path.dirname(matplotlib.__file__), "mpl-data", "fonts", "ttf", "DejaVuSans.ttf"))
    except Exception:
        pass
    for c in candidats:
        if os.path.exists(c):
            gras = c.replace("DejaVuSans.ttf", "DejaVuSans-Bold.ttf")
            pdfmetrics.registerFont(TTFont("CW", c))
            pdfmetrics.registerFont(TTFont("CW-B", gras if os.path.exists(gras) else c))
            return "CW", "CW-B", True
    return "Helvetica", "Helvetica-Bold", False


def _txt(a, cle, lang):
    if lang != (a.get("langue") or "fr"):
        tr = (a.get("trad") or {}).get(lang) or {}
        if tr.get(cle):
            return tr[cle]
    return a.get(cle) or ""


def generer(articles, meta, referentiel, dossier, jours=60):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, KeepTogether

    normale, grasse, unicode_ok = _police()
    limite = (dt.date.today() - dt.timedelta(days=jours)).isoformat()
    recents = [a for a in articles if not a.get("base") and a["date"] >= limite]
    essentiels = [a for a in recents if a.get("essentiel")]
    pertinents = [a for a in recents if a.get("pertinence") in ("elevee", "moyenne")]
    rubriques = {r["id"]: r for r in meta.get("rubriques", [])}

    def propre(s):
        s = escape(s or "")
        return s if unicode_ok else s.encode("latin-1", "replace").decode("latin-1")

    for lang in ("fr", "en"):
        t = L[lang]
        st = {
            "h0": ParagraphStyle("h0", fontName=grasse, fontSize=18, leading=22, textColor=colors.HexColor("#1d2b4f"), spaceAfter=4),
            "sur": ParagraphStyle("sur", fontName=normale, fontSize=9, textColor=colors.HexColor("#6b3fa0"), spaceAfter=2),
            "intro": ParagraphStyle("intro", fontName=normale, fontSize=9, leading=12, textColor=colors.HexColor("#444444"), spaceAfter=10),
            "h1": ParagraphStyle("h1", fontName=grasse, fontSize=13, leading=16, textColor=colors.HexColor("#1d2b4f"),
                                 spaceBefore=12, spaceAfter=6),
            "h2": ParagraphStyle("h2", fontName=grasse, fontSize=10.5, leading=13, textColor=colors.HexColor("#6b3fa0"),
                                 spaceBefore=8, spaceAfter=3),
            "art": ParagraphStyle("art", fontName=grasse, fontSize=9.5, leading=12, spaceAfter=1),
            "meta": ParagraphStyle("meta", fontName=normale, fontSize=7.5, leading=9.5, textColor=colors.HexColor("#666666")),
            "res": ParagraphStyle("res", fontName=normale, fontSize=8.5, leading=11, spaceAfter=6),
        }

        def bloc(a):
            titre = propre(_txt(a, "titre", lang))
            lien = escape(a.get("lien", ""))
            niveau = t.get(a.get("pertinence"), "")
            infos = [a["date"], propre(a.get("source", "")), propre(a.get("zone", "")), niveau]
            if a.get("publication"):
                infos.insert(2, propre(a["publication"]))
            if a.get("a_verifier") and a.get("essentiel"):
                infos.append(t["verifier"])
            if a.get("payant"):
                infos.append(t["payant"])
            for e in (a.get("echeances") or [])[:1]:
                infos.append("%s : %s" % (t["echeance"], e["date"]))
            elems = [Paragraph('<link href="%s" color="#1d2b4f">%s</link>' % (lien, titre), st["art"]),
                     Paragraph(" · ".join(x for x in infos if x), st["meta"])]
            resume = "" if a.get("reserve") else _txt(a, "resume", lang)
            if resume:
                elems.append(Paragraph(propre(resume[:420]), st["res"]))
            else:
                elems.append(Spacer(1, 5))
            return KeepTogether(elems)

        chemin = os.path.join(dossier, "cyberwatch_veille_%s.pdf" % lang)
        doc = SimpleDocTemplate(chemin, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=16 * mm,
                                bottomMargin=16 * mm, title="Cyber Watch — " + t["titre"], author="Wavestone")
        date_maj = meta.get("mise_a_jour", "")[:10]
        histoire = [Paragraph(propre(meta.get("surtitre_en" if lang == "en" else "surtitre") or meta.get("surtitre", "")), st["sur"]),
                    Paragraph("Cyber Watch — " + propre(t["titre"]), st["h0"]),
                    Paragraph("%s %s. %s" % (t["maj"], date_maj, t["intro"] % (len(essentiels), len(pertinents))), st["intro"]),
                    Paragraph(t["essentiel"], st["h1"])]
        groupes = {}
        for a in essentiels:
            groupes.setdefault((a.get("textes_cles") or [t["autres_textes"]])[0], []).append(a)
        if not groupes:
            histoire.append(Paragraph(t["aucun"], st["res"]))
        for nom, arts in sorted(groupes.items(), key=lambda x: (-len(x[1]), x[0])):
            histoire.append(Paragraph("%s — %d %s" % (propre(nom), len(arts), t["sources"]), st["h2"]))
            histoire += [bloc(a) for a in sorted(arts, key=lambda a: a["date"], reverse=True)]
        histoire.append(Paragraph(t["veille"], st["h1"]))
        for rid, r in rubriques.items():
            arts = [a for a in pertinents if a.get("rubrique") == rid and not a.get("essentiel")]
            if not arts:
                continue
            histoire.append(Paragraph(propre(r.get("titre_en") if lang == "en" and r.get("titre_en") else r.get("titre", rid)), st["h2"]))
            arts.sort(key=lambda a: (a.get("pertinence") != "elevee", a["date"]), reverse=False)
            arts.sort(key=lambda a: a["date"], reverse=True)
            histoire += [bloc(a) for a in arts]

        def pied(canvas, doc_):
            canvas.saveState()
            canvas.setFont(normale, 7)
            canvas.setFillColor(colors.HexColor("#888888"))
            canvas.drawString(16 * mm, 9 * mm, "Cyber Watch — Wavestone — %s" % date_maj)
            canvas.drawRightString(A4[0] - 16 * mm, 9 * mm, "%s %d" % (t["page"], doc_.page))
            canvas.restoreState()

        doc.build(histoire, onFirstPage=pied, onLaterPages=pied)
        print("Export PDF : %s (%d Ko)" % (os.path.basename(chemin), os.path.getsize(chemin) // 1024))
