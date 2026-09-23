/* ==========================================================================
   Cyber Watch — comportements
   Construit la page à partir des fichiers de données (data/*.js), puis gère
   accordéons, filtres cumulables, recherche, export Excel et copie pour Teams.
   Aucune dépendance externe.
   ========================================================================== */

(function () {
  'use strict';

  var DATA  = window.VEILLE_ACTUALITES   || { meta: {}, articles: [] };
  var ETAT  = window.VEILLE_ETAT_SOURCES || { sources: [] };
  var SYNTH = window.VEILLE_SYNTHESES    || { groupes: [], glossaire: [] };
  var META  = DATA.meta || {};
  var ARTICLES = DATA.articles || [];

  var NATURES = {
    officielle: { label: 'Source officielle', badge: 'badge-confirme' },
    cabinet:    { label: "Cabinet d'avocats", badge: 'badge-nuance' },
    presse:     { label: 'Presse & autres',   badge: 'badge-presse' },
    synthese:   { label: 'Analyse rédigée',   badge: 'badge-confirme' }
  };
  var CONF = {
    confirme: { label: 'Confirmé', badge: 'badge-confirme' },
    nuance:   { label: 'Nuancé',   badge: 'badge-nuance' },
    rapporte: { label: 'Rapporté', badge: 'badge-rapporte' }
  };
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
              'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  /* ------------------------------------------------------------ utilitaires */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'text') node.textContent = v;
        else if (k === 'className') node.className = v;
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function isoToDate(iso) {
    var p = (iso || '').split('-');
    return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null;
  }

  function dateLongue(iso) {
    var d = isoToDate(iso);
    return d ? d.getDate() + ' ' + MOIS[d.getMonth()] + ' ' + d.getFullYear() : '';
  }

  function moisAnnee(iso) {
    var d = isoToDate(iso);
    if (!d) return 'Sans date';
    var m = MOIS[d.getMonth()];
    return m.charAt(0).toUpperCase() + m.slice(1) + ' ' + d.getFullYear();
  }

  /* « 16 juin 2026 » -> « 2026-06-16 » (pour les analyses rédigées) */
  function texteToIso(txt) {
    var m = /(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(\d{4})/i.exec(txt || '');
    if (!m) return '';
    var i = MOIS.indexOf(m[2].toLowerCase());
    if (i < 0) return '';
    return m[3] + '-' + ('0' + (i + 1)).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  }

  function normaliser(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  var aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);

  function joursDepuis(iso) {
    var d = isoToDate(iso);
    return d ? Math.round((aujourdhui - d) / 86400000) : 99999;
  }

  /* ------------------------------------------------------------- en-tête */

  function renderHeader() {
    if (META.titre) {
      document.getElementById('titre').textContent = META.titre;
      document.title = META.titre;
    }
    if (META.surtitre) document.getElementById('surtitre').textContent = META.surtitre;
    if (META.sous_titre) document.getElementById('sous-titre').textContent = META.sous_titre;

    var info = document.getElementById('update-info');
    if (META.mise_a_jour) {
      var d = new Date(META.mise_a_jour);
      var quand = isNaN(d) ? META.mise_a_jour :
        d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) +
        ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      info.textContent = 'Dernière mise à jour : ' + quand + ' · ' +
        (META.nb_nouveaux || 0) + (META.nb_nouveaux > 1 ? ' nouveaux articles' : ' nouvel article');
    }
    var btn = document.getElementById('lancer-maj');
    if (META.url_lancer_maj) {
      btn.href = META.url_lancer_maj;
      btn.hidden = false;
      btn.title = 'Ouvre GitHub : cliquez sur « Run workflow » puis patientez quelques minutes';
    }
  }

  /* ------------------------------------------------------------- cartes */

  var registre = {};  // id de carte -> données (pour l'export)

  function cardHead(id, titre, accroche, dateTxt, badges) {
    var meta = el('span', { className: 'card-meta' }, [el('span', { className: 'card-date', text: dateTxt })]);
    badges.forEach(function (b) { meta.appendChild(b); });
    meta.appendChild(el('span', { className: 'chevron', 'aria-hidden': 'true' }));
    return el('button', { type: 'button', className: 'card-head', 'aria-expanded': 'false', 'aria-controls': id + '-body' }, [
      el('span', { className: 'card-headline' }, [
        el('span', { className: 'card-title', text: titre }),
        accroche ? el('span', { className: 'card-hook', text: accroche }) : null
      ]),
      meta
    ]);
  }

  function tagList(tags) {
    var ul = el('ul', { className: 'tags' });
    tags.forEach(function (t) {
      ul.appendChild(el('li', null, [el('button', { type: 'button', className: 'tag', 'data-tag': t, text: t })]));
    });
    return ul;
  }

  function carteArticle(a) {
    var id = 'a-' + a.id;
    registre[id] = a;
    var nat = NATURES[a.nature] || NATURES.presse;
    var badges = [el('span', { className: 'badge ' + nat.badge, text: nat.label })];
    if (META.mise_a_jour && a.detecte_le && joursDepuis(a.detecte_le) <= 2) {
      badges.unshift(el('span', { className: 'badge badge-new', text: 'Nouveau' }));
    }
    var dateTxt = dateLongue(a.date) + (a.date_estimee ? ' (détecté)' : '');
    var card = el('article', {
      className: 'card', id: id,
      'data-section': a.rubrique, 'data-nature': a.nature, 'data-zone': a.zone || '—',
      'data-date': a.date, 'data-tags': (a.tags || []).join('|')
    }, [cardHead(id, a.titre, a.resume, dateTxt, badges)]);
    card._build = function () {
      var lien = el('a', { href: a.lien, target: '_blank', rel: 'noopener noreferrer', text: "Lire l'article sur le site source" });
      var trad = el('a', {
        href: 'https://translate.google.com/translate?sl=auto&tl=fr&u=' + encodeURIComponent(a.lien),
        target: '_blank', rel: 'noopener noreferrer', text: 'Traduire en français'
      });
      return [
        el('div', { className: 'sources' }, [
          el('p', { className: 'sources-title', text: 'Source' }),
          el('p', { className: 'src-line' }, [
            el('strong', { text: a.source }), ' · ' + (a.zone || '—') + ' · ' +
            (a.date_estimee ? 'détecté le ' + dateLongue(a.date) + ' (date de publication non trouvée)'
                            : 'publié le ' + dateLongue(a.date))
          ]),
          el('p', { className: 'src-line' }, [lien, ' · ', trad])
        ]),
        (a.tags && a.tags.length) ? tagList(a.tags) : null
      ];
    };
    return card;
  }

  function carteSynthese(f) {
    var id = 's-' + f.id;
    var iso = texteToIso(f.date);
    registre[id] = {
      titre: f.titre, resume: f.accroche, date: iso, source: 'Analyse rédigée', zone: '—',
      nature: 'synthese', rubrique: 'syntheses', tags: f.tags || [],
      lien: (f.sources && f.sources[0]) ? f.sources[0].url : ''
    };
    var c = CONF[f.conf] || CONF.confirme;
    var card = el('article', {
      className: 'card', id: id, 'data-section': 'syntheses', 'data-nature': 'synthese',
      'data-zone': '—', 'data-date': iso, 'data-tags': (f.tags || []).join('|')
    }, [cardHead(id, f.titre, f.accroche, f.date, [el('span', { className: 'badge ' + c.badge, text: c.label })])]);
    card._build = function () {
      var parts = (f.paragraphes || []).map(function (p) { return el('p', { text: p }); });
      if (f.tags && f.tags.length) parts.push(tagList(f.tags));
      if (f.sources && f.sources.length) {
        var ol = el('ol');
        f.sources.forEach(function (s) {
          ol.appendChild(el('li', null, [
            el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.libelle }),
            s.date ? el('span', { className: 'src-date', text: ' — ' + s.date }) : null
          ]));
        });
        parts.push(el('div', { className: 'sources' }, [el('p', { className: 'sources-title', text: 'Sources' }), ol]));
      }
      return parts;
    };
    return card;
  }

  function construireCorps(card) {
    if (card.querySelector('.card-body')) return;
    var body = el('div', { className: 'card-body', id: card.id + '-body', hidden: true },
      (card._build ? card._build() : []).concat([
        el('div', { className: 'card-actions' }, [
          el('button', { type: 'button', className: 'btn btn-copy', 'data-copy': true, text: 'Copier pour Teams' })
        ])
      ]));
    card.appendChild(body);
  }

  /* ------------------------------------------------------------- sections */

  function section(id, num, titre, chapeau) {
    return el('section', { className: 'section', id: id, 'data-section': id }, [
      el('header', { className: 'section-head' }, [
        el('p', { className: 'section-num', text: num }),
        el('h2', { text: titre }),
        chapeau ? el('p', { className: 'section-lead', text: chapeau }) : null,
        el('p', { className: 'section-count', 'data-section-count': true })
      ])
    ]);
  }

  function sousSection(titre, cartes) {
    var box = el('div', { className: 'cards' });
    cartes.forEach(function (c) { box.appendChild(c); });
    return el('div', { className: 'subsection' }, [
      el('h3', { className: 'sub-title' }, [titre + ' ', el('span', { className: 'badge-count', 'data-sub-count': true })]),
      box
    ]);
  }

  var rubriques = (META.rubriques || []).slice();
  var navItems = [];

  function renderRubriques() {
    var root = document.getElementById('rubriques');
    rubriques.forEach(function (r, i) {
      var num = ('0' + (i + 1)).slice(-2);
      var arts = ARTICLES.filter(function (a) { return a.rubrique === r.id; });
      if (!arts.length) return;
      var sec = section(r.id, num, r.titre, r.chapeau);
      // regroupement par mois de publication (articles déjà triés du plus récent au plus ancien)
      var groupes = [], courant = null;
      arts.forEach(function (a) {
        var m = moisAnnee(a.date);
        if (!courant || courant.titre !== m) { courant = { titre: m, cartes: [] }; groupes.push(courant); }
        courant.cartes.push(carteArticle(a));
      });
      groupes.forEach(function (g) { sec.appendChild(sousSection(g.titre, g.cartes)); });
      root.appendChild(sec);
      navItems.push({ href: '#' + r.id, num: num, label: r.titre, id: r.id, titre: r.titre });
    });

    if (SYNTH.groupes && SYNTH.groupes.length) {
      var num = ('0' + (rubriques.length + 1)).slice(-2);
      var sec = section('syntheses', num, SYNTH.titre || 'Analyses rédigées', SYNTH.chapeau);
      SYNTH.groupes.forEach(function (g) {
        sec.appendChild(sousSection(g.titre, (g.fiches || []).map(carteSynthese)));
      });
      root.appendChild(sec);
      navItems.push({ href: '#syntheses', num: num, label: SYNTH.titre || 'Analyses rédigées', id: 'syntheses', titre: SYNTH.titre || 'Analyses rédigées' });
    }

    if (SYNTH.glossaire && SYNTH.glossaire.length) {
      var ol = document.getElementById('glossary');
      SYNTH.glossaire.forEach(function (g, i) {
        ol.appendChild(el('li', null, [
          el('span', { className: 'gloss-num', text: ('0' + (i + 1)).slice(-2) }),
          el('div', null, [el('p', { className: 'gloss-term', text: g.terme }), el('p', { className: 'gloss-def', text: g.definition })])
        ]));
      });
      document.getElementById('glossaire').hidden = false;
    }

    // navigation
    var nav = document.getElementById('nav');
    navItems.concat([
      { href: '#glossaire', label: 'Glossaire', skip: !(SYNTH.glossaire && SYNTH.glossaire.length) },
      { href: '#etat-sources', label: 'Sources' },
      { href: '#methode', label: 'Méthode' }
    ]).forEach(function (n) {
      if (n.skip) return;
      nav.appendChild(el('a', { href: n.href }, [n.num ? el('span', { className: 'nav-num', text: n.num }) : null, ' ' + n.label]));
    });

    document.getElementById('no-data').hidden = ARTICLES.length > 0;
  }

  /* ------------------------------------------------------- état des sources */

  var MODES = {
    'rss':      { label: 'Flux RSS (Excel)',     cls: 'mode-ok' },
    'rss-auto': { label: 'Flux RSS découvert',   cls: 'mode-ok' },
    'rss+page': { label: 'Flux RSS + pages',     cls: 'mode-ok' },
    'api':      { label: 'API officielle',       cls: 'mode-ok' },
    'inactif':  { label: '—',                    cls: 'mode-off' },
    'page':     { label: 'Surveillance de page', cls: 'mode-page' },
    'erreur':   { label: 'Inaccessible',         cls: 'mode-err' }
  };

  var ACCES = {
    ok:             { label: '✓ Accessible',     cls: 'mode-ok',   ordre: 3 },
    partielle:      { label: '◐ Partielle',      cls: 'mode-page', ordre: 1 },
    ko:             { label: '✗ Inaccessible',   cls: 'mode-err',  ordre: 0 },
    non_configuree: { label: '○ Non configurée', cls: 'mode-off',  ordre: 2 },
    inactive:       { label: '— Ignorée',        cls: 'mode-off',  ordre: 4 },
    attente:        { label: '… Pas encore lue', cls: 'mode-off',  ordre: 5 }
  };

  function accesDe(s) {
    if (s.acces) return s.acces;
    if (s.mode === 'erreur') return 'ko';          // compatibilité anciens fichiers
    return s.erreur ? 'partielle' : 'ok';
  }

  function renderEtat() {
    var tbody = document.getElementById('etat-lignes');
    var src = (ETAT.sources || []).slice().sort(function (a, b) {
      return ((ACCES[accesDe(a)] || {}).ordre - (ACCES[accesDe(b)] || {}).ordre) ||
             (a.zone || '').localeCompare(b.zone || '', 'fr') || a.nom.localeCompare(b.nom, 'fr');
    });
    var compte = { ok: 0, partielle: 0, ko: 0, autre: 0 };
    src.forEach(function (s) {
      var a = accesDe(s), info = ACCES[a] || ACCES.ko, m = MODES[s.mode];
      compte[a in compte ? a : 'autre']++;
      var details = [s.flux ? 'Flux : ' + s.flux : '', s.page ? 'Pages : ' + s.page : '', s.erreur ? '⚠ ' + s.erreur : ''].filter(Boolean).join(' · ');
      var tr = el('tr', { 'data-acces': a in compte ? a : 'autre', 'data-texte': normaliser(s.nom + ' ' + (s.zone || '')) }, [
        el('td', null, [el('span', { className: 'mode ' + info.cls, text: info.label })]),
        el('td', null, [el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.nom })]),
        el('td', { text: s.zone || '—' }),
        el('td', { text: m ? m.label : '—' }),
        el('td', { className: 'num', text: a === 'inactive' || a === 'attente' ? '—' : String(s.nb_trouves || 0) }),
        el('td', { className: 'num', text: a === 'inactive' || a === 'attente' ? '—' : String(s.nb_retenus || 0) }),
        el('td', { className: 'remarque', text: details })
      ]);
      tbody.appendChild(tr);
    });

    var quand = '';
    if (ETAT.mise_a_jour) {
      var d = new Date(ETAT.mise_a_jour);
      quand = isNaN(d) ? ETAT.mise_a_jour : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) +
        ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    document.getElementById('etat-resume').textContent = !src.length
      ? 'Pas encore de liste : elle apparaîtra après la première collecte.'
      : (quand ? 'Dernière collecte : ' + quand + ' · ' : 'Aucune collecte lancée pour l\'instant · ') + src.length + ' sources dans l\'Excel';

    var stats = document.getElementById('etat-stats');
    [['ok', 'accessibles', 'mode-ok'], ['partielle', 'partielles', 'mode-page'], ['ko', 'inaccessibles', 'mode-err'], ['autre', 'ignorées ou non configurées', 'mode-off']]
      .forEach(function (x) {
        stats.appendChild(el('div', { className: 'src-stat ' + x[2] }, [
          el('span', { className: 'src-stat-num', text: String(compte[x[0]]) }), el('span', { className: 'src-stat-lab', text: x[1] })
        ]));
      });

    var filtre = document.getElementById('etat-filtres');
    var recherche = document.getElementById('etat-recherche');
    function filtrer() {
      var choix = (filtre.querySelector('input:checked') || {}).value || '';
      var q = normaliser(recherche.value).trim();
      var n = 0;
      Array.prototype.forEach.call(tbody.children, function (tr) {
        var ok = (!choix || tr.getAttribute('data-acces') === choix) && (!q || tr.getAttribute('data-texte').indexOf(q) !== -1);
        tr.hidden = !ok; if (ok) n++;
      });
      document.getElementById('etat-vide').hidden = n !== 0 || !src.length;
    }
    filtre.addEventListener('change', filtrer);
    recherche.addEventListener('input', filtrer);
  }

  /* ------------------------------------------------------------- facettes */

  function chip(facet, value, label, extraClass) {
    return el('label', { className: 'chip' + (extraClass ? ' ' + extraClass : '') }, [
      el('input', { type: 'checkbox', 'data-facet': facet, value: value }),
      el('span', { text: label })
    ]);
  }

  function valeursUniques(attr) {
    var seen = {};
    cards.forEach(function (c) {
      (c.getAttribute(attr) || '').split('|').forEach(function (v) { v = v.trim(); if (v) seen[v] = (seen[v] || 0) + 1; });
    });
    return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, 'fr', { sensitivity: 'base' }); });
  }

  function renderFacettes() {
    var rb = document.getElementById('rubrique-chips');
    navItems.forEach(function (n) {
      if (n.id) rb.appendChild(chip('section', n.id, n.num + ' — ' + n.titre));
    });
    var zb = document.getElementById('zone-chips');
    valeursUniques('data-zone').forEach(function (z) { if (z !== '—') zb.appendChild(chip('zone', z, z)); });
    var tb = document.getElementById('tag-chips');
    valeursUniques('data-tags').forEach(function (t) { tb.appendChild(chip('tag', t, t)); });
  }

  /* ------------------------------------------------------------- construction */

  renderHeader();
  renderRubriques();
  renderEtat();

  var cards       = Array.prototype.slice.call(document.querySelectorAll('.card'));
  var sections    = Array.prototype.slice.call(document.querySelectorAll('#rubriques .section[data-section]'));
  var subsections = Array.prototype.slice.call(document.querySelectorAll('#rubriques .subsection'));
  var emptyState  = document.getElementById('empty-state');

  renderFacettes();

  function renderStats() {
    var tags = valeursUniques('data-tags').length;
    var semaine = ARTICLES.filter(function (a) { return !a.date_estimee && joursDepuis(a.date) <= 7; }).length;
    var values = { total: ARTICLES.length, semaine: semaine, sources: META.nb_sources || (ETAT.sources || []).length, tags: tags };
    Object.keys(values).forEach(function (key) {
      var n = document.querySelector('[data-stat="' + key + '"]');
      if (n) n.textContent = values[key];
    });
  }
  renderStats();

  var facetInputs = Array.prototype.slice.call(document.querySelectorAll('[data-facet]'));
  var searchInput = document.getElementById('recherche');
  var resultCount = document.getElementById('result-count');
  var toastEl     = document.getElementById('toast');
  var toastTimer  = null;

  /* ---------------------------------------------------------------- Toast */

  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2200);
  }

  /* ------------------------------------------- Repliage du panneau de filtres */

  var toggleFilters = document.getElementById('toggle-filters');
  var facetsBox     = document.getElementById('facets');
  var activeCount   = document.getElementById('active-count');

  function setFiltersOpen(open) {
    toggleFilters.setAttribute('aria-expanded', open ? 'true' : 'false');
    facetsBox.hidden = !open;
  }

  toggleFilters.addEventListener('click', function () {
    setFiltersOpen(toggleFilters.getAttribute('aria-expanded') !== 'true');
  });
  if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) setFiltersOpen(false);

  /* ----------------------------------------------------------- Accordéons */

  function setExpanded(card, expanded) {
    var head = card.querySelector('.card-head');
    if (!head) return;
    if (expanded) construireCorps(card);
    var body = card.querySelector('.card-body');
    head.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (body) body.hidden = !expanded;
    if (expanded) syncTagButtons(selectedValues('tag'));
  }

  document.addEventListener('click', function (event) {
    var head = event.target.closest ? event.target.closest('.card-head') : null;
    if (!head) return;
    var card = head.closest('.card');
    setExpanded(card, head.getAttribute('aria-expanded') !== 'true');
  });

  document.getElementById('expand-all').addEventListener('click', function () {
    var visibles = cards.filter(function (c) { return !c.hidden; });
    if (visibles.length > 300) { toast('Trop d\'articles affichés : filtrez d\'abord (max. 300)'); return; }
    visibles.forEach(function (c) { setExpanded(c, true); });
  });
  document.getElementById('collapse-all').addEventListener('click', function () {
    cards.forEach(function (c) { setExpanded(c, false); });
  });

  /* --------------------------------------------------------------- Filtres */

  function selectedValues(facet) {
    return facetInputs
      .filter(function (i) { return i.dataset.facet === facet && i.checked && i.value; })
      .map(function (i) { return i.value; });
  }

  function tagsOf(card) {
    var raw = card.getAttribute('data-tags') || '';
    return raw ? raw.split('|') : [];
  }

  function texteCarte(card) {
    if (card._texte === undefined) {
      var d = registre[card.id] || {};
      card._texte = normaliser([d.titre, d.resume, d.source, d.zone, (d.tags || []).join(' ')].join(' '));
    }
    return card._texte;
  }

  function matches(card, sel) {
    if (sel.section.length && sel.section.indexOf(card.getAttribute('data-section')) === -1) return false;
    if (sel.nature.length && sel.nature.indexOf(card.getAttribute('data-nature')) === -1) return false;
    if (sel.zone.length && sel.zone.indexOf(card.getAttribute('data-zone')) === -1) return false;
    if (sel.periode.length && joursDepuis(card.getAttribute('data-date')) > +sel.periode[0]) return false;
    if (sel.tag.length) {
      var tags = tagsOf(card);
      for (var i = 0; i < sel.tag.length; i++) if (tags.indexOf(sel.tag[i]) === -1) return false;
    }
    if (sel.q.length) {
      var t = texteCarte(card);
      for (var j = 0; j < sel.q.length; j++) if (t.indexOf(sel.q[j]) === -1) return false;
    }
    return true;
  }

  function syncTagButtons(selectedTags) {
    Array.prototype.forEach.call(document.querySelectorAll('.tag[data-tag]'), function (btn) {
      btn.setAttribute('aria-pressed', selectedTags.indexOf(btn.getAttribute('data-tag')) !== -1 ? 'true' : 'false');
    });
  }

  function applyFilters() {
    var sel = {
      section: selectedValues('section'), nature: selectedValues('nature'), zone: selectedValues('zone'),
      periode: selectedValues('periode'), tag: selectedValues('tag'),
      q: normaliser(searchInput.value).split(/\s+/).filter(Boolean)
    };
    var visible = 0;
    cards.forEach(function (card) {
      var ok = matches(card, sel);
      card.hidden = !ok;
      if (ok) visible++; else if (card.querySelector('.card-body')) setExpanded(card, false);
    });

    subsections.forEach(function (sub) {
      var n = sub.querySelectorAll('.card:not([hidden])').length;
      var badge = sub.querySelector('[data-sub-count]');
      if (badge) badge.textContent = n;
      sub.hidden = (n === 0);
    });
    sections.forEach(function (sec) {
      var n = sec.querySelectorAll('.card:not([hidden])').length;
      var label = sec.querySelector('[data-section-count]');
      if (label) label.textContent = n + (n > 1 ? ' articles affichés' : ' article affiché');
      sec.hidden = (n === 0);
    });

    emptyState.hidden = (visible !== 0 || cards.length === 0);
    var total = cards.length;
    resultCount.textContent = visible === total ? total + ' articles' : visible + ' / ' + total + ' articles';
    syncTagButtons(sel.tag);

    var active = sel.section.length + sel.nature.length + sel.zone.length + sel.periode.length + sel.tag.length + (sel.q.length ? 1 : 0);
    activeCount.textContent = active + (active > 1 ? ' filtres actifs' : ' filtre actif');
    activeCount.hidden = (active === 0);
  }

  facetInputs.forEach(function (input) { input.addEventListener('change', applyFilters); });
  var searchTimer = null;
  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, 150);
  });

  document.getElementById('reset-filters').addEventListener('click', function () {
    facetInputs.forEach(function (i) { i.checked = (i.type === 'radio' && i.value === ''); });
    searchInput.value = '';
    applyFilters();
  });

  /* ------------------------------------------- Tags cliquables dans les cartes */

  document.addEventListener('click', function (event) {
    var btn = event.target.closest ? event.target.closest('.tag[data-tag]') : null;
    if (!btn) return;
    var value = btn.getAttribute('data-tag');
    var input = facetInputs.filter(function (i) { return i.dataset.facet === 'tag' && i.value === value; })[0];
    if (!input) return;
    input.checked = !input.checked;
    applyFilters();
    var panel = document.querySelector('.panel');
    if (panel && input.checked) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  /* --------------------------------------------- Export de la sélection (CSV) */

  function csvCell(v) {
    v = String(v === undefined || v === null ? '' : v).replace(/\r?\n/g, ' ');
    return /[";]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  document.getElementById('export-csv').addEventListener('click', function () {
    var titres = {};
    navItems.forEach(function (n) { if (n.id) titres[n.id] = n.titre; });
    var lignes = [['Date', 'Rubrique', 'Titre', 'Source', 'Zone', 'Nature', 'Mots-clés', 'Lien', 'Résumé']];
    cards.forEach(function (c) {
      if (c.hidden) return;
      var d = registre[c.id];
      if (!d) return;
      lignes.push([d.date, titres[d.rubrique] || d.rubrique, d.titre, d.source, d.zone,
                   (NATURES[d.nature] || {}).label || d.nature, (d.tags || []).join(', '), d.lien, d.resume]);
    });
    if (lignes.length === 1) { toast('Aucun article à exporter'); return; }
    // point-virgule + BOM UTF-8 : s'ouvre directement dans Excel en français
    var csv = '﻿' + lignes.map(function (l) { return l.map(csvCell).join(';'); }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var a = el('a', { href: URL.createObjectURL(blob), download: 'cyberwatch_' + new Date().toISOString().slice(0, 10) + '.csv' });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast((lignes.length - 1) + ' articles exportés');
  });

  /* ------------------------------------------------------ Copier pour Teams */

  function buildTeamsSummary(card) {
    var d = registre[card.id] || {};
    var lines = [d.titre || '', ''];
    var badge = card.querySelector('.card-meta .badge:last-of-type');
    lines.push((card.querySelector('.card-date') || {}).textContent + (badge ? ' · ' + badge.textContent : ''));
    if (d.resume) { lines.push(''); lines.push(d.resume); }
    var paragraphs = Array.prototype.slice.call(card.querySelectorAll('.card-body > p'));
    if (paragraphs.length) {
      lines.push('');
      paragraphs.forEach(function (p) { lines.push('• ' + p.textContent.trim()); });
    }
    var items = Array.prototype.slice.call(card.querySelectorAll('.sources li'));
    lines.push('');
    if (items.length) {
      lines.push('Sources :');
      items.forEach(function (li) {
        var a = li.querySelector('a');
        lines.push('- ' + (a ? a.textContent.trim() + ' — ' + a.getAttribute('href') : li.textContent.trim()));
      });
    } else if (d.lien) {
      lines.push('Source : ' + d.source + ' — ' + d.lien);
    }
    if (d.tags && d.tags.length) { lines.push(''); lines.push('Mots-clés : ' + d.tags.join(', ')); }
    return lines.join('\n');
  }

  function legacyCopy(text) {
    var ta = el('textarea', { readonly: true });
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function flash(btn) {
    var original = btn.textContent;
    btn.textContent = 'Copié';
    btn.classList.add('done');
    setTimeout(function () { btn.textContent = original; btn.classList.remove('done'); }, 1800);
  }

  document.addEventListener('click', function (event) {
    var btn = event.target.closest ? event.target.closest('[data-copy]') : null;
    if (!btn) return;
    var card = btn.closest('.card');
    if (!card) return;
    var text = buildTeamsSummary(card);
    var ok = function () { flash(btn); toast('Résumé copié dans le presse-papiers'); };
    var ko = function () { toast('Copie impossible — sélectionnez le texte manuellement'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok).catch(function () { if (legacyCopy(text)) ok(); else ko(); });
    } else if (legacyCopy(text)) ok(); else ko();
  });

  /* ------------------------------------------------- Ouverture par ancre # */

  function openFromHash() {
    if (!window.location.hash) return;
    var target = document.getElementById(window.location.hash.slice(1));
    if (target && target.classList.contains('card')) setExpanded(target, true);
  }
  window.addEventListener('hashchange', openFromHash);

  /* ------------------------------------------------------------ Initialisation */

  applyFilters();
  openFromHash();
})();
