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
  var TYPES_PC = { adopte: 'New text adopted', proposition: 'Draft text in progress', echeance: 'Announced deadline',
                   a_qualifier: 'New text to be assessed', signale: 'Flagged by a reader' };
  function paysOk(D, z) { return !D.pays || !D.pays.length || D.pays.indexOf(z || '') >= 0; }
  function articleOk(D, a) {
    return a && a.nature !== 'opinion' && !a.doublon_de && a.avis_lecteur !== 'pas_pertinent' && !(D.exclus || {})[a.id];
  }
  function completer(D, g) {
    // article de tête : le plus pertinent, une source officielle de préférence, puis le plus récent
    g.articles.sort(function (x, y) {
      return ((REL[x.pertinence] || REL.moyenne).rang - (REL[y.pertinence] || REL.moyenne).rang) ||
             ((y.nature === 'officielle') - (x.nature === 'officielle')) || (x.date < y.date ? 1 : -1);
    });
    g.rel = g.rel || (REL[g.articles[0].pertinence] ? g.articles[0].pertinence : 'moyenne');
    g.verifier = g.verifier || g.rel === 'faible' || g.articles.some(function (a) { return a.a_verifier; });
    g.titre = g.titre || titreEn(g.articles[0]);
    g.texteEn = g.texte ? D.texteEn(g.texte) : '';
    g.zoneEn = D.zoneEn(g.zone);
    g.etapeEn = g.etapeEn || ETAPES[g.etape] || 'Update';
    // dates : uniquement les dates réglementaires (pas de consultation : déjà filtrées à la collecte)
    var vues = {}; g.dates = g.dates || [];
    g.dates.forEach(function (d) { vues[d.date] = 1; });
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
  }
  function trier(liste) {
    liste.sort(function (x, y) {
      return (REL[x.rel].rang - REL[y.rel].rang) || x.zoneEn.localeCompare(y.zoneEn) || (x.texteEn || x.titre).localeCompare(y.texteEn || y.titre);
    });
    return liste;
  }
  // support « complet » : tous les articles très pertinents, pertinents (et à surveiller si demandé) de la période
  function preparerComplet(D) {
    var arts = (D.articles || []).filter(function (a) {
      return a.date >= D.du && a.date <= D.au && REL[a.pertinence] && articleOk(D, a) && paysOk(D, a.zone);
    });
    var groupes = {};
    arts.forEach(function (a) {
      var texte = (a.textes_cles || [])[0] || '';
      var etape = a.statut || '';
      var cle = texte ? [texte, a.zone || '', etape].join('|') : 'art|' + a.id;
      var g = groupes[cle] || (groupes[cle] = { texte: texte, zone: a.zone || '', etape: etape, articles: [] });
      g.articles.push(a);
    });
    return { articles: arts, groupes: trier(Object.keys(groupes).map(function (k) { return completer(D, groupes[k]); })) };
  }
  // support « synthétique » (12/11/2026) : seulement les points clés détectés pendant la période
  function preparerSynthese(D) {
    var parId = D.articlesParId || {}, arts = [], vus = {};
    var groupes = (D.alertes || []).filter(function (x) {
      return !x.ref && (x.detecte_le || '') >= D.du && (x.detecte_le || '') <= D.au && paysOk(D, x.zone);
    }).map(function (x) {
      var liste = (x.articles || []).map(function (ap) { return parId[ap.id] || ap; }).filter(function (a) { return articleOk(D, a); });
      if (!liste.length) return null;
      liste.forEach(function (a) { if (!vus[a.id]) { vus[a.id] = 1; arts.push(a); } });
      var g = { texte: x.texte && !x.inconnu ? x.texte : '', zone: x.zone || '', etape: '', etapeEn: TYPES_PC[x.type] || 'Key point',
                articles: liste, rel: 'elevee', verifier: !!x.a_verifier, dates: [] };
      if (x.echeance) g.dates.push({ date: x.echeance, texte: ((x.extrait || {}).en || '') });
      return completer(D, g);
    }).filter(Boolean);
    groupes.sort(function (x, y) { return x.zoneEn.localeCompare(y.zoneEn) || (x.texteEn || x.titre).localeCompare(y.texteEn || y.titre); });
    return { articles: arts, groupes: groupes };
  }
  function preparer(D) { return D.mode === 'synthese' ? preparerSynthese(D) : preparerComplet(D); }

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
    // bandeaux d'avertissement : « To verify » (pertinence incertaine) et/ou contenu écrit par l'IA (décision du 09/11)
    function bandeaux(s, y, verifier, ia) {
      var runs = [];
      if (verifier) runs.push({ text: 'To verify: ', options: { bold: true } },
        { text: 'information and relevance were selected automatically. Check the source articles before reuse.', options: { breakLine: ia } });
      if (ia) runs.push({ text: 'AI-generated content: ', options: { bold: true } },
        { text: 'relevance of this slide to be decided. Summaries and quotes were written by an open-source AI (' + nomModele(ia) + '); please check that the information is accurate against the sources. AI can make mistakes.' });
      var h = (verifier && ia) ? 0.78 : (ia ? 0.6 : 0.42);
      s.addShape(S.rect, { x: 0.5, y: y, w: 12.33, h: h, fill: { color: C.amberSoft }, line: { color: C.amber, width: 1 } });
      s.addShape(S.rect, { x: 0.5, y: y, w: 0.12, h: h, fill: { color: C.amber }, line: { color: C.amber } });
      s.addText(runs, { x: 0.75, y: y, w: 12, h: h, fontFace: F, fontSize: 12, color: C.ink, valign: 'middle', margin: 0, fit: 'shrink' });
      return h + 0.15;
    }
    function nomModele(f) { return /qwen2\.5-7b/i.test(f || '') ? 'Qwen2.5-7B-Instruct' : (f || 'open-source model').replace(/\.gguf$/i, '').replace(/-Q\d.*$/i, ''); }
    // ce que la slide dit d'un article : résumé IA + citations vérifiées, mention RKC, ou résumé de la source / titre
    function faitsArticle(a, premier) {
      var R = (D.resumes || {})[a.id];
      if (a.nature === 'rkc') {
        return [[{ text: titreEn(a) + ' — ', options: {} },
                 { text: 'Paid article provided by the RKC watch (source: ' + (a.publication || 'not stated') + '). It cannot be quoted or summarised in this slide.', options: { italic: true, color: C.sub } }]];
      }
      if (R && R.r) {
        var l = [premier ? [{ text: R.r, options: {} }] : [{ text: (a.source || '') + ', ' + dateCourte(a.date) + ': ', options: { bold: true } }, { text: R.r, options: {} }]];
        (R.c || []).forEach(function (q) {
          var p = [{ text: '“' + q.t + '”', options: { italic: true } }];
          if (q.tr) p.push({ text: ' (translated into English by ' + q.m + ': “' + q.tr + '”)', options: { color: C.sub } });
          l.push(p);
        });
        l.ia = R.mod || 'qwen2.5-7b';
        return l;
      }
      var res = premier ? couper(resumeEn(a), 320) : '';
      return [[{ text: res || titreEn(a), options: {} }]];
    }
    function paragraphes(items) {
      var runs = [];
      items.forEach(function (it, i) {
        it.forEach(function (r, j) {
          var o = Object.assign({}, r.options);
          o.bullet = true;   // sur chaque morceau du paragraphe (sinon la puce peut disparaître)
          if (j === it.length - 1 && i < items.length - 1) o.breakLine = true;
          runs.push({ text: couper(r.text, 700), options: o });
        });
      });
      return runs;
    }
    function lignesSources(arts) {
      return arts.map(function (a) {
        var t = couper(titreEn(a), 150) + ' – ' + (a.nature === 'rkc' ? 'RKC watch, paid article (' + (a.publication || 'source not stated') + ')' : (a.source || '')) + ', ' + dateCourte(a.date);
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
    s.addText(D.mode === 'synthese' ? 'Key regulatory points' : 'Regulatory developments', { x: 0.6, y: 1.9, w: 10, h: 0.8, fontFace: F, fontSize: 40, color: C.white, valign: 'top', margin: 0 });
    s.addText('Period covered: ' + periode + '  |  Generated on ' + dateLongue(D.genere), { x: 0.6, y: 2.9, w: 11, h: 0.35, fontFace: F, fontSize: 14, color: C.white, margin: 0 });
    s.addImage({ data: IMG.logo_white, x: 0.6, y: 6.6, w: 1.9, h: 0.26 });

    var G = P.groupes;
    // 12/11/2026 : toutes les sources dans une annexe à part, numérotées ; les slides n'affichent que les numéros
    var ann = P.articles.slice().sort(function (x, y) { return x.date < y.date ? 1 : -1; });
    var NUM = {};
    ann.forEach(function (a, i) { NUM[a.id] = i + 1; });
    function refs(arts) { return arts.map(function (a) { return '[' + NUM[a.id] + ']'; }).join(' '); }
    if (!G.length) {
      s = contenu();
      titre(s, 'No relevant development over the period', 'Overview');
      s.addText((D.mode === 'synthese' ? 'No key point was detected between ' : 'No article rated very relevant, relevant or to monitor was found between ') + periode + '.', { x: 0.5, y: 1.7, w: 12, h: 0.5, fontFace: F, fontSize: 16, color: C.ink, margin: 0 });
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
      if (D.mode === 'synthese') {
        // support synthétique : répartition par type de point clé
        var types = {};
        G.forEach(function (g) { types[g.etapeEn] = (types[g.etapeEn] || 0) + 1; });
        s.addText('Breakdown by type of key point', { x: 5.2, y: 4.3, w: 7, h: 0.3, fontFace: F, fontSize: 14, color: C.violet, margin: 0 });
        s.addText(Object.keys(types).sort(function (a, b) { return types[b] - types[a]; }).map(function (k, i, l) {
          return { text: k + ': ' + types[k], options: { bullet: true, breakLine: i < l.length - 1 } };
        }), { x: 5.2, y: 4.75, w: 7.4, h: 1.8, fontFace: F, fontSize: 14, color: C.ink, valign: 'top', margin: 0 });
      } else {
        s.addText('Breakdown by relevance', { x: 5.2, y: 4.3, w: 7, h: 0.3, fontFace: F, fontSize: 14, color: C.violet, margin: 0 });
        ['elevee', 'moyenne', 'faible'].forEach(function (r, i) {
          pastille(s, 5.2 + i * 2.6, 4.8, r);
          s.addText(rels[r] + (rels[r] > 1 ? ' subjects' : ' subject'), { x: 5.2 + i * 2.6, y: 5.15, w: 2.4, h: 0.3, fontFace: F, fontSize: 13, color: C.ink, margin: 0 });
        });
      }

      /* 3. Points clés de la période (tableau) */
      par(G, 8).forEach(function (bloc, i) {
        s = contenu();
        titre(s, suite('Key points of the period', i), 'Overview');
        tableau(s, ['Subject', 'Country', 'Step', 'Key regulatory date', D.mode === 'synthese' ? 'Check' : 'Relevance'], bloc.map(function (g) {
          var d = g.dates.filter(function (x) { return !x.publication; })[0];
          return [g.texteEn ? g.texteEn + ' — ' + couper(g.titre, 90) : couper(g.titre, 120), g.zoneEn, g.etapeEn, d ? dateCourte(d.date) : 'Not stated',
                  D.mode === 'synthese' ? (g.verifier ? { text: 'To verify', options: { bold: true, color: 'B07A00' } } : '—')
                    : { text: '● ' + REL[g.rel].label, options: { bold: true, color: g.rel === 'faible' ? 'B07A00' : C.violet } }];
        }), [5.0, 1.9, 1.6, 1.9, 1.93], 1.55, 12);
        if (i === 0) s.addText(D.mode === 'synthese' ? 'Key points detected over the period, by country. Points marked “To verify” come from non-official sources.'
            : 'Sorted by relevance, then by country. Subjects marked “To monitor” carry a “To verify” banner on their own slide.',
          { x: 0.5, y: 6.65, w: 12, h: 0.3, fontFace: F, fontSize: 12, color: C.sub, margin: 0 });
      });

      /* 3 bis. Synthèse par texte (loi) : pays, étapes, nombre de développements, prochaine date */
      var parTexte = {};
      G.forEach(function (g) {
        var k = g.texteEn || 'Other subjects (no tracked text)';
        var x = parTexte[k] || (parTexte[k] = { pays: [], etapes: [], n: 0, dates: [] });
        if (x.pays.indexOf(g.zoneEn) < 0) x.pays.push(g.zoneEn);
        if (x.etapes.indexOf(g.etapeEn) < 0) x.etapes.push(g.etapeEn);
        x.n += g.articles.length;
        g.dates.forEach(function (d) { if (!d.publication && !d.approx && d.date >= D.du) x.dates.push(d.date); });
      });
      var cles = Object.keys(parTexte).sort(function (a, b) {
        if (/^Other subjects/.test(a)) return 1; if (/^Other subjects/.test(b)) return -1;
        return (parTexte[b].n - parTexte[a].n) || a.localeCompare(b);
      });
      par(cles, 8).forEach(function (bloc, i) {
        s = contenu();
        titre(s, suite('Summary by regulation', i), 'Overview');
        tableau(s, ['Regulation', 'Countries', 'Steps', 'Articles', 'Next regulatory date'], bloc.map(function (k) {
          var x = parTexte[k], d = x.dates.sort()[0];
          return [{ text: k, options: { bold: true } }, couper(x.pays.join(', '), 90), couper(x.etapes.join(', '), 60), String(x.n), d ? dateCourte(d) : '—'];
        }), [3.0, 3.4, 2.4, 1.7, 1.83], 1.55, 12);
      });

      /* 4. Une slide par sujet (+ slides « continued ») ; les sujets presque vides vont dans « Other developments » */
      var maigres = [];
      G.forEach(function (g) {
        var a0 = g.articles[0];
        if (g.articles.length === 1 && !g.dates.length && !(D.resumes || {})[a0.id] && resumeEn(a0).length < 80 && !g.acteurs.length) { maigres.push(g); return; }
        var kicker = [g.texteEn || 'Other subject', g.zoneEn, g.etapeEn].join('  |  ');
        var faits = [], ia = '';
        g.articles.forEach(function (a, i) {
          var f = faitsArticle(a, i === 0);
          if (f.ia) ia = ia || f.ia;
          f.forEach(function (p) { p.ia = !!f.ia; faits.push(p); });
        });
        var faits1 = faits.slice(0, 4), faitsSuite = faits.slice(4);
        var sources1 = [], sourcesSuite = [];   // 12/11/2026 : les sources sont en annexe (numéros seulement)
        s = contenu();
        titre(s, g.titre, kicker);
        if (D.mode !== 'synthese') pastille(s, 11.38, 0.2, g.rel);
        var y = 1.55;
        var iaIci = faits1.some(function (p) { return p.ia; }) ? ia : '';
        if (g.verifier || iaIci) y += bandeaux(s, y, g.verifier, iaIci);
        var h = 6.75 - y - 0.45;   // place laissée à la ligne des sources
        var dates = g.dates.length ? g.dates.slice(0, 3).map(function (d, i, l) {
          return { text: (d.approx ? 'Around ' : '') + dateCourte(d.date) + (d.publication ? ' (publication of the text)' : '') + (d.texte ? ': ' + couper(d.texte, 70) : ''), options: { breakLine: i < l.length - 1 } };
        }) : 'No regulatory date stated in the sources';
        var qui = g.acteurs.length ? g.acteurs.join(', ') : 'To complete';
        if (iaIci) {
          // résumé + citations : bloc large à gauche ; dates, « qui est concerné » et analyse à droite
          blocGris(s, 0.5, y, 8.17, h, 'What happened', paragraphes(faits1), 12);
          var h3 = Math.max(1.2, h * 0.36), h1 = (h - h3 - 0.3) * 0.55, h2 = (h - h3 - 0.3) * 0.45;
          blocGris(s, 8.83, y, 4.0, h1, 'Key dates', dates, 12);
          blocGris(s, 8.83, y + h1 + 0.15, 4.0, h2, 'Who is concerned', qui, 12);
          var y3 = y + h1 + h2 + 0.3;
          s.addShape(S.roundRect, { x: 8.83, y: y3, w: 4.0, h: h3, rectRadius: 0.06, fill: { color: C.white }, line: { color: C.violet, width: 1, dashType: 'dash' } });
          s.addText([{ text: 'Impact for the company: ', options: { color: C.violet, breakLine: true } }, { text: 'To complete', options: { italic: true, color: C.sub, breakLine: true } },
                     { text: 'Recommended actions: ', options: { color: C.violet, breakLine: true } }, { text: 'To complete', options: { italic: true, color: C.sub } }],
            { x: 9.03, y: y3 + 0.1, w: 3.6, h: h3 - 0.2, fontFace: F, fontSize: 13, margin: 0, valign: 'top', paraSpaceAfter: 4 });
        } else {
          blocGris(s, 0.5, y, 4.0, h, 'What happened', paragraphes(faits1), 12);
          blocGris(s, 4.67, y, 4.0, h * 0.5, 'Key dates', dates, 12);
          blocGris(s, 4.67, y + h * 0.5 + 0.15, 4.0, h * 0.5 - 0.15, 'Who is concerned', qui, 12);
        }
        if (!iaIci) {
          s.addShape(S.roundRect, { x: 8.83, y: y, w: 4.0, h: h, rectRadius: 0.06, fill: { color: C.white }, line: { color: C.violet, width: 1, dashType: 'dash' } });
          s.addText('Impact for the company', { x: 9.03, y: y + 0.18, w: 3.6, h: 0.3, fontFace: F, fontSize: 14, color: C.violet, margin: 0 });
          s.addText('To complete', { x: 9.03, y: y + 0.5, w: 3.6, h: 0.9, fontFace: F, fontSize: 13, italic: true, color: C.sub, margin: 0, valign: 'top' });
          s.addText('Recommended actions', { x: 9.03, y: y + h / 2 + 0.05, w: 3.6, h: 0.3, fontFace: F, fontSize: 14, color: C.violet, margin: 0 });
          s.addText('To complete', { x: 9.03, y: y + h / 2 + 0.37, w: 3.6, h: 0.9, fontFace: F, fontSize: 13, italic: true, color: C.sub, margin: 0, valign: 'top' });
        }
        s.addText([{ text: 'Sources: ', options: { bold: true, color: C.violet } }, { text: refs(g.articles) + '  (see appendix “Sources”)', options: { color: C.ink } }],
          { x: 0.5, y: y + h + 0.15, w: 12.3, h: 0.3, fontFace: F, fontSize: 12, margin: 0, fit: 'shrink' });
        // slides « continued » : d'abord les faits et dates restants (avec 4 sources au plus), puis les sources seules
        var datesSuite = g.dates.slice(3);
        var nHaut = Math.max(Math.ceil(faitsSuite.length / 5), Math.ceil(datesSuite.length / 8));
        var pages = [];
        for (var k = 0; k < nHaut; k++) pages.push({ fs: faitsSuite.slice(k * 5, k * 5 + 5), ds: datesSuite.slice(k * 8, k * 8 + 8), ss: [] });
        pages.forEach(function (pg) {
          var fs = pg.fs, ds = pg.ds, ss = pg.ss;
          s = contenu();
          titre(s, g.titre + ' (continued)', kicker);
          if (D.mode !== 'synthese') pastille(s, 11.38, 0.2, g.rel);
          var yy = 1.55;
          var iaSuite = fs.some(function (p) { return p.ia; }) ? ia : '';
          if (g.verifier || iaSuite) yy += bandeaux(s, yy, g.verifier, iaSuite);
          if (fs.length || ds.length) {
            var hh = ss.length ? 2.9 : 6.55 - yy;
            if (fs.length) blocGris(s, 0.5, yy, ds.length ? 7.9 : 12.33, hh, 'What happened (continued)', paragraphes(fs), 12);
            if (ds.length) blocGris(s, fs.length ? 8.6 : 0.5, yy, fs.length ? 4.23 : 12.33, hh, 'Key dates (continued)', ds.map(function (d, i) {
              return { text: dateCourte(d.date) + (d.publication ? ' (publication of the text)' : '') + (d.texte ? ': ' + couper(d.texte, 80) : ''), options: { breakLine: i < ds.length - 1 } };
            }), 12);
            yy += hh + 0.2;
          }
          if (ss.length) sources(s, yy, ss, 'Sources (continued)');
        });
      });

      /* 4 bis. Sujets presque vides (une source, sans résumé, sans date) : regroupés, rien n'est perdu */
      par(maigres, 7).forEach(function (bloc, i) {
        if (!bloc.length) return;
        s = contenu();
        titre(s, suite('Other developments of the period', i), 'Subjects');
        tableau(s, ['Development', 'Country', 'Relevance', 'Source'], bloc.map(function (g) {
          var a = g.articles[0];
          var lib = (g.texteEn ? g.texteEn + ' — ' : '') + couper(titreEn(a), 120);
          return [{ text: lib, options: a.lien ? { hyperlink: { url: a.lien }, color: C.violet } : {} }, g.zoneEn,
                  { text: '● ' + REL[g.rel].label, options: { bold: true, color: g.rel === 'faible' ? 'B07A00' : C.violet } },
                  '[' + NUM[a.id] + '] ' + (a.nature === 'rkc' ? 'RKC watch (paid)' : couper(a.source, 26)) + ', ' + dateCourte(a.date)];
        }), [6.3, 1.8, 1.6, 2.63], 1.9, 12);
        s.addText('Subjects with little information in the sources (no summary, no date). Items marked “To monitor” are to verify. Check the source articles.',
          { x: 0.5, y: 1.45, w: 12.3, h: 0.3, fontFace: F, fontSize: 12, color: C.sub, margin: 0 });
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

      /* 8. Annexe : toutes les sources, numérotées (les slides y renvoient par leur numéro) */
      par(ann, 9).forEach(function (bloc, i) {
        s = contenu();
        titre(s, suite('Sources', i), 'Appendix');
        tableau(s, ['#', 'Date', 'Source', 'Article', 'Subject'], bloc.map(function (a) {
          var src = a.nature === 'rkc' ? 'RKC watch, paid (' + couper(a.publication || 'not stated', 24) + ')' : couper(a.source, 40);
          return [String(NUM[a.id]), dateCourte(a.date), src, { text: couper(titreEn(a), 95), options: a.lien ? { hyperlink: { url: a.lien }, color: C.violet } : {} },
                  (a.textes_cles || []).map(D.texteEn).join(', ') || '—'];
        }), [0.55, 1.25, 2.3, 6.0, 2.23], 1.45, 11);
      });
    }

    /* 9. Page de fin */
    s = pptx.addSlide();
    s.background = { data: IMG.end };
    s.addImage({ data: IMG.logo_white, x: 5.17, y: 3.5, w: 3.0, h: 0.41 });
    return pptx;
  }

  // nombre de slides sans rien dessiner (affiché dans la fenêtre avant de générer)
  function compter(D) {
    var n = 0, faux = function () { return obj; }, obj = { addText: faux, addShape: faux, addImage: faux, addTable: faux };
    function FauxPptx() { this.ShapeType = { rect: 1, roundRect: 2, ellipse: 3, line: 4 }; }
    FauxPptx.prototype.defineSlideMaster = function () {};
    FauxPptx.prototype.addSlide = function () { n++; return obj; };
    construire(FauxPptx, { cover: '', end: '', panel: '', logo_white: '', logo_violet: '' }, D);
    return n;
  }
  racine.CW_SLIDES = { construire: construire, preparer: preparer, compter: compter };
  if (typeof module !== 'undefined' && module.exports) module.exports = racine.CW_SLIDES;
})(typeof window !== 'undefined' ? window : this);
