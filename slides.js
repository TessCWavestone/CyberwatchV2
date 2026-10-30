/* Cyber Watch — génération d'un support de slides (.pptx modifiable) dans le navigateur.
   Gratuit, sans IA ni serveur : bibliothèque libre PptxGenJS (licence MIT, vendor/pptxgen.bundle.js).
   Décisions du 30/10/2026 :
   - généré seulement au clic, pour la période choisie ; slides en anglais ; modèle « Wavestone-like » ;
   - articles « très pertinent », « pertinent » et « à surveiller » (bandeau « To verify ») ; jamais un article
     jugé « pas pertinent » par un lecteur ;
   - regroupement par texte + pays + étape ; rien n'est coupé : slides « (continued) » si nécessaire ;
   - les filtres du site sont ignorés ; ordre logique (pertinence, puis pays) ; aucune mention particulière ;
   - brouillon : les encadrés d'analyse restent « To complete ».
   Point d'entrée : CW_SLIDES.construire(PptxGenJS, images, donnees) -> objet pptx (pptx.writeFile(...)). */
(function (racine) {
  'use strict';

  var C = { violet: '451DC7', deep: '250F6B', green: '04F06A', lgreen: 'CAFEE0', grey: 'F6F6F6',
            line: 'D9D4F2', ink: '000000', sub: '3A3A3A', amber: 'FFCA4A', amberSoft: 'FFF4D6', white: 'FFFFFF' };
  var F = 'Aptos', FH = 'Aptos SemiBold';
  var REL = { elevee: { rang: 0, label: 'Very relevant', fill: C.violet, txt: C.white },
              moyenne: { rang: 1, label: 'Relevant', fill: C.lgreen, txt: C.ink },
              faible: { rang: 2, label: 'To monitor', fill: C.amber, txt: C.ink } };
  var ETAPES = { adopte: 'Adopted', en_vigueur: 'In force', projet: 'Draft / proposal', consultation: 'Consultation',
                 lignes_directrices: 'Guidance', autre: 'Update', '': 'Update' };
  var MOIS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MOIS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function dateCourte(iso) {
    if (!iso || iso.length < 10) return iso || '';
    return +iso.slice(8, 10) + ' ' + MOIS[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4);
  }
  function dateLongue(iso) {
    if (!iso || iso.length < 10) return iso || '';
    return +iso.slice(8, 10) + ' ' + MOIS_LONG[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4);
  }
  function titreEn(a) {
    if (a.langue === 'en') return a.titre || '';
    var tr = (a.trad || {}).en; return (tr && tr.titre) || a.titre || '';
  }
  function resumeEn(a) {
    if (a.langue === 'en') return a.resume || '';
    var tr = (a.trad || {}).en; return (tr && tr.resume) || '';
  }
  function couper(s, n) { s = (s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; }
  function par(liste, n) { var r = []; for (var i = 0; i < liste.length; i += n) r.push(liste.slice(i, i + n)); return r.length ? r : [[]]; }

  /* ------------------------------------------------------------------ préparation des données */
  function preparer(D) {
    var exclus = D.exclus || {};
    var arts = (D.articles || []).filter(function (a) {
      return a.date >= D.du && a.date <= D.au && REL[a.pertinence] && a.nature !== 'opinion' && !a.doublon_de &&
             a.avis_lecteur !== 'pas_pertinent' && !exclus[a.id];
    });
    var groupes = {};
    arts.forEach(function (a) {
      var texte = (a.textes_cles || [])[0] || '';
      var etape = a.statut || '';
      var cle = texte ? [texte, a.zone || '', etape].join('|') : 'art|' + a.id;
      var g = groupes[cle] || (groupes[cle] = { texte: texte, zone: a.zone || '', etape: etape, articles: [] });
      g.articles.push(a);
    });
    var liste = Object.keys(groupes).map(function (k) {
      var g = groupes[k];
      // article de tête : le plus pertinent, une source officielle de préférence, puis le plus récent
      g.articles.sort(function (x, y) {
        return (REL[x.pertinence].rang - REL[y.pertinence].rang) || ((y.nature === 'officielle') - (x.nature === 'officielle')) || (x.date < y.date ? 1 : -1);
      });
      g.rel = g.articles[0].pertinence;
      g.verifier = g.rel === 'faible' || g.articles.some(function (a) { return a.a_verifier; });
      g.titre = titreEn(g.articles[0]);
      g.texteEn = g.texte ? D.texteEn(g.texte) : '';
      g.zoneEn = D.zoneEn(g.zone);
      g.etapeEn = ETAPES[g.etape] || 'Update';
      // dates : uniquement les dates réglementaires (pas de consultation : déjà filtrées à la collecte)
      var vues = {}; g.dates = [];
      g.articles.forEach(function (a) {
        (a.echeances || []).forEach(function (e) {
          if (vues[e.date]) return; vues[e.date] = 1;
          var ex = (e.extrait || {}).en || '';
          g.dates.push({ date: e.date, approx: e.approx, publication: e.publication, texte: ex });
        });
      });
      (D.ref || []).forEach(function (r) {
        var v = r.applicable_depuis || '';
        if (!g.texte || !/^\d{4}-\d{2}-\d{2}$/.test(v) || vues[v] || v < D.du) return;   // pas les dates déjà passées
        if ((r.acronyme === g.texte || r.nom === g.texte) && (r.zone === g.zone || !g.zone)) {
          vues[v] = 1; g.dates.push({ date: v, ref: true, texte: 'Applicable from this date (' + (r.nom_en || r.nom || g.texteEn) + ')' });
        }
      });
      g.dates.sort(function (x, y) { return x.date < y.date ? -1 : 1; });
      var acteurs = [];
      g.articles.forEach(function (a) { ((a.concernes || {}).acteurs || []).forEach(function (x) { if (acteurs.indexOf(x) < 0) acteurs.push(x); }); });
      g.acteurs = acteurs.map(D.acteurEn).filter(Boolean);
      return g;
    });
    liste.sort(function (x, y) {
      return (REL[x.rel].rang - REL[y.rel].rang) || x.zoneEn.localeCompare(y.zoneEn) || (x.texteEn || x.titre).localeCompare(y.texteEn || y.titre);
    });
    return { articles: arts, groupes: liste };
  }

  /* ------------------------------------------------------------------ construction */
  function construire(PptxGenJS, IMG, D) {
    var P = preparer(D);
    var pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';          // 13,333 x 7,5 pouces
    pptx.title = 'Cyber regulatory watch';
    pptx.company = 'Wavestone';
    pptx.author = 'Wavestone';
    pptx.theme = { headFontFace: FH, bodyFontFace: F };
    pptx.defineSlideMaster({
      title: 'CONTENT', background: { color: C.white },
      objects: [{ image: { data: IMG.logo_violet, x: 11.55, y: 7.12, w: 0.9, h: 0.123 } }],
      slideNumber: { x: 12.5, y: 7.04, w: 0.5, h: 0.28, fontFace: F, fontSize: 8, color: C.violet }
    });
    var S = pptx.ShapeType;

    function titre(s, texte, kicker) {
      if (kicker) s.addText(kicker.toUpperCase(), { x: 0.5, y: 0.22, w: 10.7, h: 0.3, fontFace: F, fontSize: 10, color: C.violet, bold: true, charSpacing: 1, margin: 0 });
      var n = (texte || '').length, taille = n > 160 ? 16 : (n > 110 ? 18 : (n > 75 ? 21 : 24));
      s.addText(texte, { x: 0.5, y: kicker ? 0.5 : 0.35, w: kicker ? 10.7 : 12.3, h: 0.95, fontFace: F, fontSize: taille, color: C.violet, valign: 'top', margin: 0, fit: 'shrink' });
    }
    function enTeteBloc(s, x, y, w, libelle) {
      s.addShape(S.ellipse, { x: x, y: y + 0.07, w: 0.17, h: 0.17, line: { color: C.violet, width: 0.75 }, fill: { color: C.white } });
      s.addText('→', { x: x, y: y + 0.035, w: 0.17, h: 0.22, fontSize: 8, color: C.violet, align: 'center', valign: 'middle', margin: 0 });
      s.addText(libelle, { x: x + 0.25, y: y, w: w - 0.25, h: 0.3, fontFace: F, fontSize: 14, color: C.violet, margin: 0, valign: 'middle' });
      s.addShape(S.line, { x: x, y: y + 0.36, w: w, h: 0, line: { color: C.violet, width: 0.75 } });
    }
    function blocGris(s, x, y, w, h, libelle, corps, taille) {
      s.addShape(S.roundRect, { x: x, y: y, w: w, h: h, rectRadius: 0.06, fill: { color: C.grey }, line: { color: C.grey } });
      enTeteBloc(s, x + 0.2, y + 0.18, w - 0.4, libelle);
      s.addText(corps, { x: x + 0.2, y: y + 0.65, w: w - 0.4, h: h - 0.8, fontFace: F, fontSize: taille || 13, color: C.ink, valign: 'top', margin: 0, paraSpaceAfter: 4, fit: 'shrink' });
    }
    function pastille(s, x, y, rel, w) {
      var r = REL[rel]; w = w || 1.45;
      s.addShape(S.roundRect, { x: x, y: y, w: w, h: 0.3, rectRadius: 0.15, fill: { color: r.fill }, line: { color: r.fill } });
      s.addText(r.label, { x: x, y: y, w: w, h: 0.3, fontFace: F, fontSize: 11, bold: true, color: r.txt, align: 'center', valign: 'middle', margin: 0 });
    }
    function bandeauVerifier(s, y) {
      s.addShape(S.rect, { x: 0.5, y: y, w: 12.33, h: 0.42, fill: { color: C.amberSoft }, line: { color: C.amber, width: 1 } });
      s.addShape(S.rect, { x: 0.5, y: y, w: 0.12, h: 0.42, fill: { color: C.amber }, line: { color: C.amber } });
      s.addText([{ text: 'To verify: ', options: { bold: true } },
                 { text: 'information and relevance were selected automatically. Check the source articles before reuse.' }],
        { x: 0.75, y: y, w: 12, h: 0.42, fontFace: F, fontSize: 12, color: C.ink, valign: 'middle', margin: 0 });
    }
    function lignesSources(arts) {
      return arts.map(function (a) {
        var t = couper(titreEn(a), 150) + ' – ' + (a.source || '') + ', ' + dateCourte(a.date);
        return { text: t, options: a.lien ? { hyperlink: { url: a.lien }, color: C.violet, breakLine: true } : { color: C.ink, breakLine: true } };
      });
    }
    function sources(s, y, arts, libelle) {
      s.addText(libelle, { x: 0.5, y: y, w: 4, h: 0.28, fontFace: F, fontSize: 12, bold: true, color: C.violet, margin: 0 });
      s.addText(lignesSources(arts), { x: 0.5, y: y + 0.3, w: 12.3, h: 6.8 - y - 0.3, fontFace: F, fontSize: 12, valign: 'top', margin: 0, underline: { style: 'sng' }, paraSpaceAfter: 2 });
    }
    function tableau(s, entete, lignes, colW, y, taille) {
      var hdr = entete.map(function (t) { return { text: t, options: { bold: true, color: C.white, fill: { color: C.violet }, fontSize: (taille || 12) + 1 } }; });
      var corps = lignes.map(function (l, i) {
        return l.map(function (c) {
          var o = typeof c === 'object' ? c : { text: String(c) };
          return { text: o.text, options: Object.assign({ fill: { color: i % 2 ? C.white : C.grey }, color: C.ink }, o.options || {}) };
        });
      });
      s.addTable([hdr].concat(corps), { x: 0.5, y: y || 1.55, w: 12.33, colW: colW, fontFace: F, fontSize: taille || 12, valign: 'middle',
        border: { type: 'solid', pt: 1.5, color: C.white }, margin: [0.04, 0.1, 0.04, 0.1], autoPage: false });
    }
    function contenu() { return pptx.addSlide({ masterName: 'CONTENT' }); }
    function suite(t, i) { return i ? t + ' (continued)' : t; }

    var periode = dateLongue(D.du) + ' to ' + dateLongue(D.au);

    /* 1. Couverture */
    var s = pptx.addSlide();
    s.background = { data: IMG.cover };
    s.addText('CYBER REGULATORY WATCH', { x: 0.6, y: 1.5, w: 9, h: 0.35, fontFace: F, fontSize: 12, bold: true, color: C.green, charSpacing: 2, margin: 0 });
    s.addText('Regulatory developments', { x: 0.6, y: 1.9, w: 10, h: 0.8, fontFace: F, fontSize: 40, color: C.white, valign: 'top', margin: 0 });
    s.addText('Period covered: ' + periode + '  |  Generated on ' + dateLongue(D.genere), { x: 0.6, y: 2.9, w: 11, h: 0.35, fontFace: F, fontSize: 14, color: C.white, margin: 0 });
    s.addImage({ data: IMG.logo_white, x: 0.6, y: 6.6, w: 1.9, h: 0.26 });

    var G = P.groupes;
    if (!G.length) {
      s = contenu();
      titre(s, 'No relevant development over the period', 'Overview');
      s.addText('No article rated very relevant, relevant or to monitor was found between ' + periode + '.', { x: 0.5, y: 1.7, w: 12, h: 0.5, fontFace: F, fontSize: 16, color: C.ink, margin: 0 });
    } else {
      /* 2. Synthèse */
      var pays = {}, nbDates = 0, rels = { elevee: 0, moyenne: 0, faible: 0 };
      G.forEach(function (g) { pays[g.zone] = 1; rels[g.rel]++; nbDates += g.dates.filter(function (d) { return !d.publication && !d.approx; }).length; });
      s = contenu();
      titre(s, G.length + (G.length > 1 ? ' subjects identified' : ' subject identified') + ' over the period', 'Overview');
      s.addImage({ data: IMG.panel, x: 0, y: 1.55, w: 4.6, h: 5.95 });
      s.addText('Key messages', { x: 0.5, y: 1.95, w: 3.7, h: 0.4, fontFace: F, fontSize: 18, color: C.green, margin: 0 });
      s.addText([1, 2, 3].map(function (i) { return { text: 'Message ' + i + ' – to complete', options: { bullet: true, breakLine: i < 3 } }; }),
        { x: 0.5, y: 2.5, w: 3.7, h: 3, fontFace: F, fontSize: 16, color: C.white, valign: 'top', margin: 0, paraSpaceAfter: 10 });
      [[G.length, 'Subjects', 'from ' + P.articles.length + ' source article' + (P.articles.length > 1 ? 's' : '')],
       [Object.keys(pays).length, 'Countries', 'EU level included'],
       [nbDates, 'Regulatory dates', 'cited in the sources']].forEach(function (f, i) {
        var x = 5.2 + i * 2.6;
        s.addText(f[1], { x: x, y: 2.0, w: 2.4, h: 0.3, fontFace: F, fontSize: 14, color: C.violet, margin: 0 });
        s.addText(String(f[0]), { x: x, y: 2.35, w: 2.4, h: 0.9, fontFace: F, fontSize: 48, color: C.violet, margin: 0 });
        s.addText(f[2], { x: x, y: 3.25, w: 2.4, h: 0.3, fontFace: F, fontSize: 12, color: C.sub, margin: 0 });
      });
      s.addShape(S.line, { x: 5.2, y: 4.1, w: 7.6, h: 0, line: { color: C.line, width: 0.75 } });
      s.addText('Breakdown by relevance', { x: 5.2, y: 4.3, w: 7, h: 0.3, fontFace: F, fontSize: 14, color: C.violet, margin: 0 });
      ['elevee', 'moyenne', 'faible'].forEach(function (r, i) {
        pastille(s, 5.2 + i * 2.6, 4.8, r);
        s.addText(rels[r] + (rels[r] > 1 ? ' subjects' : ' subject'), { x: 5.2 + i * 2.6, y: 5.15, w: 2.4, h: 0.3, fontFace: F, fontSize: 13, color: C.ink, margin: 0 });
      });

      /* 3. Points clés de la période (tableau) */
      par(G, 8).forEach(function (bloc, i) {
        s = contenu();
        titre(s, suite('Key points of the period', i), 'Overview');
        tableau(s, ['Subject', 'Country', 'Step', 'Key regulatory date', 'Relevance'], bloc.map(function (g) {
          var d = g.dates.filter(function (x) { return !x.publication; })[0];
          return [g.texteEn ? g.texteEn + ' — ' + couper(g.titre, 90) : couper(g.titre, 120), g.zoneEn, g.etapeEn, d ? dateCourte(d.date) : 'Not stated',
                  { text: '● ' + REL[g.rel].label, options: { bold: true, color: g.rel === 'faible' ? 'B07A00' : C.violet } }];
        }), [5.0, 1.9, 1.6, 1.9, 1.93], 1.55, 12);
        if (i === 0) s.addText('Sorted by relevance, then by country. Subjects marked “To monitor” carry a “To verify” banner on their own slide.',
          { x: 0.5, y: 6.65, w: 12, h: 0.3, fontFace: F, fontSize: 12, color: C.sub, margin: 0 });
      });

      /* 4. Une slide par sujet (+ slides « continued ») */
      G.forEach(function (g) {
        var kicker = [g.texteEn || 'Other subject', g.zoneEn, g.etapeEn].join('  |  ');
        var lead = g.articles[0], resume = couper(resumeEn(lead), 320);
        var faits = (resume ? [resume] : []).concat(g.articles.slice(resume ? 1 : 0).map(function (a) { return titreEn(a); }));
        var faits1 = faits.slice(0, 4), faitsSuite = faits.slice(4);
        var sources1 = g.articles.slice(0, 3), sourcesSuite = g.articles.slice(3);
        s = contenu();
        titre(s, g.titre, kicker);
        pastille(s, 11.38, 0.2, g.rel);
        var y = 1.55;
        if (g.verifier) { bandeauVerifier(s, y); y += 0.6; }
        var h = g.verifier ? 3.25 : 3.5;
        blocGris(s, 0.5, y, 4.0, h, 'What happened', faits1.map(function (t, i) { return { text: couper(t, 330), options: { bullet: true, breakLine: i < faits1.length - 1 } }; }), 12);
        var dates = g.dates.length ? g.dates.slice(0, 3).map(function (d, i, l) {
          return { text: (d.approx ? 'Around ' : '') + dateCourte(d.date) + (d.publication ? ' (publication of the text)' : '') + (d.texte ? ': ' + couper(d.texte, 70) : ''), options: { breakLine: i < l.length - 1 } };
        }) : 'No regulatory date stated in the sources';
        blocGris(s, 4.67, y, 4.0, h * 0.5, 'Key dates', dates, 12);
        blocGris(s, 4.67, y + h * 0.5 + 0.15, 4.0, h * 0.5 - 0.15, 'Who is concerned', g.acteurs.length ? g.acteurs.join(', ') : 'To complete', 12);
        s.addShape(S.roundRect, { x: 8.83, y: y, w: 4.0, h: h, rectRadius: 0.06, fill: { color: C.white }, line: { color: C.violet, width: 1, dashType: 'dash' } });
        s.addText('Impact for the company', { x: 9.03, y: y + 0.18, w: 3.6, h: 0.3, fontFace: F, fontSize: 14, color: C.violet, margin: 0 });
        s.addText('To complete', { x: 9.03, y: y + 0.5, w: 3.6, h: 0.9, fontFace: F, fontSize: 13, italic: true, color: C.sub, margin: 0, valign: 'top' });
        s.addText('Recommended actions', { x: 9.03, y: y + h / 2 + 0.05, w: 3.6, h: 0.3, fontFace: F, fontSize: 14, color: C.violet, margin: 0 });
        s.addText('To complete', { x: 9.03, y: y + h / 2 + 0.37, w: 3.6, h: 0.9, fontFace: F, fontSize: 13, italic: true, color: C.sub, margin: 0, valign: 'top' });
        sources(s, y + h + 0.25, sources1, 'Sources');
        // « continued » : faits, dates et sources restants, jamais coupés
        // slides « continued » : d'abord les faits et dates restants (avec 5 sources au plus), puis les sources seules
        var datesSuite = g.dates.slice(3);
        var nHaut = Math.max(Math.ceil(faitsSuite.length / 6), Math.ceil(datesSuite.length / 8));
        var pages = [];
        for (var k = 0; k < nHaut; k++) pages.push({ fs: faitsSuite.slice(k * 6, k * 6 + 6), ds: datesSuite.slice(k * 8, k * 8 + 8), ss: sourcesSuite.splice(0, 5) });
        while (sourcesSuite.length) pages.push({ fs: [], ds: [], ss: sourcesSuite.splice(0, 12) });
        pages.forEach(function (pg) {
          var fs = pg.fs, ds = pg.ds, ss = pg.ss;
          s = contenu();
          titre(s, g.titre + ' (continued)', kicker);
          pastille(s, 11.38, 0.2, g.rel);
          var yy = 1.55;
          if (fs.length || ds.length) {
            if (fs.length) blocGris(s, 0.5, yy, ds.length ? 7.9 : 12.33, 2.4, 'What happened (continued)', fs.map(function (t, i) { return { text: couper(t, 330), options: { bullet: true, breakLine: i < fs.length - 1 } }; }), 12);
            if (ds.length) blocGris(s, fs.length ? 8.6 : 0.5, yy, fs.length ? 4.23 : 12.33, 2.4, 'Key dates (continued)', ds.map(function (d, i) {
              return { text: dateCourte(d.date) + (d.publication ? ' (publication of the text)' : '') + (d.texte ? ': ' + couper(d.texte, 80) : ''), options: { breakLine: i < ds.length - 1 } };
            }), 12);
            yy += 2.65;
          }
          if (ss.length) sources(s, yy, ss, 'Sources (continued)');
        });
      });

      /* 5. Calendrier des dates réglementaires (pas de consultations ; dates de publication exclues) */
      var evs = [], vus = {};
      G.forEach(function (g) {
        g.dates.forEach(function (d) {
          if (d.publication || d.approx || d.date < D.du) return;
          var cle = d.date + '|' + (g.texteEn || g.titre);
          if (vus[cle]) return; vus[cle] = 1;
          evs.push({ date: d.date, quoi: g.texteEn || couper(g.titre, 60), zone: g.zoneEn, texte: d.texte });
        });
      });
      evs.sort(function (x, y) { return x.date < y.date ? -1 : 1; });
      if (evs.length) par(evs, 6).forEach(function (bloc, i) {
        s = contenu();
        titre(s, suite('Regulatory dates (period and upcoming)', i), 'Calendar');
        var X0 = 0.9, X1 = 12.4, AY = 4.0, pas = (X1 - X0) / bloc.length;
        s.addShape(S.line, { x: X0, y: AY, w: X1 - X0, h: 0, line: { color: C.violet, width: 2 } });
        bloc.forEach(function (e, j) {
          var cx = X0 + pas * (j + 0.5), haut = j % 2 === 0, bw = Math.min(2.6, pas * 2 - 0.2), bx = Math.max(0.5, Math.min(cx - bw / 2, 12.83 - bw));
          var by = haut ? AY - 2.2 : AY + 0.55;
          s.addShape(S.ellipse, { x: cx - 0.09, y: AY - 0.09, w: 0.18, h: 0.18, fill: { color: C.violet }, line: { color: C.white, width: 1.5 } });
          s.addShape(S.line, { x: cx, y: haut ? by + 1.65 : AY + 0.1, w: 0, h: haut ? AY - by - 1.75 : 0.45, line: { color: C.violet, width: 0.75, dashType: 'dash' } });
          s.addShape(S.roundRect, { x: bx, y: by, w: bw, h: 1.65, rectRadius: 0.05, fill: { color: C.grey }, line: { color: C.grey } });
          s.addText([{ text: dateCourte(e.date), options: { bold: true, color: C.violet, breakLine: true } },
                     { text: e.quoi, options: { breakLine: true } },
                     { text: e.zone + (e.texte ? ' — ' + couper(e.texte, 70) : ''), options: { color: C.sub, fontSize: 11 } }],
            { x: bx + 0.12, y: by + 0.08, w: bw - 0.24, h: 1.5, fontFace: F, fontSize: 12, color: C.ink, valign: 'top', margin: 0, fit: 'shrink' });
        });
        s.addText('Entry into force, application dates and compliance, registration or notification deadlines only. Consultation dates are excluded.',
          { x: 0.5, y: 6.65, w: 12, h: 0.3, fontFace: F, fontSize: 12, color: C.sub, margin: 0 });
      });

      /* 6. Vue par pays */
      var parPays = {};
      G.forEach(function (g) { (parPays[g.zoneEn] = parPays[g.zoneEn] || []).push(g); });
      var blocsPays = [];
      Object.keys(parPays).sort().forEach(function (z) { par(parPays[z], 6).forEach(function (l, i) { blocsPays.push({ zone: suite(z, i), groupes: l }); }); });
      par(blocsPays, 6).forEach(function (bloc, i) {
        s = contenu();
        titre(s, suite('Subjects by country', i), 'View by country');
        var cw = (12.33 - 0.4) / 3, ch = 2.45;
        bloc.forEach(function (b, j) {
          var x = 0.5 + (j % 3) * (cw + 0.2), y = 1.55 + Math.floor(j / 3) * (ch + 0.2);
          blocGris(s, x, y, cw, ch, b.zone, b.groupes.map(function (g, k) {
            return { text: couper(g.texteEn || g.titre, 70) + ' (' + REL[g.rel].label.toLowerCase() + ')', options: { bullet: true, breakLine: k < b.groupes.length - 1 } };
          }), 12);
        });
      });

      /* 7. Textes en préparation et pressentis */
      var prep = G.filter(function (g) { return g.etape === 'projet' || g.etape === 'consultation'; }).map(function (g) {
        return { nom: g.texteEn || couper(g.titre, 90), zone: g.zoneEn, quoi: 'Draft text in progress — ' + g.etapeEn.toLowerCase() };
      });
      (D.pressentis || []).forEach(function (x) {
        if (x.sorte === 'avis' || x.statut === 'devenu_projet') return;
        if ((x.dernier_signal || '') < D.du || (x.premier_signal || '') > D.au) return;
        var nom = x.texte ? D.texteEn(x.texte) : (x.nom || titreEn((x.articles || [])[0] || {}));
        prep.push({ nom: (x.sorte === 'evolution' ? 'Expected change: ' : '') + couper(nom, 90), zone: D.zoneEn(x.zone),
                    quoi: 'Expected — first signal on ' + dateCourte(x.premier_signal) + ', ' + (x.nb_sources || 1) + ' source' + ((x.nb_sources || 1) > 1 ? 's' : '') });
      });
      if (prep.length) par(prep, 5).forEach(function (bloc, i) {
        s = contenu();
        titre(s, suite('Texts in preparation and expected developments', i), 'Outlook');
        bloc.forEach(function (p, j) {
          var y = 1.7 + j * 1.0;
          s.addShape(S.ellipse, { x: 0.5, y: y, w: 0.45, h: 0.45, fill: { color: C.violet }, line: { color: C.violet } });
          s.addText(String(i * 5 + j + 1).padStart(2, '0'), { x: 0.5, y: y, w: 0.45, h: 0.45, fontFace: F, fontSize: 12, color: C.white, align: 'center', valign: 'middle', margin: 0 });
          s.addText([{ text: p.nom, options: { color: C.violet, fontSize: 16, breakLine: true } }, { text: p.zone + '  |  ' + p.quoi, options: { color: C.ink, fontSize: 13 } }],
            { x: 1.2, y: y - 0.05, w: 11.5, h: 0.75, fontFace: F, valign: 'top', margin: 0, fit: 'shrink' });
          if (j < bloc.length - 1) s.addShape(S.line, { x: 1.2, y: y + 0.8, w: 11.6, h: 0, line: { color: C.line, width: 0.75 } });
        });
      });

      /* 8. Annexe : articles sources */
      var ann = P.articles.slice().sort(function (x, y) { return x.date < y.date ? 1 : -1; });
      par(ann, 9).forEach(function (bloc, i) {
        s = contenu();
        titre(s, suite('Source articles of the period', i), 'Appendix');
        tableau(s, ['Date', 'Source', 'Article', 'Subject', 'Relevance'], bloc.map(function (a) {
          return [dateCourte(a.date), couper(a.source, 40), { text: couper(titreEn(a), 95), options: a.lien ? { hyperlink: { url: a.lien }, color: C.violet } : {} },
                  (a.textes_cles || []).map(D.texteEn).join(', ') || '—', REL[a.pertinence].label];
        }), [1.3, 2.0, 5.53, 2.0, 1.5], 1.45, 11);
      });
    }

    /* 9. Page de fin */
    s = pptx.addSlide();
    s.background = { data: IMG.end };
    s.addImage({ data: IMG.logo_white, x: 5.17, y: 3.5, w: 3.0, h: 0.41 });
    return pptx;
  }

  racine.CW_SLIDES = { construire: construire, preparer: preparer };
  if (typeof module !== 'undefined' && module.exports) module.exports = racine.CW_SLIDES;
})(typeof window !== 'undefined' ? window : this);
