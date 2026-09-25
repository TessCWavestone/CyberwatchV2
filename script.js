/* ==========================================================================
   Cyber Watch — site « revue » (FR / EN), sans dépendance externe
   Onglets : L'essentiel · Veille · Carte · Textes applicables · Débats et
   signaux (non certifié, toujours séparé) · Sources.
   Tout est construit à partir des fichiers data/*.js écrits par la collecte.
   ========================================================================== */

(function () {
  'use strict';

  /* ================================================================ données */
  var DATA     = window.VEILLE_ACTUALITES   || { meta: {}, articles: [] };
  var ETAT     = window.VEILLE_ETAT_SOURCES || { sources: [] };
  var SYNTH_FR = window.VEILLE_SYNTHESES    || { groupes: [], glossaire: [] };
  var SYNTH_EN = window.VEILLE_SYNTHESES_EN || null;
  var ACRO     = window.VEILLE_ACRONYMES    || { glossaire: {}, acronymes: [] };
  var REF      = window.VEILLE_REFERENTIEL  || { textes: [], categories: {} };
  var DEBATS   = (window.VEILLE_DEBATS || {}).articles || [];
  var MONDE    = window.VEILLE_MONDE || null;
  var VERSIONS = ((window.VEILLE_VERSIONS || {}).versions || []).slice();
  var GLOSSAIRE = ACRO.glossaire || {};
  var META     = DATA.meta || {};
  var ARTICLES = (DATA.articles || []).filter(function (a) { return a.nature !== 'opinion'; });  // garde-fou : jamais d'avis dans la veille
  var REF_TEXTES = REF.textes || [];
  var THEMES_P = (META.pertinence || {}).themes || {};
  var ORDRE_PERT = { elevee: 0, moyenne: 1, faible: 2 };

  /* ================================================================== langue */
  function langueInitiale() {
    var m = /[?&]lang=(fr|en)/.exec(location.search);
    if (m) return m[1];
    try { var s = localStorage.getItem('cw-lang'); if (s === 'fr' || s === 'en') return s; } catch (e) {}
    return (navigator.language || 'fr').toLowerCase().indexOf('fr') === 0 ? 'fr' : 'en';
  }
  var LANG = langueInitiale();
  document.documentElement.lang = LANG;

  var T = {
    fr: {
      skip: 'Aller au contenu', btn_export: 'Exporter ▾', btn_update: 'Lancer une mise à jour',
      btn_pdf_all: 'La veille complète (PDF)', btn_pdf: 'Les articles affichés (PDF)', btn_excel: 'Les articles affichés (Excel)',
      update_title: 'Ouvre GitHub : cliquez sur « Run workflow » puis patientez quelques minutes',
      version_label: 'Édition', version_current: ' (actuelle)', version_base: 'Base de connaissance initiale',
      version_opt: function (d, n) { return d + ' · ' + n + (n > 1 ? ' nouveautés' : ' nouveauté'); },
      version_banner: function (d, n, tot) { return "Vous lisez l'édition du " + d + ' : ' + tot + ' articles, dont ' + n + ' apportés par cette édition.'; },
      version_base_banner: function (n) { return 'Vous lisez la base de connaissance initiale (depuis le 1er janvier 2026) : ' + n + ' articles.'; },
      version_only: 'Seulement ce que cette édition a apporté', version_git: 'Voir cette édition sur GitHub',
      edition: function (d, n) { return 'Édition du ' + d + ' · ' + n + (n > 1 ? ' nouveaux articles' : ' nouvel article'); },
      no_run: "Aucune collecte pour l'instant.",
      tab_essentiel: "L'essentiel", tab_watch: 'Veille', tab_map: 'Carte', tab_ref: 'Textes applicables', tab_debats: 'Débats et signaux', tab_sources: 'Sources',
      une_title: 'À la une', une_lead: "Les informations les plus importantes du moment, classées automatiquement (sans IA payante) : pertinence pour le client, échéance proche, texte adopté ou en vigueur, source officielle, amende, fraîcheur.",
      une_empty: "Rien de marquant pour l'instant : lancez une collecte.", une_why: 'À la une car : ',
      u_deadline: 'échéance proche', u_pert: 'très pertinent', u_off: 'source officielle', u_fine: 'amende', u_recent: 'tout récent', u_status: 'texte adopté ou en vigueur',
      agenda_title: 'Dates clés', agenda_lead: "Échéances repérées automatiquement dans les textes (« d'ici le… », « applicable from… », « bis zum… ») et dates d'application des textes en vigueur. Les dates approximatives (mois seulement) sont marquées « vers ».",
      h90: '3 mois', h180: '6 mois', h365: '12 mois', hall: 'Tout', agenda_empty: 'Aucune échéance repérée sur cette période.',
      in_days: function (n) { return n === 0 ? "aujourd'hui" : (n > 0 ? 'dans ' + n + ' j' : 'il y a ' + (-n) + ' j'); },
      approx: 'vers', applies: 'Entrée en application : ', kpi_title: 'En chiffres',
      k_recent: function (j) { return 'nouveautés (' + j + ' derniers jours)'; }, k_deadlines: 'échéances dans les 90 jours', k_fines: 'amendes relevées', k_countries: 'pays et zones couverts', k_sources: 'sources lues à la dernière collecte',
      w_recent: 'Nouveautés', w_archives: 'Archives',
      window_recent: function (j) { return 'Publiées ces ' + j + ' derniers jours. Les plus anciennes sont dans « Archives ».'; },
      window_archives: function (j) { return 'Tout ce qui a plus de ' + j + ' jours, depuis le 1er janvier 2026, et les analyses rédigées.'; },
      search_ph: 'Rechercher (NIS2, IVDR, NHS, amende…)', filters: 'Affiner', reset: 'Tout effacer', show_originals: "Textes d'origine (non traduits)",
      sort_date: 'Plus récents', sort_pert: 'Plus pertinents', sort_fine: 'Plus fortes amendes',
      f_pert: 'Pertinence', f_zone: 'Pays / zone', f_theme: 'Thèmes', f_section: 'Rubrique', f_status: 'Statut du texte', f_nature: 'Source', f_fine: 'Amendes',
      more_themes: function (n) { return 'Voir tous les thèmes (' + n + ')'; }, less_themes: 'Réduire',
      pert_badge: { elevee: 'Très pertinent', moyenne: 'Pertinent', faible: 'À surveiller' },
      am_prononcee: 'Amende prononcée', am_plafond: 'Amende maximale prévue', fine_badge: 'Amende ', fine_cap: "Jusqu'à ",
      statuts: { adopte: 'Adopté', en_vigueur: 'En vigueur', projet: 'Projet', consultation: 'Consultation', lignes_directrices: 'Lignes directrices', sanction: 'Sanction', autre: 'Autre' },
      natures: { officielle: 'Source officielle', cabinet: "Cabinet d'avocats", presse: 'Presse et autres', synthese: 'Analyse rédigée', rkc: 'Veille RKC' },
      n_officielle: 'Source officielle', n_cabinet: "Cabinet d'avocats", n_presse: 'Presse et autres', n_opinion: "Avis d'experts (non certifié)",
      shown: function (v, t2) { return v === t2 ? t2 + ' articles' : v + ' articles sur ' + t2; },
      empty: 'Aucun article ne correspond à ces filtres.', no_data: "Aucun article collecté pour l'instant. Lancez la première mise à jour.",
      read_more: 'Lire la suite', close: 'Réduire', read_source: "Lire l'article sur le site source", translate_link: 'Traduire la page source',
      published: 'publié le ', detected: 'détecté le ', no_pubdate: ' (date de publication non trouvée)',
      translated_from: 'Traduit automatiquement de : ', show_original: "Voir le texte d'origine", show_translation: 'Voir la traduction',
      pending_translation: 'Traduction en attente (prochaine collecte)',
      why: 'Pourquoi cet article est là', why_themes: 'Thèmes proches : ', why_kw: 'Mots-clés présents : ',
      why_none: "Aucun mot-clé de la liste : gardé pour ne rien manquer (pertinence estimée d'après le sens du texte).",
      why_base: 'Base de connaissance (recherche documentaire du ', ech_title: 'Dates clés citées',
      rkc_reserve: "Article payant — contenu réservé. Son texte intégral est lu par la veille (pertinence, thèmes, amende, dates clés) mais n'est pas publié ici : il se trouve dans le fichier Word de la veille RKC.", rkc_nolink: 'Article payant sans lien public : texte dans le fichier Word de la veille RKC.',
      rkc_libre: "Article signalé par la veille RKC : lisez-le sur le site source.", badge_payant: 'Payant', rkc_extrait: "Informations tirées du texte intégral (non publié) : pertinence, thèmes, amende et dates clés ci-dessus.",
      base_badge: 'Base 2026', new_badge: 'Nouveau', copy: 'Copier pour Teams', copied: 'Copié', copy_ok: 'Résumé copié', copy_ko: 'Copie impossible',
      source: 'Source', sources: 'Sources', keywords: 'Thèmes', syntheses: 'Analyses rédigées', glossary: 'Glossaire',
      conf: { confirme: 'Confirmé', nuance: 'Nuancé', rapporte: 'Rapporté' },
      map_title: 'Carte de la veille', map_lead: "Couleur = nombre d'articles par pays. Survolez un pays pour voir sa dernière réglementation, cliquez pour ouvrir sa fiche : dernières réglementations, dates clés, textes applicables.",
      map_europe: 'Europe', map_world: 'Monde', p30: '30 jours', p90: '3 mois', pall: 'Tout', map_legend: 'Articles',
      map_hint: 'Choisissez un pays sur la carte.', map_none: 'Aucun article pour cette zone sur la période.', map_top: 'Dernières réglementations',
      map_dates: 'Dates clés à venir', map_ref: 'Textes applicables', map_all: 'Tous les articles', map_latest: 'Dernière : ', map_more: function (n) { return 'Voir les ' + n + ' articles'; },
      map_articles: function (n) { return n + (n > 1 ? ' articles' : ' article'); }, map_nodata: 'Le fond de carte sera téléchargé lors de la prochaine collecte sur GitHub. En attendant, voici une carte simplifiée.',
      ref_title: 'Textes applicables', ref_lead: "Le socle des textes et référentiels qui s'appliquent aujourd'hui dans chaque pays, même sans actualité récente : lois cyber, données, données de santé, exigences des acheteurs de santé et du secteur public envers leurs fournisseurs, dispositifs médicaux, IA, sécurité des produits, entités critiques, certifications. Recherche systématique (10 catégories × 19 zones), complétable dans config/referentiel.json.",
      ref_all_zones: 'Tous les pays et zones', ref_all_cats: 'Toutes les catégories', ref_search_ph: 'Filtrer (nom, acronyme, autorité…)',
      ref_empty: 'Aucun texte pour ce filtre.', btn_excel_ref: 'Exporter (Excel)', ref_none: 'Pas encore de référentiel.',
      ref_summary: function (n, z) { return n + ' textes applicables · ' + z + ' pays et zones'; }, ref_since: 'Applicable depuis ', ref_fine: 'Amende max. : ', ref_pdf: 'Annexe — Textes applicables par pays',
      ref_csv_head: ['Pays / zone', 'Catégorie', 'Texte', 'Acronyme', 'Autorité', 'Applicable depuis', 'Amende max.', 'Pertinence', 'Résumé', 'Pourquoi', 'Lien'],
      deb_warn_title: 'Section non certifiée — avis et suppositions',
      deb_warn: "Cette page rassemble des avis d'experts, prises de position et analyses prospectives (associations professionnelles, think tanks, cabinets). Ce sont des opinions et des hypothèses, pas des informations officielles. Elles ne sont jamais mélangées aux autres onglets, ni prises en compte dans « L'essentiel », la carte ou les textes applicables.",
      deb_title: 'Débats et signaux', deb_lead: "Ce que les experts anticipent ou défendent sur les réglementations à venir. Aucun « ressenti » n'est calculé par une machine : seuls les sujets qui reviennent plus souvent sont comptés.",
      deb_trends: 'Sujets qui montent chez les experts', deb_trends_lead: "Nombre de publications d'experts citant chaque sujet : 60 jours précédents → 60 derniers jours. Un simple comptage, sans interprétation.",
      deb_list: 'Dernières prises de position', deb_search_ph: 'Filtrer les avis…', deb_empty: "Aucun avis d'expert collecté pour l'instant : ils apparaîtront après la prochaine collecte.",
      deb_mention: "Avis d'expert — supposition, non certifié", deb_none_trend: 'Pas encore assez de publications pour dégager des tendances.', deb_pdf: 'Annexe — Débats et signaux (NON CERTIFIÉ : avis et suppositions)',
      src_title: 'Sources de la veille', src_lead: "Toutes les sources (Excel, ajouts faits depuis ce site, veille RKC) et leur accessibilité lors de la dernière collecte. Vous pouvez ajouter ou retirer une source : c'est pris en compte à la collecte suivante.",
      src_summary: function (q, n) { return (q ? 'Dernière collecte : ' + q + ' · ' : '') + n + ' sources'; }, src_none: 'La liste apparaîtra après la première collecte.',
      s_all: 'Toutes', s_ok: 'Accessibles', s_partial: 'Partielles', s_ko: 'Inaccessibles', s_other: 'Ignorées', src_search_ph: 'Filtrer par nom ou pays…', src_empty: 'Aucune source ne correspond.',
      st_ok: 'accessibles', st_partial: 'partielles', st_ko: 'inaccessibles', st_other: 'ignorées ou retirées',
      th_access: 'Accès', th_source: 'Source', th_zone: 'Zone', th_read: 'Lecture', th_found: 'Trouvés', th_new: 'Nouveaux', th_detail: 'Détail', th_action: 'Action',
      a_ok: '✓ Accessible', a_partial: '◐ Partielle', a_ko: '✗ Inaccessible', a_nc: '○ Non configurée', a_off: '— Ignorée', a_wait: '… Pas encore lue', a_removed: '⊘ Retirée',
      m_rss: 'Flux RSS', m_rssauto: 'Flux RSS découvert', m_rsspage: 'Flux RSS + pages', m_page: 'Surveillance de page', m_err: 'Inaccessible', m_api: 'API officielle', m_rkc: 'Fichiers déposés',
      d_feed: 'Flux : ', d_pages: 'Pages : ', added_site: 'ajoutée sur le site', opinion_src: "avis d'experts",
      trad_ok: function (n, w) { return 'Traduction automatique : ' + n + ' textes traduits lors de la dernière collecte' + (w ? ', ' + w + ' en attente.' : '.'); },
      trad_off: 'Traduction automatique indisponible lors de la dernière collecte. ',
      src_add: '+ Ajouter une source', src_token: 'Jeton GitHub', src_form_title: 'Nouvelle source',
      sf_name: 'Nom de la source *', sf_zone: 'Pays / zone *', sf_type: 'Type de source', sf_url: 'Adresse du site *',
      sf_feeds: 'Flux RSS (facultatif, un par ligne)', sf_pages: "Pages d'actualités datées (facultatif, une par ligne)",
      sf_hint: "La source sera lue à la prochaine collecte. Choisissez « Avis d'experts » pour une source d'opinion : ses articles iront uniquement dans « Débats et signaux ».",
      sf_submit: 'Ajouter…', cancel: 'Annuler', confirm: 'Confirmer', sf_err: 'Renseignez au moins le nom, le pays et une adresse commençant par https://',
      src_remove: 'Retirer', src_restore: 'Rétablir',
      mode_token: 'Mode : modification directe (jeton enregistré dans ce navigateur)', mode_issue: 'Mode : proposition via GitHub', mode_none: 'Dépôt GitHub inconnu : il apparaîtra après la première collecte.',
      confirm_add_t: 'Ajouter cette source ?', confirm_rm_t: 'Retirer cette source ?', confirm_rs_t: 'Rétablir cette source ?',
      confirm_add: function (n, u) { return '« ' + n + ' » (' + u + ') sera lue à partir de la prochaine collecte.'; },
      confirm_rm: function (n) { return '« ' + n + ' » ne sera plus lue à partir de la prochaine collecte. Les articles déjà collectés restent. Vous pourrez la rétablir.'; },
      confirm_rs: function (n) { return '« ' + n + ' » sera de nouveau lue à partir de la prochaine collecte.'; },
      via_token: 'La modification est enregistrée directement dans le dépôt GitHub.',
      via_issue: "GitHub va s'ouvrir avec une demande pré-remplie : cliquez sur « Submit new issue ». Collaborateur du dépôt : appliquée automatiquement ; sinon, en attente de validation (étiquette « approuvé »).",
      saved_ok: 'Enregistré : pris en compte à la prochaine collecte.', saved_ko: "Échec de l'enregistrement : ", opened_gh: "Demande préparée sur GitHub : validez-la dans l'onglet ouvert.",
      token_t: 'Jeton GitHub', token_help: "Pour modifier les sources directement, collez un jeton GitHub « fine-grained » (gratuit) limité à ce dépôt, avec Contents : Read and write. Il reste dans ce navigateur. Laissez vide pour l'effacer.",
      token_saved: 'Jeton enregistré.', token_cleared: 'Jeton effacé.',
      acro_title: 'Acronymes détectés', ac_all: 'Tous', ac_new: 'Nouveaux (7 jours)', ac_out: 'Conservés tels quels', ac_search_ph: 'Filtrer…',
      acro_lead: "Acronymes repérés dans les articles. Ils ne sont jamais traduits ; les variantes nationales d'un même texte sont harmonisées via config/acronymes.json (ΓΚΠΔ → GDPR).",
      ac_th_acro: 'Acronyme', ac_th_var: 'Variantes', ac_th_n: 'Articles', ac_th_lang: 'Langues', ac_th_first: 'Vu la 1re fois', ac_th_glo: 'Glossaire', ac_th_ex: 'Exemple',
      ac_empty: 'Aucun acronyme.', ac_in: '✓ Harmonisé', ac_todo: 'Tel quel', ac_summary: function (n, nv) { return n + ' acronymes · ' + nv + ' nouveaux cette semaine'; },
      method: 'Méthode', method_lead: 'Comment la veille est collectée, notée et présentée — gratuitement, sans IA payante ni clé API.',
      footer: 'Cyber Watch — Wavestone · collecte, notation et traduction automatiques et gratuites.', footer_note: "Ce site ne constitue pas un conseil juridique. Les avis d'experts (onglet Débats et signaux) ne sont pas des informations certifiées.",
      nothing_export: 'Aucun article à exporter', exported: ' articles exportés', too_many: "Trop d'articles : filtrez d'abord (max. 300)",
      pdf_title: "Cyber Watch — sélection d'articles", pdf_all_title: 'Cyber Watch — la veille complète', pdf_generated: 'Généré le ', pdf_count: ' articles', pdf_toc: 'Sommaire', pdf_agenda: 'Dates clés à venir',
      csv_head: ['Date', 'Rubrique', 'Pertinence', 'Titre', "Titre d'origine", 'Langue', 'Source', 'Pays / zone', 'Nature', 'Statut', 'Amende', 'Amende (€, estimation)', 'Dates clés', 'Pourquoi', 'Thèmes', 'Lien', 'Résumé'],
      robust_err: "Une partie de la page n'a pas pu s'afficher : ", at: ' à ', no_date: 'Sans date',
      method_html: [
        ['Collecte', "<p>Chaque lundi à 7 h (et à la demande), un script lit toutes les sources : flux RSS, pages d'actualités datées, API Légifrance, et les veilles RKC déposées dans un dépôt privé. La base couvre toute l'actualité depuis le 1er janvier 2026 : recherche documentaire vérifiée (badge « Base 2026 ») et rattrapage des archives de chaque source.</p>"],
        ["Rien n'est écarté", "<p>Tous les articles sont gardés. Chacun reçoit une pertinence (très pertinent, pertinent, à surveiller) calculée par un petit modèle d'IA open source et gratuit exécuté sur GitHub, qui compare le sens de l'article aux thèmes du client (dont les exigences des acheteurs de santé et du secteur public). Les mots-clés justifient la présence de l'article, ils ne décident pas seuls.</p>"],
        ["L'essentiel", "<p>« À la une » et « Dates clés » sont calculés par des règles fixes, sans IA générative : pertinence, échéance proche (dates repérées automatiquement dans les textes, dans toutes les langues), statut du texte, source officielle, amende, fraîcheur. Les dates « vers » sont approximatives (mois seulement).</p>"],
        ['Nouveautés et archives', "<p>« Nouveautés » montre les 30 derniers jours (60 s'il y a peu d'articles) ; tout le reste est dans « Archives ». Chaque collecte crée une édition, consultable dans le sélecteur « Édition ».</p>"],
        ['Débats et signaux', "<p>Les avis d'experts viennent uniquement de sources classées « Avis d'experts (non certifié) ». Ils sont stockés à part et n'apparaissent jamais dans la veille, la carte, L'essentiel ni les textes applicables. Les tendances sont de simples comptages de sujets, sans interprétation.</p>"],
        ['Veille RKC', "<p>Les mails et fichiers Word de la veille RKC sont lus dans un dépôt privé. Seuls le titre, le lien, la date, la note et les thèmes sont publiés : le texte des articles, souvent payants, n'apparaît jamais sur ce site.</p>"],
        ['Traduction et limites', "<p>Titres et résumés sont traduits par un moteur libre (Argos Translate) ; les acronymes ne sont jamais traduits. Pertinence, traduction et dates clés sont automatiques : en cas de doute, lisez la source. Les montants convertis sont des estimations.</p>"]
      ]
    },
    en: {
      skip: 'Skip to content', btn_export: 'Export ▾', btn_update: 'Run an update',
      btn_pdf_all: 'The full watch (PDF)', btn_pdf: 'Articles shown (PDF)', btn_excel: 'Articles shown (Excel)',
      update_title: 'Opens GitHub: click “Run workflow”, then wait a few minutes',
      version_label: 'Edition', version_current: ' (current)', version_base: 'Initial knowledge base',
      version_opt: function (d, n) { return d + ' · ' + n + ' new'; },
      version_banner: function (d, n, tot) { return 'You are reading the edition of ' + d + ': ' + tot + ' articles, ' + n + ' of them added by this edition.'; },
      version_base_banner: function (n) { return 'You are reading the initial knowledge base (since 1 January 2026): ' + n + ' articles.'; },
      version_only: 'Only what this edition added', version_git: 'View this edition on GitHub',
      edition: function (d, n) { return 'Edition of ' + d + ' · ' + n + ' new article' + (n > 1 ? 's' : ''); },
      no_run: 'No collection yet.',
      tab_essentiel: 'Key points', tab_watch: 'Watch', tab_map: 'Map', tab_ref: 'Applicable texts', tab_debats: 'Debates & signals', tab_sources: 'Sources',
      une_title: 'Top stories', une_lead: 'The most important items right now, ranked automatically (no paid AI): relevance for the client, upcoming deadline, adopted or in-force text, official source, fine, freshness.',
      une_empty: 'Nothing notable yet: run a collection.', une_why: 'On top because: ',
      u_deadline: 'deadline soon', u_pert: 'highly relevant', u_off: 'official source', u_fine: 'fine', u_recent: 'brand new', u_status: 'adopted or in force',
      agenda_title: 'Key dates', agenda_lead: 'Deadlines detected automatically in the texts (“by…”, “applicable from…”, “bis zum…”) and application dates of texts in force. Approximate dates (month only) are marked “around”.',
      h90: '3 months', h180: '6 months', h365: '12 months', hall: 'All', agenda_empty: 'No deadline found for this period.',
      in_days: function (n) { return n === 0 ? 'today' : (n > 0 ? 'in ' + n + ' d' : (-n) + ' d ago'); },
      approx: 'around', applies: 'Applies from: ', kpi_title: 'In figures',
      k_recent: function (j) { return 'new items (last ' + j + ' days)'; }, k_deadlines: 'deadlines within 90 days', k_fines: 'fines reported', k_countries: 'countries & areas covered', k_sources: 'sources read at last collection',
      w_recent: 'Latest', w_archives: 'Archive',
      window_recent: function (j) { return 'Published in the last ' + j + ' days. Older items are in “Archive”.'; },
      window_archives: function (j) { return 'Everything older than ' + j + ' days, since 1 January 2026, and the written analyses.'; },
      search_ph: 'Search (NIS2, IVDR, NHS, fine…)', filters: 'Refine', reset: 'Clear all', show_originals: 'Original texts (untranslated)',
      sort_date: 'Newest', sort_pert: 'Most relevant', sort_fine: 'Largest fines',
      f_pert: 'Relevance', f_zone: 'Country / area', f_theme: 'Topics', f_section: 'Section', f_status: 'Status of the text', f_nature: 'Source', f_fine: 'Fines',
      more_themes: function (n) { return 'Show all topics (' + n + ')'; }, less_themes: 'Show fewer',
      pert_badge: { elevee: 'Highly relevant', moyenne: 'Relevant', faible: 'To monitor' },
      am_prononcee: 'Fine imposed', am_plafond: 'Maximum fine provided', fine_badge: 'Fine ', fine_cap: 'Up to ',
      statuts: { adopte: 'Adopted', en_vigueur: 'In force', projet: 'Draft', consultation: 'Consultation', lignes_directrices: 'Guidelines', sanction: 'Enforcement', autre: 'Other' },
      natures: { officielle: 'Official source', cabinet: 'Law firm', presse: 'Press & other', synthese: 'Written analysis', rkc: 'RKC watch' },
      n_officielle: 'Official source', n_cabinet: 'Law firm', n_presse: 'Press & other', n_opinion: 'Expert opinion (not certified)',
      shown: function (v, t2) { return v === t2 ? t2 + ' articles' : v + ' of ' + t2 + ' articles'; },
      empty: 'No article matches these filters.', no_data: 'No article collected yet. Run the first update.',
      read_more: 'Read more', close: 'Close', read_source: 'Read the article on the source website', translate_link: 'Translate the source page',
      published: 'published ', detected: 'detected ', no_pubdate: ' (publication date not found)',
      translated_from: 'Machine-translated from: ', show_original: 'Show original text', show_translation: 'Show translation',
      pending_translation: 'Translation pending (next collection)',
      why: 'Why this article is here', why_themes: 'Closest themes: ', why_kw: 'Keywords found: ',
      why_none: 'No keyword from the list: kept so that nothing is missed (relevance estimated from the meaning of the text).',
      why_base: 'Knowledge base (desk research of ', ech_title: 'Key dates mentioned',
      rkc_reserve: 'Paywalled article — restricted content. Its full text is read by the watch (relevance, topics, fine, key dates) but not published here: it is in the RKC watch Word file.', rkc_nolink: 'Paywalled article with no public link: text in the RKC watch Word file.',
      rkc_libre: 'Article flagged by the RKC watch: read it on the source website.', badge_payant: 'Paywalled', rkc_extrait: 'Information drawn from the full (unpublished) text: relevance, topics, fine and key dates above.',
      base_badge: '2026 base', new_badge: 'New', copy: 'Copy for Teams', copied: 'Copied', copy_ok: 'Summary copied', copy_ko: 'Copy failed',
      source: 'Source', sources: 'Sources', keywords: 'Topics', syntheses: 'Written analyses', glossary: 'Glossary',
      conf: { confirme: 'Confirmed', nuance: 'Qualified', rapporte: 'Reported' },
      map_title: 'Watch map', map_lead: 'Colour = number of articles per country. Hover a country to see its latest regulation; click to open its card: latest regulations, key dates, applicable texts.',
      map_europe: 'Europe', map_world: 'World', p30: '30 days', p90: '3 months', pall: 'All', map_legend: 'Articles',
      map_hint: 'Choose a country on the map.', map_none: 'No article for this area over the period.', map_top: 'Latest regulations',
      map_dates: 'Upcoming key dates', map_ref: 'Applicable texts', map_all: 'All articles', map_latest: 'Latest: ', map_more: function (n) { return 'Show all ' + n + ' articles'; },
      map_articles: function (n) { return n + ' article' + (n > 1 ? 's' : ''); }, map_nodata: 'The base map will be downloaded at the next collection on GitHub. Meanwhile, here is a simplified map.',
      ref_title: 'Applicable texts', ref_lead: 'The baseline of texts and frameworks that apply today in each country, even without recent news: cyber laws, data, health data, requirements that healthcare buyers and the public sector set for their suppliers, medical devices, AI, product security, critical entities, certifications. Systematic research (10 categories × 19 areas); can be completed in config/referentiel.json.',
      ref_all_zones: 'All countries and areas', ref_all_cats: 'All categories', ref_search_ph: 'Filter (name, acronym, authority…)',
      ref_empty: 'No text for this filter.', btn_excel_ref: 'Export (Excel)', ref_none: 'No baseline yet.',
      ref_summary: function (n, z) { return n + ' applicable texts · ' + z + ' countries and areas'; }, ref_since: 'Applies since ', ref_fine: 'Max. fine: ', ref_pdf: 'Annex — Applicable texts by country',
      ref_csv_head: ['Country / area', 'Category', 'Text', 'Acronym', 'Authority', 'Applies since', 'Max. fine', 'Relevance', 'Summary', 'Why', 'Link'],
      deb_warn_title: 'Not certified — opinions and assumptions',
      deb_warn: 'This page gathers expert opinions, position papers and forward-looking analyses (trade associations, think tanks, law firms). They are opinions and assumptions, not official information. They are never mixed with the other tabs, nor used in “Key points”, the map or the applicable texts.',
      deb_title: 'Debates & signals', deb_lead: 'What experts anticipate or advocate about upcoming regulations. No machine-computed “sentiment”: only how often topics come up is counted.',
      deb_trends: 'Topics rising among experts', deb_trends_lead: 'Number of expert publications mentioning each topic: previous 60 days → last 60 days. A plain count, with no interpretation.',
      deb_list: 'Latest positions', deb_search_ph: 'Filter opinions…', deb_empty: 'No expert opinion collected yet: they will appear after the next collection.',
      deb_mention: 'Expert opinion — assumption, not certified', deb_none_trend: 'Not enough publications yet to show trends.', deb_pdf: 'Annex — Debates & signals (NOT CERTIFIED: opinions and assumptions)',
      src_title: 'Watch sources', src_lead: 'Every source (spreadsheet, additions made on this site, RKC watch) and whether it could be read during the last collection. You can add or remove a source: it applies from the next collection.',
      src_summary: function (q, n) { return (q ? 'Last collection: ' + q + ' · ' : '') + n + ' sources'; }, src_none: 'The list will appear after the first collection.',
      s_all: 'All', s_ok: 'Reachable', s_partial: 'Partial', s_ko: 'Unreachable', s_other: 'Ignored', src_search_ph: 'Filter by name or country…', src_empty: 'No source matches.',
      st_ok: 'reachable', st_partial: 'partial', st_ko: 'unreachable', st_other: 'ignored or removed',
      th_access: 'Access', th_source: 'Source', th_zone: 'Area', th_read: 'Read via', th_found: 'Found', th_new: 'New', th_detail: 'Details', th_action: 'Action',
      a_ok: '✓ Reachable', a_partial: '◐ Partial', a_ko: '✗ Unreachable', a_nc: '○ Not configured', a_off: '— Ignored', a_wait: '… Not read yet', a_removed: '⊘ Removed',
      m_rss: 'RSS feed', m_rssauto: 'RSS feed (discovered)', m_rsspage: 'RSS feed + pages', m_page: 'Page monitoring', m_err: 'Unreachable', m_api: 'Official API', m_rkc: 'Uploaded files',
      d_feed: 'Feed: ', d_pages: 'Pages: ', added_site: 'added on site', opinion_src: 'expert opinion',
      trad_ok: function (n, w) { return 'Machine translation: ' + n + ' texts translated at the last collection' + (w ? ', ' + w + ' pending.' : '.'); },
      trad_off: 'Machine translation was unavailable at the last collection. ',
      src_add: '+ Add a source', src_token: 'GitHub token', src_form_title: 'New source',
      sf_name: 'Source name *', sf_zone: 'Country / area *', sf_type: 'Type of source', sf_url: 'Website address *',
      sf_feeds: 'RSS feeds (optional, one per line)', sf_pages: 'Dated news pages (optional, one per line)',
      sf_hint: 'The source will be read at the next collection. Choose “Expert opinion” for an opinion source: its articles will only go to “Debates & signals”.',
      sf_submit: 'Add…', cancel: 'Cancel', confirm: 'Confirm', sf_err: 'Fill in at least the name, the country and an address starting with https://',
      src_remove: 'Remove', src_restore: 'Restore',
      mode_token: 'Mode: direct edit (token saved in this browser)', mode_issue: 'Mode: proposal through GitHub', mode_none: 'GitHub repository unknown: it will appear after the first collection.',
      confirm_add_t: 'Add this source?', confirm_rm_t: 'Remove this source?', confirm_rs_t: 'Restore this source?',
      confirm_add: function (n, u) { return '“' + n + '” (' + u + ') will be read from the next collection onwards.'; },
      confirm_rm: function (n) { return '“' + n + '” will no longer be read from the next collection onwards. Collected articles stay. You can restore it.'; },
      confirm_rs: function (n) { return '“' + n + '” will be read again from the next collection onwards.'; },
      via_token: 'The change is saved directly in the GitHub repository.',
      via_issue: 'GitHub will open with a pre-filled request: click “Submit new issue”. Repository collaborator: applied automatically; otherwise it waits for approval (“approuvé” label).',
      saved_ok: 'Saved: applied at the next collection.', saved_ko: 'Could not save: ', opened_gh: 'Request prepared on GitHub: submit it in the new tab.',
      token_t: 'GitHub token', token_help: 'To edit sources directly, paste a free GitHub “fine-grained” token restricted to this repository, with Contents: Read and write. It stays in this browser. Leave empty to delete it.',
      token_saved: 'Token saved.', token_cleared: 'Token deleted.',
      acro_title: 'Detected acronyms', ac_all: 'All', ac_new: 'New (7 days)', ac_out: 'Kept as is', ac_search_ph: 'Filter…',
      acro_lead: 'Acronyms found in the articles. They are never translated; national variants of the same act are harmonised through config/acronymes.json (ΓΚΠΔ → GDPR).',
      ac_th_acro: 'Acronym', ac_th_var: 'Variants', ac_th_n: 'Articles', ac_th_lang: 'Languages', ac_th_first: 'First seen', ac_th_glo: 'Glossary', ac_th_ex: 'Example',
      ac_empty: 'No acronym.', ac_in: '✓ Harmonised', ac_todo: 'As is', ac_summary: function (n, nv) { return n + ' acronyms · ' + nv + ' new this week'; },
      method: 'Method', method_lead: 'How the watch is collected, rated and presented — free of charge, with no paid AI and no API key.',
      footer: 'Cyber Watch — Wavestone · free automated collection, rating and translation.', footer_note: 'This site does not constitute legal advice. Expert opinions (Debates & signals tab) are not certified information.',
      nothing_export: 'No article to export', exported: ' articles exported', too_many: 'Too many articles: filter first (max. 300)',
      pdf_title: 'Cyber Watch — selected articles', pdf_all_title: 'Cyber Watch — the full watch', pdf_generated: 'Generated on ', pdf_count: ' articles', pdf_toc: 'Contents', pdf_agenda: 'Upcoming key dates',
      csv_head: ['Date', 'Section', 'Relevance', 'Title', 'Original title', 'Language', 'Source', 'Country / area', 'Type', 'Status', 'Fine', 'Fine (€, estimate)', 'Key dates', 'Why', 'Topics', 'Link', 'Summary'],
      robust_err: 'Part of the page could not be displayed: ', at: ' at ', no_date: 'No date',
      method_html: [
        ['Collection', '<p>Every Monday at 7 am (and on demand), a script reads every source: RSS feeds, dated news pages, the Légifrance API, and the RKC watch files stored in a private repository. The database covers all news since 1 January 2026: verified desk research (“2026 base” badge) plus a catch-up of each source’s archives.</p>'],
        ['Nothing is discarded', '<p>Every article is kept. Each gets a relevance rating (highly relevant, relevant, to monitor) computed by a small, free, open-source AI model running on GitHub, which compares the meaning of the article with the client’s themes (including requirements set by healthcare buyers and the public sector). Keywords justify why an article is here; they never decide alone.</p>'],
        ['Key points', '<p>“Top stories” and “Key dates” are computed with fixed rules, no generative AI: relevance, upcoming deadline (dates detected automatically in the texts, in every language), status, official source, fine, freshness. Dates marked “around” are approximate (month only).</p>'],
        ['Latest and archive', '<p>“Latest” shows the last 30 days (60 when there are few articles); everything else is in “Archive”. Each collection creates an edition, available in the “Edition” selector.</p>'],
        ['Debates & signals', '<p>Expert opinions come only from sources classified as “Expert opinion (not certified)”. They are stored separately and never appear in the watch, the map, Key points or applicable texts. Trends are plain topic counts, with no interpretation.</p>'],
        ['RKC watch', '<p>RKC e-mails and Word files are read from a private repository. Only the title, link, date, rating and topics are published: the text of the articles, often paywalled, never appears on this site.</p>'],
        ['Translation and limits', '<p>Titles and summaries are translated by a free engine (Argos Translate); acronyms are never translated. Relevance, translation and key dates are automatic: when in doubt, read the source. Converted amounts are estimates.</p>']
      ]
    }
  };
  function t(k) { return (T[LANG] && T[LANG][k] !== undefined) ? T[LANG][k] : T.fr[k]; }

  var MOIS = {
    fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  };
  var MOIS_COURT = {
    fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  };
  var LANGUES = {
    fr: { fr: 'français', en: 'anglais', de: 'allemand', es: 'espagnol', it: 'italien', pt: 'portugais', nl: 'néerlandais', pl: 'polonais', cs: 'tchèque', el: 'grec', hu: 'hongrois', da: 'danois', sv: 'suédois', nb: 'norvégien', fi: 'finnois', bg: 'bulgare' },
    en: { fr: 'French', en: 'English', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese', nl: 'Dutch', pl: 'Polish', cs: 'Czech', el: 'Greek', hu: 'Hungarian', da: 'Danish', sv: 'Swedish', nb: 'Norwegian', fi: 'Finnish', bg: 'Bulgarian' }
  };

  /* Pays / zones : nom dans les données -> code, libellés, identifiant ISO numérique (fond de carte), position de secours */
  var ZONES = {
    'Norvège':      { code: 'NO', iso: 578, fr: 'Norvège', en: 'Norway', x: 5, y: 1 },
    'Suède':        { code: 'SE', iso: 752, fr: 'Suède', en: 'Sweden', x: 6, y: 1 },
    'Finlande':     { code: 'FI', iso: 246, fr: 'Finlande', en: 'Finland', x: 7, y: 1 },
    'Royaume-Uni':  { code: 'UK', iso: 826, fr: 'Royaume-Uni', en: 'United Kingdom', x: 3, y: 2 },
    'Danemark':     { code: 'DK', iso: 208, fr: 'Danemark', en: 'Denmark', x: 5, y: 2 },
    'Pays-Bas':     { code: 'NL', iso: 528, fr: 'Pays-Bas', en: 'Netherlands', x: 4, y: 3 },
    'Allemagne':    { code: 'DE', iso: 276, fr: 'Allemagne', en: 'Germany', x: 5, y: 3 },
    'Pologne':      { code: 'PL', iso: 616, fr: 'Pologne', en: 'Poland', x: 6, y: 3 },
    'Belgique':     { code: 'BE', iso: 56, fr: 'Belgique', en: 'Belgium', x: 4, y: 4 },
    'Rép. Tchèque': { code: 'CZ', iso: 203, fr: 'Rép. tchèque', en: 'Czechia', x: 6, y: 4 },
    'France':       { code: 'FR', iso: 250, fr: 'France', en: 'France', x: 3, y: 5 },
    'Suisse':       { code: 'CH', iso: 756, fr: 'Suisse', en: 'Switzerland', x: 4, y: 5 },
    'Autriche':     { code: 'AT', iso: 40, fr: 'Autriche', en: 'Austria', x: 5, y: 5 },
    'Hongrie':      { code: 'HU', iso: 348, fr: 'Hongrie', en: 'Hungary', x: 6, y: 5 },
    'Portugal':     { code: 'PT', iso: 620, fr: 'Portugal', en: 'Portugal', x: 1, y: 6 },
    'Espagne':      { code: 'ES', iso: 724, fr: 'Espagne', en: 'Spain', x: 2, y: 6 },
    'Italie':       { code: 'IT', iso: 380, fr: 'Italie', en: 'Italy', x: 5, y: 6 },
    'Bulgarie':     { code: 'BG', iso: 100, fr: 'Bulgarie', en: 'Bulgaria', x: 7, y: 6 },
    'Grèce':        { code: 'GR', iso: 300, fr: 'Grèce', en: 'Greece', x: 7, y: 7 },
    'Europe':       { code: 'EU', fr: 'Union européenne', en: 'European Union', side: true },
    'Worldwide':    { code: 'INT', fr: 'International', en: 'International', side: true }
  };
  var ZONE_PAR_ISO = {};
  Object.keys(ZONES).forEach(function (z) { if (ZONES[z].iso) ZONE_PAR_ISO[ZONES[z].iso] = z; });
  function nomZone(z) { var d = ZONES[z]; return d ? d[LANG] : (z || '—'); }
  function codeZone(z) { var d = ZONES[z]; return d ? d.code : ''; }

  /* ================================================================ utilitaires */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') node.textContent = v;
      else if (k === 'className') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else node.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }
  function svgEl(tag, attrs) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function isoToDate(iso) { var p = (iso || '').split('-'); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
  function dateLongue(iso) {
    var d = isoToDate(iso); if (!d) return '';
    return LANG === 'en' ? d.getDate() + ' ' + MOIS.en[d.getMonth()] + ' ' + d.getFullYear() : d.getDate() + ' ' + MOIS.fr[d.getMonth()] + ' ' + d.getFullYear();
  }
  function dateCourte(iso) { var d = isoToDate(iso); return d ? d.getDate() + ' ' + MOIS_COURT[LANG][d.getMonth()] : ''; }
  function moisAnnee(iso) {
    var d = isoToDate(iso); if (!d) return t('no_date');
    var m = MOIS[LANG][d.getMonth()]; return m.charAt(0).toUpperCase() + m.slice(1) + ' ' + d.getFullYear();
  }
  function texteToIso(txt) {
    var m = /(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(\d{4})/i.exec(txt || ''); if (!m) return '';
    var i = MOIS.fr.indexOf(m[2].toLowerCase()); if (i < 0) return '';
    return m[3] + '-' + ('0' + (i + 1)).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  }
  function normaliser(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  var aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0);
  function joursDepuis(iso) { var d = isoToDate(iso); return d ? Math.round((aujourdhui - d) / 86400000) : 99999; }
  function joursJusqua(iso) { return -joursDepuis(iso); }
  function horodatage(isoDateTime) {
    var d = new Date(isoDateTime); if (isNaN(d)) return isoDateTime || '';
    var loc = LANG === 'en' ? 'en-GB' : 'fr-FR';
    return d.toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' }) + t('at') + d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  }
  function jourSeul(isoDateTime) {
    var d = new Date(isoDateTime); if (isNaN(d)) return isoDateTime || '';
    return d.toLocaleDateString(LANG === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  function libelleTag(tag) { return LANG === 'en' ? ((META.libelles_en || {})[tag] || tag) : tag; }
  function montantCourt(v) {
    if (v === undefined || v === null || v === '') return '';
    var dec = LANG === 'en' ? '.' : ',';
    function f(x) { return (Math.round(x * 10) / 10).toString().replace('.', dec); }
    if (v >= 1e9) return LANG === 'en' ? '€' + f(v / 1e9) + 'bn' : f(v / 1e9) + ' Md€';
    if (v >= 1e6) return LANG === 'en' ? '€' + f(v / 1e6) + 'M' : f(v / 1e6) + ' M€';
    if (v >= 1e3) return LANG === 'en' ? '€' + Math.round(v / 1e3) + 'k' : Math.round(v / 1e3) + ' k€';
    return LANG === 'en' ? '€' + v : v + ' €';
  }
  var toastTimer = null;
  function toast(message) {
    var z = document.getElementById('toast'); z.textContent = message; z.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { z.hidden = true; }, 2600);
  }
  function sur(nom, fn, defaut) {
    try { return fn(); } catch (e) {
      if (window.console) console.error('[Cyber Watch] ' + nom, e);
      toast(t('robust_err') + nom);
      return defaut;
    }
  }

  /* ============================================ acronymes et thèmes (filtre unique) */
  var RE_ACRO = /(?<![\p{L}\p{N}_-])(ISO(?:\/IEC)?\s?\d{4,5}(?:-\d+)?|[A-ZÀ-ÖØ-ÞΑ-ΩΆ-Ώ][A-ZÀ-ÖØ-ÞΑ-ΩΆ-Ώ0-9\/]{1,7}(?:\s?\d+)?(?:-[\p{L}\p{N}_]+)*)(?![\p{L}\p{N}_])/gu;
  var MOTS_MAJ = ['THE', 'AND', 'FOR', 'NEW', 'DE', 'LA', 'LE', 'LES', 'ET', 'DES', 'DU', 'EN', 'UN', 'UNE', 'DER', 'DIE', 'DAS', 'UND', 'EL', 'LOS', 'DEL', 'IL', 'DI', 'OF', 'TO', 'IN', 'ON', 'AT', 'UPDATE', 'NEWS', 'PDF', 'EU', 'UE', 'UK'];
  function acronymesDe(texte) {
    if (!texte) return [];
    var lettres = texte.replace(/[^\p{L}]/gu, ''), maj = texte.replace(/[^\p{Lu}]/gu, '');
    var toutMaj = lettres.length > 12 && maj.length / lettres.length > 0.8;
    var out = [], m; RE_ACRO.lastIndex = 0;
    while ((m = RE_ACRO.exec(texte))) {
      var brut = /^ISO/i.test(m[1]) ? m[1].replace(/\s+/g, ' ') : m[1].replace(/^([^\d\s-]+)[\s-]+(\d{1,2})$/, '$1$2');
      if (brut.indexOf('-') !== -1) brut = brut.split('-')[0];
      if (MOTS_MAJ.indexOf(brut.toUpperCase()) !== -1 || /^[IVXLC]+$/.test(brut) || (toutMaj && !GLOSSAIRE[brut])) continue;
      var code = (GLOSSAIRE[brut] && GLOSSAIRE[brut].en) || brut;
      if (out.indexOf(code) === -1) out.push(code);
    }
    return out;
  }
  var ACRO_INFO = {};
  (ACRO.acronymes || []).forEach(function (e) { ACRO_INFO[e.code] = e; });
  function libelleAcro(code) {
    if (LANG === 'fr') {
      if (ACRO_INFO[code] && ACRO_INFO[code].fr) return ACRO_INFO[code].fr;
      if (GLOSSAIRE[code] && GLOSSAIRE[code].fr) return GLOSSAIRE[code].fr;
    }
    return code;
  }
  /* Un seul filtre « Thèmes » : acronymes (forme harmonisée) + mots-clés, sans doublon (RGPD = GDPR) */
  function cleTheme(x) { var g = GLOSSAIRE[x]; return 'k:' + normaliser((g && g.en) || x); }
  var LIB_THEME = {};
  function themesDe(a) {
    var cles = [];
    function ajoute(val, estAcro) {
      if (!val) return;
      var k = cleTheme(val);
      if (!LIB_THEME[k]) LIB_THEME[k] = { acro: estAcro || !!GLOSSAIRE[val], val: (GLOSSAIRE[val] && GLOSSAIRE[val].en) || val };
      if (cles.indexOf(k) === -1) cles.push(k);
    }
    (a.acronymes || acronymesDe(a.titre + ' ' + (a.resume || ''))).forEach(function (c) { ajoute(c, true); });
    (a.tags || []).forEach(function (tg) { ajoute(tg, false); });
    return cles;
  }
  function libelleTheme(k) { var i = LIB_THEME[k]; if (!i) return k.slice(2); return i.acro ? libelleAcro(i.val) : libelleTag(i.val); }

  /* ========================================================= textes d'un article */
  function textes(a) {
    var orig = { titre: a.titre, resume: a.resume || '' };
    if (!a.langue || a.langue === LANG) return { aff: orig, orig: orig, traduit: false };
    var tr = a.trad && a.trad[LANG];
    if (tr && tr.titre) return { aff: { titre: tr.titre, resume: tr.resume || '' }, orig: orig, traduit: true, de: a.langue };
    return { aff: orig, orig: orig, traduit: false, attente: true, de: a.langue };
  }
  function nomTheme(id) { var th = THEMES_P[id]; return th ? (th[LANG] || th.fr) : id; }
  function libStatut(st) { return (t('statuts') || {})[st] || st; }
  function libNature(n) { return (t('natures') || {})[n] || n; }
  function badge(cls, texte, titre) { return el('span', { className: 'badge ' + cls, text: texte, title: titre || null }); }
  function badgeAmende(a, petit) {
    if (!a.amende) return null;
    return badge('badge-fine' + (a.amende.plafond ? ' badge-fine-cap' : '') + (petit ? ' badge-sm' : ''),
      (a.amende.plafond ? t('fine_cap') : t('fine_badge')) + montantCourt(a.amende.montant_eur), a.amende.texte);
  }
  function badgePert(a, petit) { return a.pertinence ? badge('badge-p-' + a.pertinence + (petit ? ' badge-sm' : ''), t('pert_badge')[a.pertinence]) : null; }
  function texteAmende(a) {
    if (!a.amende) return '';
    var lab = a.amende.plafond ? t('fine_cap') : t('fine_badge');
    if (LANG === 'en' && a.base) return lab + montantCourt(a.amende.montant_eur);
    return lab + a.amende.texte;
  }
  function pourquoiTexte(a) {
    if (a.base) return (a.pourquoi || {})[LANG] || (a.pourquoi || {}).fr || '';
    var m = [];
    if (a.themes && a.themes.length) m.push(t('why_themes') + a.themes.map(nomTheme).join(', '));
    if (a.tags && a.tags.length) m.push(t('why_kw') + a.tags.map(libelleTag).join(', '));
    else m.push(t('why_none'));
    return m.join(' · ');
  }
  function extraitEcheance(e) { var x = e.extrait || {}; return x[LANG] || x.fr || x.en || x[Object.keys(x)[0]] || ''; }
  function prochaineEcheance(a) {
    var futures = (a.echeances || []).filter(function (e) { return joursJusqua(e.date) >= 0; });
    return futures.length ? futures[0] : null;
  }

  /* ================================================================ en-tête */
  function appliquerTextes() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (n) { var v = t(n.getAttribute('data-i18n')); if (typeof v === 'string') n.textContent = v; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-ph]'), function (n) { n.setAttribute('placeholder', t(n.getAttribute('data-i18n-ph'))); });
    Array.prototype.forEach.call(document.querySelectorAll('.lang-btn'), function (b) {
      var on = b.getAttribute('data-lang') === LANG;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.addEventListener('click', function () {
        if (on) return;
        try { localStorage.setItem('cw-lang', b.getAttribute('data-lang')); } catch (e) {}
        var q = location.search.replace(/[?&]lang=(fr|en)/, '').replace(/^&/, '?');
        location.href = location.pathname + (q ? q + '&' : '?') + 'lang=' + b.getAttribute('data-lang') + location.hash;
      });
    });
    var mb = document.getElementById('method-blocks');
    t('method_html').forEach(function (b) { mb.appendChild(el('div', null, [el('h3', { text: b[0] }), el('div', { html: b[1] })])); });
    // menus déroulants
    Array.prototype.forEach.call(document.querySelectorAll('[data-menu]'), function (b) {
      var liste = b.parentNode.querySelector('.menu-list');
      b.addEventListener('click', function (e) { e.stopPropagation(); var o = liste.hidden; liste.hidden = !o; b.setAttribute('aria-expanded', o ? 'true' : 'false'); });
      liste.addEventListener('click', function () { liste.hidden = true; b.setAttribute('aria-expanded', 'false'); });
      document.addEventListener('click', function () { liste.hidden = true; b.setAttribute('aria-expanded', 'false'); });
    });
    // groupes de boutons « segmentés »
    Array.prototype.forEach.call(document.querySelectorAll('.seg'), function (g) {
      g.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || !g.contains(b)) return;
        Array.prototype.forEach.call(g.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        g.dispatchEvent(new CustomEvent('choix', { detail: b }));
      });
    });
  }
  function valeurSeg(id, attr) { var b = document.querySelector('#' + id + ' button[aria-pressed="true"]'); return b ? b.getAttribute(attr) : ''; }

  function renderHeader() {
    var titre = META.titre || 'Cyber Watch';
    document.getElementById('titre').textContent = titre; document.title = titre;
    document.getElementById('surtitre').textContent = LANG === 'en' ? (META.surtitre_en || 'Regulatory watch — Wavestone') : (META.surtitre || 'Veille réglementaire — Wavestone');
    document.getElementById('sous-titre').textContent = LANG === 'en' ? (META.sous_titre_en || '') : (META.sous_titre || '');
    document.getElementById('edition').textContent = META.mise_a_jour ? t('edition')(jourSeul(META.mise_a_jour), META.nb_nouveaux || 0) : t('no_run');
    var btn = document.getElementById('lancer-maj');
    if (META.url_lancer_maj) { btn.href = META.url_lancer_maj; btn.hidden = false; btn.title = t('update_title'); }
  }

  /* ================================================================ onglets */
  var ONGLETS = ['essentiel', 'veille', 'carte', 'referentiel', 'debats', 'sources'];
  function ongletDepuisHash() {
    var h = (location.hash || '').slice(1);
    if (ONGLETS.indexOf(h) !== -1) return h;
    var cible = h && document.getElementById(h);
    if (cible) { var p = cible.closest('.tab-panel'); if (p) return p.getAttribute('data-tab'); }
    return 'essentiel';
  }
  var carteDessinee = false;
  function afficherOnglet(nom) {
    Array.prototype.forEach.call(document.querySelectorAll('.tab-panel'), function (p) { p.hidden = p.getAttribute('data-tab') !== nom; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab-link]'), function (a) {
      var on = a.getAttribute('data-tab-link') === nom;
      a.setAttribute('aria-selected', on ? 'true' : 'false'); a.classList.toggle('tab-on', on);
    });
    if (nom === 'carte' && !carteDessinee && window.__dessinerCarte) { carteDessinee = true; sur('carte', window.__dessinerCarte); }
  }

  /* ================================================================== VEILLE */
  var RANG_VERSION = { base: 0, '': 0 };
  VERSIONS.forEach(function (v, i) { RANG_VERSION[v.id] = i + 1; });
  function rangVersion(a) { var r = RANG_VERSION[a.version || '']; return r === undefined ? 0 : r; }

  // Fenêtre « Nouveautés » : 30 jours, 60 s'il y a peu d'articles
  var JOURS_RECENT = ARTICLES.filter(function (a) { return joursDepuis(a.date) <= 30; }).length >= 25 ? 30 : 60;
  function estRecent(a) { return joursDepuis(a.date) <= JOURS_RECENT; }

  var registre = {};          // id carte -> { d: article, tx: textes }
  var cartes = [];            // toutes les cartes de la veille
  var voirOriginaux = false;

  function kicker(a) {
    var k = el('div', { className: 'card-kicker' });
    if (ZONES[a.zone]) k.appendChild(el('span', { className: 'zone-code', text: codeZone(a.zone), title: nomZone(a.zone) }));
    k.appendChild(el('span', { text: dateLongue(a.date) }));
    k.appendChild(el('span', { text: '· ' + (a.source || '') }));
    return k;
  }

  function ajout(parent, n) { if (n) parent.appendChild(n); }
  function carteArticle(a) {
    var id = 'a-' + a.id, tx = textes(a);
    registre[id] = { d: a, tx: tx };
    var foot = el('div', { className: 'card-foot' });
    if (META.version && a.version === META.version && VERSIONS.length > 1) ajout(foot, badge('badge-new', t('new_badge')));
    ajout(foot, badgePert(a));
    var pe = prochaineEcheance(a);
    if (pe) ajout(foot, badge('badge-urgent', (pe.approx ? t('approx') + ' ' : '') + dateCourte(pe.date)));
    ajout(foot, badgeAmende(a));
    if (a.statut && a.statut !== 'autre') ajout(foot, badge('badge-statut', libStatut(a.statut)));
    if (a.base) ajout(foot, badge('badge-base', t('base_badge')));
    if (a.nature === 'rkc') ajout(foot, badge('badge-rkc', libNature('rkc')));
    if (a.payant) ajout(foot, badge('badge-fine badge-fine-cap', '🔒 ' + t('badge_payant')));
    if (tx.traduit && !a.base) ajout(foot, badge('badge-lang', (tx.de || '').toUpperCase() + '→' + LANG.toUpperCase(), t('translated_from') + (LANGUES[LANG][tx.de] || tx.de)));
    ajout(foot, el('button', { type: 'button', className: 'more', 'data-toggle': true, 'aria-expanded': 'false', text: t('read_more') + ' ›' }));

    var hook = a.reserve ? (a.payant ? t('rkc_reserve') : t('rkc_libre')) : tx.aff.resume;
    var card = el('article', { className: 'card', id: id, 'data-pert': a.pertinence || 'faible' }, [
      el('div', { className: 'card-main', 'data-toggle': true }, [
        kicker(a),
        el('h3', { className: 'card-title' }, [el('button', { type: 'button', 'data-toggle': true, text: tx.aff.titre })]),
        hook ? el('p', { className: 'card-hook', text: hook }) : null
      ]),
      foot
    ]);
    var themes = themesDe(a);
    card._f = {
      section: a.rubrique, nature: a.nature || 'presse', zone: a.zone || '—', pert: a.pertinence || 'faible',
      statut: a.statut || '', amende: a.amende ? (a.amende.plafond ? 'plafond' : 'prononcee') : '',
      theme: themes, recent: estRecent(a), rang: rangVersion(a), version: a.version || '',
      texte: normaliser([a.titre, a.resume, tx.aff.titre, tx.aff.resume, a.source, nomZone(a.zone), (a.tags || []).join(' '), themes.map(libelleTheme).join(' ')].join(' '))
    };
    card._tri = { date: a.date || '', pert: ORDRE_PERT[a.pertinence] === undefined ? 3 : ORDRE_PERT[a.pertinence], score: a.score || 0, montant: a.amende ? a.amende.montant_eur : -1 };
    card._build = function () {
      var parts = [];
      parts.push(el('div', { className: 'why' }, [
        el('p', { className: 'why-title', text: t('why') }),
        el('p', { className: 'why-text', text: pourquoiTexte(a) }),
        a.base ? el('p', { className: 'why-meta', text: t('why_base') + dateLongue(a.detecte_le) + ')' }) : null,
        a.amende ? el('p', { className: 'why-meta', text: texteAmende(a) }) : null,
        a.payant ? el('p', { className: 'why-meta', text: t('rkc_extrait') }) : null
      ]));
      if ((a.echeances || []).length) {
        var ul = el('ul', { className: 'ech-list' });
        a.echeances.forEach(function (e) {
          var x = extraitEcheance(e);
          ul.appendChild(el('li', null, [el('strong', { text: (e.approx ? t('approx') + ' ' : '') + dateLongue(e.date) + ' (' + t('in_days')(joursJusqua(e.date)) + ')' }), x ? ' — ' + x : '']));
        });
        parts.push(el('p', { className: 'why-title', text: t('ech_title') }), ul);
      }
      if (tx.traduit && !a.base) parts.push(el('p', { className: 'trad-line' }, [t('translated_from') + (LANGUES[LANG][tx.de] || tx.de) + ' · ',
        el('button', { type: 'button', className: 'linkbtn', 'data-bascule': true, text: card._original ? t('show_translation') : t('show_original') })]));
      else if (tx.attente && !a.base) parts.push(el('p', { className: 'trad-line', text: t('pending_translation') }));
      var liens = [];
      if (a.lien) liens.push(el('a', { href: a.lien, target: '_blank', rel: 'noopener noreferrer', text: t('read_source') }));
      else if (a.nature === 'rkc') liens.push(t('rkc_nolink'));
      if (a.lien && a.langue && a.langue !== LANG) liens.push(' · ', el('a', { href: 'https://translate.google.com/translate?sl=auto&tl=' + LANG + '&u=' + encodeURIComponent(a.lien), target: '_blank', rel: 'noopener noreferrer', text: t('translate_link') }));
      parts.push(el('p', { className: 'src-line' }, [el('strong', { text: a.source || '' }), ' · ' + nomZone(a.zone) + ' · ' + libNature(a.nature) + ' · ' +
        (a.date_estimee ? t('detected') + dateLongue(a.date) + t('no_pubdate') : t('published') + dateLongue(a.date))]));
      parts.push(el('p', { className: 'src-line' }, liens));
      if (themes.length) {
        var tl = el('ul', { className: 'tags' });
        themes.forEach(function (k) { tl.appendChild(el('li', null, [el('button', { type: 'button', className: 'tag', 'data-theme': k, text: libelleTheme(k) })])); });
        parts.push(tl);
      }
      parts.push(el('div', { className: 'card-actions' }, [el('button', { type: 'button', className: 'btn btn-sm btn-copy', 'data-copy': true, text: t('copy') })]));
      return parts;
    };
    return card;
  }

  function carteSynthese(f, fFr) {
    var id = 's-' + f.id, iso = texteToIso(fFr.date);
    registre[id] = { d: { titre: f.titre, resume: f.accroche, date: iso, source: t('syntheses'), zone: '—', nature: 'synthese', rubrique: 'syntheses',
                          tags: f.tags || [], lien: (f.sources && f.sources[0]) ? f.sources[0].url : '' }, tx: { traduit: false } };
    var card = el('article', { className: 'card', id: id, 'data-pert': 'moyenne' }, [
      el('div', { className: 'card-main', 'data-toggle': true }, [
        el('div', { className: 'card-kicker' }, [el('span', { text: fFr.date || '' }), el('span', { text: '· ' + t('syntheses') })]),
        el('h3', { className: 'card-title' }, [el('button', { type: 'button', 'data-toggle': true, text: f.titre })]),
        el('p', { className: 'card-hook', text: f.accroche || '' })
      ]),
      el('div', { className: 'card-foot' }, [badge('badge-statut', (t('conf') || {})[f.conf] || ''), el('button', { type: 'button', className: 'more', 'data-toggle': true, text: t('read_more') + ' ›' })])
    ]);
    var themes = (f.tags || []).map(function (tg) { var k = cleTheme(tg); if (!LIB_THEME[k]) LIB_THEME[k] = { acro: !!GLOSSAIRE[tg], val: tg }; return k; });
    card._f = { section: 'syntheses', nature: 'synthese', zone: '—', pert: 'moyenne', statut: '', amende: '', theme: themes, recent: false, rang: undefined, version: '',
                texte: normaliser([f.titre, f.accroche].concat(f.paragraphes || []).join(' ')) };
    card._tri = { date: iso, pert: 1, score: 0, montant: -1 };
    card._build = function () {
      var parts = (f.paragraphes || []).map(function (p) { return el('p', { text: p }); });
      if (f.sources && f.sources.length) {
        var ol = el('ol');
        f.sources.forEach(function (s) { ol.appendChild(el('li', null, [el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.libelle }), s.date ? ' — ' + s.date : ''])); });
        parts.push(el('p', { className: 'why-title', text: t('sources') }), ol);
      }
      parts.push(el('div', { className: 'card-actions' }, [el('button', { type: 'button', className: 'btn btn-sm btn-copy', 'data-copy': true, text: t('copy') })]));
      return parts;
    };
    return card;
  }

  function construireCorps(card) {
    if (card.querySelector('.card-body')) return;
    card.appendChild(el('div', { className: 'card-body' }, card._build ? card._build() : []));
  }
  function ouvrir(card, open) {
    if (open) construireCorps(card);
    var body = card.querySelector('.card-body'); if (body) body.hidden = !open;
    card.classList.toggle('is-open', open);
    var m = card.querySelector('.more'); if (m) { m.textContent = open ? t('close') + ' ‹' : t('read_more') + ' ›'; m.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  }
  function montrerTexte(card, original) {
    var r = registre[card.id]; if (!r || !r.tx || !r.tx.traduit) return;
    var v = original ? r.tx.orig : r.tx.aff;
    card.querySelector('.card-title button').textContent = v.titre;
    var h = card.querySelector('.card-hook'); if (h && !r.d.reserve) h.textContent = v.resume;
    card._original = original;
    var b = card.querySelector('[data-bascule]'); if (b) b.textContent = original ? t('show_translation') : t('show_original');
  }

  var RUBRIQUES = [];
  function titreRubrique(r) { return LANG === 'en' ? (r.titre_en || r.titre) : r.titre; }
  function chapeauRubrique(r) { return LANG === 'en' ? (r.chapeau_en || r.chapeau) : r.chapeau; }

  function renderVeille() {
    var root = document.getElementById('rubriques');
    RUBRIQUES = (META.rubriques || []).map(function (r) { return { id: r.id, titre: titreRubrique(r), chapeau: chapeauRubrique(r) }; });
    if (!RUBRIQUES.some(function (r) { return r.id === 'autres'; })) RUBRIQUES.push({ id: 'autres', titre: LANG === 'en' ? 'Other news to monitor' : 'Autres actualités à surveiller', chapeau: '' });
    ARTICLES.forEach(function (a) { cartes.push(carteArticle(a)); });
    var S = (LANG === 'en' && SYNTH_EN && SYNTH_EN.groupes && SYNTH_EN.groupes.length) ? SYNTH_EN : SYNTH_FR;
    if (SYNTH_FR && SYNTH_FR.groupes && SYNTH_FR.groupes.length) {
      RUBRIQUES.push({ id: 'syntheses', titre: S.titre || t('syntheses'), chapeau: S.chapeau || '' });
      SYNTH_FR.groupes.forEach(function (gFr, gi) {
        var g = (S.groupes && S.groupes[gi]) || gFr;
        (gFr.fiches || []).forEach(function (fFr, fi) { cartes.push(carteSynthese((g.fiches && g.fiches[fi]) || fFr, fFr)); });
      });
    }
    RUBRIQUES.forEach(function (r) {
      r.el = el('section', { className: 'rub', id: 'rub-' + r.id }, [
        el('div', { className: 'rub-head' }, [el('h2', { text: r.titre }), el('span', { className: 'rub-count' })]),
        r.chapeau ? el('p', { className: 'rub-lead', text: r.chapeau }) : null,
        el('div', { className: 'rub-body' })
      ]);
      root.appendChild(r.el);
    });
    document.getElementById('no-data').hidden = ARTICLES.length > 0;
  }

  /* ---------------------------------------------------------------- filtres */
  var etatFiltres = { fenetre: 'recent', tri: 'date', q: [], versionMax: null, versionSeule: '' };
  function selection(facet) {
    return Array.prototype.slice.call(document.querySelectorAll('input[data-facet="' + facet + '"]:checked')).map(function (i) { return i.value; });
  }
  function chip(facet, value, label, n) {
    return el('label', { className: 'chip' }, [el('input', { type: 'checkbox', 'data-facet': facet, value: value }), el('span', { text: label }), n !== undefined ? el('span', { className: 'chip-n', text: String(n) }) : null]);
  }
  function renderFacettes() {
    function compte(cle) { var c = {}; cartes.forEach(function (k) { var v = k._f[cle]; (Array.isArray(v) ? v : [v]).forEach(function (x) { if (x) c[x] = (c[x] || 0) + 1; }); }); return c; }
    var box = document.getElementById('fc-pert');
    ['elevee', 'moyenne', 'faible'].forEach(function (p) { box.appendChild(chip('pert', p, t('pert_badge')[p])); });
    var cz = compte('zone'); box = document.getElementById('fc-zone');
    Object.keys(cz).filter(function (z) { return z !== '—'; }).sort(function (a, b) { return nomZone(a).localeCompare(nomZone(b), LANG); })
      .forEach(function (z) { box.appendChild(chip('zone', z, nomZone(z), cz[z])); });
    var ct = compte('theme'), cles = Object.keys(ct).sort(function (a, b) { return ct[b] - ct[a] || libelleTheme(a).localeCompare(libelleTheme(b)); });
    box = document.getElementById('fc-theme');
    cles.forEach(function (k, i) { var c = chip('theme', k, libelleTheme(k), ct[k]); if (i >= 24) { c.hidden = true; c.classList.add('chip-plus'); } box.appendChild(c); });
    var plus = document.getElementById('more-themes');
    if (cles.length > 24) {
      plus.hidden = false; plus.textContent = t('more_themes')(cles.length);
      plus.addEventListener('click', function () {
        var ouvert = plus.getAttribute('data-open') === '1';
        Array.prototype.forEach.call(box.querySelectorAll('.chip-plus'), function (c) { c.hidden = ouvert; });
        plus.setAttribute('data-open', ouvert ? '0' : '1'); plus.textContent = ouvert ? t('more_themes')(cles.length) : t('less_themes');
      });
    }
    box = document.getElementById('fc-section');
    RUBRIQUES.forEach(function (r) { box.appendChild(chip('section', r.id, r.titre)); });
    var cs = compte('statut'); box = document.getElementById('fc-statut');
    ['adopte', 'en_vigueur', 'projet', 'consultation', 'lignes_directrices', 'sanction'].forEach(function (s) { if (cs[s]) box.appendChild(chip('statut', s, libStatut(s), cs[s])); });
    if (!box.children.length) box.closest('.facet').hidden = true;
    var cn = compte('nature'); box = document.getElementById('fc-nature');
    ['officielle', 'cabinet', 'presse', 'rkc', 'synthese'].forEach(function (n) { if (cn[n]) box.appendChild(chip('nature', n, libNature(n), cn[n])); });
    box = document.getElementById('fc-amende');
    box.appendChild(chip('amende', 'prononcee', t('am_prononcee'))); box.appendChild(chip('amende', 'plafond', t('am_plafond')));
    Array.prototype.forEach.call(document.querySelectorAll('input[data-facet]'), function (i) { i.addEventListener('change', appliquerFiltres); });
  }

  function correspond(card, sel) {
    var f = card._f;
    if (etatFiltres.versionMax !== null) {
      if (f.rang === undefined) { if (etatFiltres.versionSeule) return false; }
      else if (f.rang > etatFiltres.versionMax || (etatFiltres.versionSeule && f.version !== etatFiltres.versionSeule)) return false;
    }
    if (!etatFiltres.q.length && etatFiltres.versionMax === null) {
      if (etatFiltres.fenetre === 'recent' && !f.recent) return false;
      if (etatFiltres.fenetre === 'archives' && f.recent) return false;
    }
    if (sel.section.length && sel.section.indexOf(f.section) === -1) return false;
    if (sel.nature.length && sel.nature.indexOf(f.nature) === -1) return false;
    if (sel.zone.length && sel.zone.indexOf(f.zone) === -1) return false;
    if (sel.pert.length && sel.pert.indexOf(f.pert) === -1) return false;
    if (sel.statut.length && sel.statut.indexOf(f.statut) === -1) return false;
    if (sel.amende.length && sel.amende.indexOf(f.amende) === -1) return false;
    if (sel.theme.length && !sel.theme.some(function (k) { return f.theme.indexOf(k) !== -1; })) return false;
    for (var j = 0; j < etatFiltres.q.length; j++) if (f.texte.indexOf(etatFiltres.q[j]) === -1) return false;
    return true;
  }
  function trier(liste) {
    var tri = etatFiltres.tri;
    return liste.sort(function (x, y) {
      if (tri === 'amende') return (y._tri.montant - x._tri.montant) || (y._tri.date > x._tri.date ? 1 : -1);
      if (tri === 'pertinence') return (x._tri.pert - y._tri.pert) || (y._tri.score - x._tri.score) || (y._tri.date > x._tri.date ? 1 : -1);
      return y._tri.date > x._tri.date ? 1 : y._tri.date < x._tri.date ? -1 : (x._tri.pert - y._tri.pert);
    });
  }
  function appliquerFiltres() {
    var sel = { section: selection('section'), nature: selection('nature'), zone: selection('zone'), pert: selection('pert'), statut: selection('statut'), amende: selection('amende'), theme: selection('theme') };
    var total = 0, visibles = 0, nRecent = 0, nArch = 0;
    var parRub = {};
    cartes.forEach(function (c) {
      if (c._f.recent) nRecent++; else nArch++;
      total++;
      var ok = correspond(c, sel);
      if (ok) { visibles++; (parRub[c._f.section] = parRub[c._f.section] || []).push(c); }
      else if (c.classList.contains('is-open')) ouvrir(c, false);
    });
    RUBRIQUES.forEach(function (r) {
      var liste = trier(parRub[r.id] || []), body = r.el.querySelector('.rub-body');
      body.textContent = '';
      r.el.hidden = !liste.length;
      r.el.querySelector('.rub-count').textContent = liste.length + (liste.length > 1 ? ' articles' : ' article');
      if (!liste.length) return;
      var groupe = null, box = null;
      var parMois = etatFiltres.fenetre === 'archives' && etatFiltres.tri === 'date' && !etatFiltres.q.length;
      liste.forEach(function (c) {
        var cle = parMois ? moisAnnee(c._tri.date) : '';
        if (!box || cle !== groupe) {
          groupe = cle;
          if (parMois) body.appendChild(el('h3', { className: 'sub-title', text: cle }));
          box = el('div', { className: 'cards' }); body.appendChild(box);
        }
        box.appendChild(c);
      });
    });
    document.getElementById('n-recent').textContent = nRecent;
    document.getElementById('n-archives').textContent = nArch;
    document.getElementById('window-note').textContent = etatFiltres.q.length ? '' : (etatFiltres.fenetre === 'recent' ? t('window_recent')(JOURS_RECENT) : t('window_archives')(JOURS_RECENT));
    var base = etatFiltres.q.length ? total : (etatFiltres.fenetre === 'recent' ? nRecent : nArch);
    document.getElementById('result-count').textContent = t('shown')(visibles, base);
    document.getElementById('empty-state').hidden = visibles !== 0 || !cartes.length;
    var actifs = sel.section.length + sel.nature.length + sel.zone.length + sel.pert.length + sel.statut.length + sel.amende.length + sel.theme.length;
    var ac = document.getElementById('active-count'); ac.textContent = actifs; ac.hidden = !actifs;
    Array.prototype.forEach.call(document.querySelectorAll('.tag[data-theme]'), function (b) { b.setAttribute('aria-pressed', sel.theme.indexOf(b.getAttribute('data-theme')) !== -1 ? 'true' : 'false'); });
  }

  function brancherVeille() {
    document.getElementById('fenetre').addEventListener('choix', function (e) { etatFiltres.fenetre = e.detail.getAttribute('data-f'); appliquerFiltres(); });
    document.getElementById('tri').addEventListener('change', function (e) { etatFiltres.tri = e.target.value; appliquerFiltres(); });
    var timer = null;
    document.getElementById('recherche').addEventListener('input', function (e) {
      clearTimeout(timer); timer = setTimeout(function () { etatFiltres.q = normaliser(e.target.value).split(/\s+/).filter(Boolean); appliquerFiltres(); }, 180);
    });
    var tg = document.getElementById('toggle-filters'), panneau = document.getElementById('facets');
    tg.addEventListener('click', function () { var o = panneau.hidden; panneau.hidden = !o; tg.setAttribute('aria-expanded', o ? 'true' : 'false'); });
    document.getElementById('reset-filters').addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('input[data-facet]'), function (i) { i.checked = false; });
      document.getElementById('recherche').value = ''; etatFiltres.q = []; appliquerFiltres();
    });
    document.getElementById('voir-originaux').addEventListener('change', function (e) { voirOriginaux = e.target.checked; cartes.forEach(function (c) { montrerTexte(c, voirOriginaux); }); });
    document.getElementById('rubriques').addEventListener('click', function (e) {
      var tag = e.target.closest('.tag[data-theme]');
      if (tag) {
        var inp = document.querySelector('input[data-facet="theme"][value="' + tag.getAttribute('data-theme').replace(/"/g, '\\"') + '"]');
        if (inp) { inp.checked = !inp.checked; if (inp.closest('.chip').hidden) inp.closest('.chip').hidden = false; appliquerFiltres(); }
        return;
      }
      var bas = e.target.closest('[data-bascule]');
      if (bas) { var cb = bas.closest('.card'); montrerTexte(cb, !cb._original); return; }
      if (e.target.closest('[data-copy]') || e.target.closest('a')) return;
      var tog = e.target.closest('[data-toggle]');
      if (tog) { var c = tog.closest('.card'); ouvrir(c, !c.classList.contains('is-open')); }
    });
  }

  /* ---------------------------------------------------------------- éditions */
  function renderVersions() {
    var select = document.getElementById('version-select'), banner = document.getElementById('version-banner');
    if (!VERSIONS.length) { select.closest('.edition-select').hidden = true; return; }
    for (var i = VERSIONS.length - 1; i >= 0; i--) {
      var v = VERSIONS[i];
      select.appendChild(el('option', { value: String(i + 1), text: t('version_opt')(horodatage(v.date), v.nb_nouveaux || 0) + (i === VERSIONS.length - 1 ? t('version_current') : '') }));
    }
    if (ARTICLES.some(function (a) { return a.base; })) select.appendChild(el('option', { value: '0', text: t('version_base') }));
    select.addEventListener('change', function () {
      var r = +select.value, courante = r === VERSIONS.length, v = VERSIONS[r - 1];
      banner.textContent = '';
      if (courante) { etatFiltres.versionMax = null; etatFiltres.versionSeule = ''; banner.hidden = true; }
      else {
        etatFiltres.versionMax = r; etatFiltres.versionSeule = '';
        var total = cartes.filter(function (c) { return c._f.rang !== undefined && c._f.rang <= r; }).length;
        banner.appendChild(document.createTextNode(r === 0 ? t('version_base_banner')(total) : t('version_banner')(horodatage(v.date), v.nb_nouveaux || 0, total)));
        if (r > 0) {
          var cb = el('input', { type: 'checkbox' });
          cb.addEventListener('change', function () { etatFiltres.versionSeule = cb.checked ? v.id : ''; appliquerFiltres(); });
          banner.appendChild(el('label', { className: 'switch', style: 'margin-left:12px' }, [cb, el('span', { text: t('version_only') })]));
          if (META.depot) banner.appendChild(el('a', { href: (META.serveur || 'https://github.com') + '/' + META.depot + '/tree/veille-' + v.id, target: '_blank', rel: 'noopener noreferrer', style: 'margin-left:12px', text: t('version_git') }));
        }
        banner.hidden = false;
        location.hash = '#veille';
      }
      appliquerFiltres();
    });
  }

  /* ============================================================ L'ESSENTIEL */
  /* Score d'urgence : règles fixes, lisibles, sans IA générative */
  function urgence(a) {
    var s = 0, raisons = [];
    if (a.pertinence === 'elevee') { s += 3; raisons.push(t('u_pert')); } else if (a.pertinence === 'moyenne') s += 1.5;
    var pe = prochaineEcheance(a);
    if (pe) {
      var j = joursJusqua(pe.date);
      if (j <= 30) { s += 3; raisons.push(t('u_deadline')); } else if (j <= 90) { s += 2; raisons.push(t('u_deadline')); } else if (j <= 180) s += 1;
    }
    if (['en_vigueur', 'adopte'].indexOf(a.statut) !== -1) { s += 1; raisons.push(t('u_status')); }
    if (a.statut === 'sanction' || (a.amende && !a.amende.plafond && a.amende.montant_eur >= 1e6)) { s += 1; raisons.push(t('u_fine')); }
    if (a.nature === 'officielle') { s += 1; raisons.push(t('u_off')); }
    var age = joursDepuis(a.date);
    if (age <= 7) { s += 2; raisons.push(t('u_recent')); } else if (age <= 30) s += 1; else if (age > 60 && !pe) s -= 3;
    if (a.rubrique === 'autres') s -= 2;
    return { score: s, raisons: raisons, echeance: pe };
  }

  function renderEssentiel() {
    var grid = document.getElementById('une-grid');
    var candidats = ARTICLES.filter(function (a) { return a.pertinence !== 'faible'; }).map(function (a) { return { a: a, u: urgence(a) }; })
      .sort(function (x, y) { return (y.u.score - x.u.score) || (y.a.date > x.a.date ? 1 : -1); }).slice(0, 5);
    document.getElementById('une-vide').hidden = candidats.length > 0;
    function carteUne(c, principale) {
      var a = c.a, tx = textes(a), pe = c.u.echeance;
      var badges = el('div', { className: 'une-badges' }, [badgePert(a, true), badgeAmende(a, true),
        a.statut && a.statut !== 'autre' ? badge('badge-statut badge-sm', libStatut(a.statut)) : null, a.base ? badge('badge-base badge-sm', t('base_badge')) : null,
        a.payant ? badge('badge-fine badge-fine-cap badge-sm', '🔒 ' + t('badge_payant')) : null]);
      return el('article', { className: 'une-card' + (principale ? ' une-main' : '') }, [
        el('div', { className: 'une-kicker' }, [ZONES[a.zone] ? el('span', { className: 'zone-code', text: codeZone(a.zone) }) : null, el('span', { text: dateLongue(a.date) + ' · ' + (a.source || '') })]),
        pe ? el('span', { className: 'une-deadline', text: '⏱ ' + (pe.approx ? t('approx') + ' ' : '') + dateLongue(pe.date) + ' · ' + t('in_days')(joursJusqua(pe.date)) }) : null,
        el('h3', null, [a.lien ? el('a', { href: a.lien, target: '_blank', rel: 'noopener noreferrer', text: tx.aff.titre }) : tx.aff.titre]),
        !a.reserve && tx.aff.resume && (principale || tx.aff.resume.length < 260) ? el('p', { text: tx.aff.resume }) : null,
        c.u.raisons.length ? el('p', { className: 'une-why', text: t('une_why') + c.u.raisons.join(', ') }) : null,
        badges
      ]);
    }
    if (candidats.length) {
      grid.appendChild(carteUne(candidats[0], true));
      var cote = el('div', { className: 'une-side' });
      candidats.slice(1).forEach(function (c) { cote.appendChild(carteUne(c, false)); });
      grid.appendChild(cote);
    }
    renderAgenda(90);
    document.getElementById('agenda-horizon').addEventListener('choix', function (e) { renderAgenda(+e.detail.getAttribute('data-h')); });
    renderKpis();
  }

  function evenementsAgenda(horizon, zone) {
    var evs = [];
    ARTICLES.forEach(function (a) {
      if (zone && a.zone !== zone) return;
      (a.echeances || []).forEach(function (e) {
        var j = joursJusqua(e.date);
        if (j < -30 || j > horizon) return;
        evs.push({ date: e.date, approx: e.approx, titre: textes(a).aff.titre, lien: a.lien, ctx: a.reserve ? '' : extraitEcheance(e), zone: a.zone, source: a.source, a: a });
      });
    });
    REF_TEXTES.forEach(function (r) {
      if (zone && r.zone !== zone) return;
      var v = r.applicable_depuis || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
      var j = joursJusqua(v);
      if (j < -30 || j > horizon) return;
      evs.push({ date: v, approx: false, titre: t('applies') + (LANG === 'en' ? (r.nom_en || r.nom) : r.nom), lien: r.lien, ctx: LANG === 'en' ? (r.resume_en || '') : (r.resume_fr || ''), zone: r.zone, source: r.autorite || '', ref: true });
    });
    // une même date et un même lien ne sont affichés qu'une fois
    var vus = {};
    return evs.filter(function (e) { var k = e.date + '|' + (e.lien || e.titre); if (vus[k]) return false; vus[k] = 1; return true; })
      .sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : ((ORDRE_PERT[(x.a || {}).pertinence] || 0) - (ORDRE_PERT[(y.a || {}).pertinence] || 0)); });
  }

  function renderAgenda(horizon) {
    var ol = document.getElementById('timeline'); ol.textContent = '';
    var tous = evenementsAgenda(horizon);
    // à venir d'abord ; les échéances passées depuis moins de 14 jours à la fin
    var futurs = tous.filter(function (e) { return joursJusqua(e.date) >= 0; });
    var passes = tous.filter(function (e) { var j = joursJusqua(e.date); return j < 0 && j >= -14; }).reverse();
    document.getElementById('agenda-vide').hidden = futurs.length + passes.length > 0;
    var LIMITE = 20, mois = null, n = 0, plus = null;
    futurs.concat(passes).forEach(function (e, i) {
      var m = joursJusqua(e.date) < 0 ? (LANG === 'en' ? 'Recently passed' : 'Échues récemment') : moisAnnee(e.date);
      var cache = i >= LIMITE;
      if (m !== mois) { mois = m; var h = el('li', { className: 'tl-month', text: m }); if (cache) h.setAttribute('data-plus', '1'), h.hidden = true; ol.appendChild(h); }
      var j = joursJusqua(e.date), d = isoToDate(e.date);
      var li = el('li', { className: 'tl-item' + (j < 0 ? ' tl-past' : (j <= 30 ? ' tl-soon' : '')) }, [
        el('div', { className: 'tl-date' }, [
          el('span', { className: 'tl-day', text: e.approx ? '~' : String(d.getDate()) }),
          el('span', { className: 'tl-mon', text: MOIS_COURT[LANG][d.getMonth()] }),
          el('span', { className: 'tl-count', text: t('in_days')(j) })
        ]),
        el('div', { className: 'tl-body' }, [
          el('h4', null, [e.lien ? el('a', { href: e.lien, target: '_blank', rel: 'noopener noreferrer', text: e.titre }) : e.titre]),
          e.ctx ? el('p', { className: 'tl-ctx', text: e.ctx }) : null,
          el('div', { className: 'tl-meta' }, [ZONES[e.zone] ? el('span', { className: 'zone-code', text: codeZone(e.zone) }) : null, el('span', { text: nomZone(e.zone) + (e.source ? ' · ' + e.source : '') }),
            e.approx ? badge('badge-sm', t('approx') + ' ' + moisAnnee(e.date)) : null, e.a ? badgePert(e.a, true) : null])
        ])
      ]);
      if (cache) { li.hidden = true; li.setAttribute('data-plus', '1'); n++; }
      ol.appendChild(li);
    });
    if (n) {
      plus = el('button', { type: 'button', className: 'btn', style: 'margin:14px 0 0 18px', text: (LANG === 'en' ? 'Show ' + n + ' more dates' : 'Voir les ' + n + ' autres dates') });
      plus.addEventListener('click', function () { Array.prototype.forEach.call(ol.querySelectorAll('[data-plus]'), function (x) { x.hidden = false; }); plus.remove(); });
      ol.appendChild(el('li', { style: 'list-style:none' }, [plus]));
    }
  }

  function renderKpis() {
    var box = document.getElementById('kpis');
    var recents = ARTICLES.filter(estRecent).length;
    var ech = evenementsAgenda(90).filter(function (e) { return joursJusqua(e.date) >= 0; }).length;
    var amendes = ARTICLES.filter(function (a) { return a.amende && !a.amende.plafond; }).length;
    var zones = {}; ARTICLES.forEach(function (a) { if (a.zone) zones[a.zone] = 1; });
    var src = (ETAT.sources || []), lues = src.filter(function (s) { return s.acces === 'ok' || s.acces === 'partielle'; }).length,
        actives = src.filter(function (s) { return ['inactive', 'retiree'].indexOf(s.acces) === -1; }).length;
    [[recents, t('k_recent')(JOURS_RECENT)], [ech, t('k_deadlines')], [amendes, t('k_fines')], [Object.keys(zones).length, t('k_countries')], [lues + ' / ' + actives, t('k_sources')]]
      .forEach(function (k) { box.appendChild(el('div', { className: 'kpi' }, [el('span', { className: 'kpi-n', text: String(k[0]) }), el('span', { className: 'kpi-l', text: k[1] })])); });
  }

  /* ================================================================== CARTE */
  /* Décodage TopoJSON (format world-atlas) sans bibliothèque */
  function decoderTopo(topo) {
    var tr = topo.transform, arcs = topo.arcs.map(function (arc) {
      var x = 0, y = 0;
      return arc.map(function (p) {
        if (tr) { x += p[0]; y += p[1]; return [x * tr.scale[0] + tr.translate[0], y * tr.scale[1] + tr.translate[1]]; }
        return p;
      });
    });
    function anneau(ids) {
      var pts = [];
      ids.forEach(function (i, k) {
        var a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
        pts = pts.concat(k ? a.slice(1) : a);
      });
      return pts;
    }
    var obj = topo.objects.countries || topo.objects[Object.keys(topo.objects)[0]];
    return (obj.geometries || []).map(function (g) {
      var polys = g.type === 'Polygon' ? [g.arcs] : (g.type === 'MultiPolygon' ? g.arcs : []);
      return { id: parseInt(g.id, 10), nom: (g.properties || {}).name || '', polys: polys.map(function (p) { return p.map(anneau); }) };
    });
  }
  var RAD = Math.PI / 180;
  /* Europe : projection azimutale équivalente de Lambert centrée sur l'Europe */
  function projEurope(lon, lat) {
    var l0 = 12 * RAD, p0 = 52 * RAD, l = lon * RAD, p = lat * RAD;
    var c = 1 + Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l - l0);
    if (c < 1e-6) return null;
    var k = Math.sqrt(2 / c);
    return [k * Math.cos(p) * Math.sin(l - l0), -k * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l - l0))];
  }
  /* Monde : projection Equal Earth */
  function projMonde(lon, lat) {
    var A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
    var th = Math.asin(M * Math.sin(lat * RAD)), t2 = th * th, t6 = t2 * t2 * t2;
    return [lon * RAD * Math.cos(th) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2))), -th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))];
  }
  function cheminPays(pays, proj, coupeAntimeridien, ech, ox, oy) {
    var d = [];
    pays.polys.forEach(function (poly) {
      poly.forEach(function (ring) {
        var prec = null, debut = true;
        ring.forEach(function (pt) {
          var q = proj(pt[0], pt[1]);
          if (!q) { debut = true; return; }
          if (coupeAntimeridien && prec && Math.abs(pt[0] - prec) > 180) debut = true;
          d.push((debut ? 'M' : 'L') + ((q[0] - ox) * ech).toFixed(1) + ',' + ((q[1] - oy) * ech).toFixed(1));
          debut = false; prec = pt[0];
        });
        d.push('Z');
      });
    });
    return d.join('');
  }

  var RAMPE = ['#e4ecf3', '#c4d7ea', '#95b7d8', '#5f8fc0', '#336aa0', '#1a4670'];
  var SEUILS = [0, 1, 3, 6, 11, 21];
  function classe(n) { var i = 0; while (i + 1 < SEUILS.length && n >= SEUILS[i + 1]) i++; return i; }

  function renderCarte() {
    var svg = document.getElementById('map-svg'), stage = document.getElementById('map-stage');
    var fiche = document.getElementById('map-fiche'), bulle = document.getElementById('map-tooltip'), pills = document.getElementById('map-pills');
    var legende = document.getElementById('map-legend');
    var periode = '', vue = 'europe', choisi = null, formes = {}, PAYS = null;

    legende.appendChild(el('span', { text: t('map_legend') }));
    ['0', '1–2', '3–5', '6–10', '11–20', '21+'].forEach(function (lab, i) {
      legende.appendChild(el('span', null, [el('span', { className: 'legend-sw', style: 'background:' + RAMPE[i] }), lab]));
    });
    function articlesZone(z) { return ARTICLES.filter(function (a) { return a.zone === z && (!periode || joursDepuis(a.date) <= +periode); }); }
    function reglementations(z) {
      return articlesZone(z).filter(function (a) { return a.rubrique !== 'autres' && a.pertinence !== 'faible'; })
        .sort(function (x, y) { return x.date < y.date ? 1 : x.date > y.date ? -1 : 0; });
    }

    function bulleSur(evt, z) {
      var n = articlesZone(z).length, der = reglementations(z)[0];
      bulle.textContent = '';
      bulle.appendChild(el('strong', { text: nomZone(z) + ' — ' + t('map_articles')(n) }));
      if (der) bulle.appendChild(el('span', { className: 'tip-latest', text: t('map_latest') + textes(der).aff.titre + ' (' + dateLongue(der.date) + ')' }));
      var r = stage.getBoundingClientRect();
      bulle.style.left = Math.min(evt.clientX - r.left + 14, r.width - 330) + 'px';
      bulle.style.top = (evt.clientY - r.top + 14) + 'px';
      bulle.hidden = false;
    }

    function dessiner() {
      svg.textContent = '';
      svg.appendChild(svgEl('title', {})).textContent = t('map_title');
      formes = {};
      if (!PAYS) return dessinerTuiles();
      var proj = vue === 'europe' ? projEurope : projMonde;
      // cadre : Europe (Portugal → Finlande, Grèce → Cap Nord) ou monde entier
      var cadre = [], lo, la;
      if (vue === 'europe') { for (lo = -11; lo <= 33; lo += 2) { cadre.push([lo, 35]); cadre.push([lo, 71]); } for (la = 35; la <= 71; la += 2) { cadre.push([-11, la]); cadre.push([33, la]); } }
      else { for (lo = -180; lo <= 180; lo += 10) { cadre.push([lo, -58]); cadre.push([lo, 84]); } for (la = -58; la <= 84; la += 4) { cadre.push([-180, la]); cadre.push([180, la]); } }
      var xs = [], ys = [];
      cadre.forEach(function (c) { var q = proj(c[0], c[1]); if (q) { xs.push(q[0]); ys.push(q[1]); } });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      var L = 1000, ech = L / (x1 - x0), H = Math.round((y1 - y0) * ech);
      svg.setAttribute('viewBox', '0 0 ' + L + ' ' + H);
      if (vue === 'monde') svg.appendChild(svgEl('rect', { x: 0, y: 0, width: L, height: H, fill: '#eaf0f5' }));
      PAYS.forEach(function (p) {
        if (p.id === 10) return;  // Antarctique
        var z = ZONE_PAR_ISO[p.id];
        var path = svgEl('path', { d: cheminPays(p, proj, vue === 'monde', ech, x0, y0), 'class': 'pays ' + (z ? 'pays-suivi' : 'pays-autre') });
        if (z) {
          path.setAttribute('tabindex', '0'); path.setAttribute('role', 'button'); path.setAttribute('aria-label', nomZone(z));
          path.addEventListener('mousemove', function (e) { bulleSur(e, z); });
          path.addEventListener('mouseleave', function () { bulle.hidden = true; });
          path.addEventListener('click', function () { choisir(z); });
          path.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choisir(z); } });
          (formes[z] = formes[z] || []).push(path);
        }
        svg.appendChild(path);
      });
      // les pays suivis passent au premier plan (contour lisible)
      Object.keys(formes).forEach(function (z) { formes[z].forEach(function (p) { svg.appendChild(p); }); });
      peindre();
    }

    function dessinerTuiles() {
      var box = el('div', { className: 'tile-map' });
      stage.insertBefore(el('p', { className: 'map-hint', style: 'padding:12px 16px 0', text: t('map_nodata') }), svg);
      svg.style.display = 'none';
      Object.keys(ZONES).forEach(function (z) {
        var d = ZONES[z]; if (d.side) return;
        var b = el('button', { type: 'button', className: 'tile', style: 'grid-column:' + d.x + ';grid-row:' + d.y }, [el('strong', { text: d.code }), el('br'), el('span', { text: d[LANG] })]);
        b.addEventListener('click', function () { choisir(z); });
        b.addEventListener('mousemove', function (e) { bulleSur(e, z); });
        b.addEventListener('mouseleave', function () { bulle.hidden = true; });
        formes[z] = [b]; box.appendChild(b);
      });
      stage.insertBefore(box, svg);
      peindre();
    }

    function peindre() {
      Object.keys(formes).forEach(function (z) {
        var n = articlesZone(z).length, c = RAMPE[classe(n)];
        formes[z].forEach(function (f) {
          if (f.tagName === 'BUTTON') { f.style.background = c; f.style.color = classe(n) >= 4 ? '#fff' : '#16181b'; }
          else { f.setAttribute('fill', c); f.classList.toggle('pays-on', choisi === z); }
        });
      });
      Array.prototype.forEach.call(pills.children, function (b) {
        var z = b.getAttribute('data-zone'), n = articlesZone(z).length, k = classe(n);
        b.style.background = RAMPE[k]; b.style.color = k >= 4 ? '#fff' : '#16181b';
        b.textContent = nomZone(z) + ' · ' + n; b.setAttribute('aria-pressed', choisi === z ? 'true' : 'false');
      });
      if (choisi) remplirFiche(choisi);
    }

    ['Europe', 'Worldwide'].forEach(function (z) {
      var b = el('button', { type: 'button', className: 'map-pill', 'data-zone': z });
      b.addEventListener('click', function () { choisir(z); });
      pills.appendChild(b);
    });

    function ligne(a, riche) {
      var tx = textes(a);
      return el('li', null, [
        el('span', { className: 'map-date', text: dateLongue(a.date) }),
        a.lien ? el('a', { href: a.lien, target: '_blank', rel: 'noopener noreferrer', text: tx.aff.titre }) : el('strong', { text: tx.aff.titre }),
        el('div', { className: 'map-badges' }, [badgePert(a, true), a.statut && a.statut !== 'autre' ? badge('badge-statut badge-sm', libStatut(a.statut)) : null, badgeAmende(a, true), a.payant ? badge('badge-fine badge-fine-cap badge-sm', '🔒 ' + t('badge_payant')) : null]),
        riche && tx.aff.resume && !a.reserve ? el('p', { className: 'tl-ctx', text: tx.aff.resume }) : null,
        el('span', { className: 'map-meta', text: a.source || '' })
      ]);
    }
    function remplirFiche(z) {
      fiche.textContent = '';
      var arts = articlesZone(z).sort(function (x, y) { return x.date < y.date ? 1 : -1; });
      fiche.appendChild(el('h3', { text: nomZone(z) }));
      fiche.appendChild(el('p', { className: 'block-meta', text: t('map_articles')(arts.length) }));
      var top = reglementations(z).slice(0, 5);
      fiche.appendChild(el('h4', { text: t('map_top') }));
      if (!top.length) fiche.appendChild(el('p', { className: 'map-hint', text: t('map_none') }));
      else { var ol = el('ul', { className: 'map-items' }); top.forEach(function (a) { ol.appendChild(ligne(a, true)); }); fiche.appendChild(ol); }
      var dates = evenementsAgenda(365, z).filter(function (e) { return joursJusqua(e.date) >= 0; }).slice(0, 6);
      if (dates.length) {
        fiche.appendChild(el('h4', { text: t('map_dates') }));
        var ud = el('ul', { className: 'map-items' });
        dates.forEach(function (e) { ud.appendChild(el('li', null, [el('span', { className: 'map-date', text: (e.approx ? t('approx') + ' ' : '') + dateLongue(e.date) + ' · ' + t('in_days')(joursJusqua(e.date)) }),
          e.lien ? el('a', { href: e.lien, target: '_blank', rel: 'noopener noreferrer', text: e.titre }) : e.titre])); });
        fiche.appendChild(ud);
      }
      var refs = REF_TEXTES.filter(function (r) { return r.zone === z; }).sort(function (a, b) { return a.categorie - b.categorie; });
      if (refs.length) {
        fiche.appendChild(el('h4', { text: t('map_ref') + ' (' + refs.length + ')' }));
        var ur = el('ul', { className: 'map-items map-ref' });
        refs.forEach(function (r) { var x = refTexte(r); ur.appendChild(el('li', null, [el('span', { className: 'map-ref-cat', text: nomCategorie(r.categorie) }), el('a', { href: r.lien, target: '_blank', rel: 'noopener noreferrer', text: x.nom })])); });
        fiche.appendChild(ur);
      }
      if (arts.length) {
        fiche.appendChild(el('h4', { text: t('map_all') + ' (' + arts.length + ')' }));
        var ua = el('ul', { className: 'map-items' });
        arts.slice(0, 15).forEach(function (a) { ua.appendChild(ligne(a, false)); });
        fiche.appendChild(ua);
        if (arts.length > 15) {
          var plus = el('button', { type: 'button', className: 'linkbtn', text: t('map_more')(arts.length) });
          plus.addEventListener('click', function () { arts.slice(15).forEach(function (a) { ua.appendChild(ligne(a, false)); }); plus.remove(); });
          fiche.appendChild(plus);
        }
      }
    }
    function choisir(z) {
      choisi = z; peindre();
      if (window.matchMedia('(max-width: 900px)').matches) fiche.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    document.getElementById('map-vue').addEventListener('choix', function (e) { vue = e.detail.getAttribute('data-v'); dessiner(); });
    document.getElementById('map-periode').addEventListener('choix', function (e) { periode = e.detail.getAttribute('data-p'); peindre(); });
    if (!MONDE) document.getElementById('map-vue').hidden = true;
    window.__dessinerCarte = function () {
      try { PAYS = MONDE ? decoderTopo(MONDE) : null; } catch (e) { PAYS = null; }
      dessiner();
    };
  }

  /* ===================================================== TEXTES APPLICABLES */
  function nomCategorie(c) { var x = (REF.categories || {})[String(c)]; return x ? (x[LANG] || x.fr) : String(c || ''); }
  function refTexte(r) {
    return { nom: LANG === 'en' ? (r.nom_en || r.nom) : r.nom, resume: LANG === 'en' ? (r.resume_en || r.resume_fr) : r.resume_fr,
             pourquoi: LANG === 'en' ? (r.pourquoi_en || r.pourquoi_fr) : r.pourquoi_fr };
  }
  function refDepuis(v) { return !v || v === 'n.d.' ? '—' : (/^\d{4}-\d{2}-\d{2}$/.test(v) ? dateLongue(v) : v); }

  function renderReferentiel() {
    var liste = document.getElementById('ref-liste');
    var zs = document.getElementById('ref-zone'), cs = document.getElementById('ref-cat'), q = document.getElementById('ref-recherche');
    if (!REF_TEXTES.length) { document.getElementById('ref-resume').textContent = t('ref_none'); return; }
    var zones = {}; REF_TEXTES.forEach(function (r) { (zones[r.zone] = zones[r.zone] || []).push(r); });
    var ordre = Object.keys(zones).sort(function (a, b) { return a === 'Europe' ? -1 : b === 'Europe' ? 1 : nomZone(a).localeCompare(nomZone(b), LANG); });
    zs.appendChild(el('option', { value: '', text: t('ref_all_zones') }));
    ordre.forEach(function (z) { zs.appendChild(el('option', { value: z, text: nomZone(z) })); });
    cs.appendChild(el('option', { value: '', text: t('ref_all_cats') }));
    Object.keys(REF.categories || {}).forEach(function (c) { cs.appendChild(el('option', { value: c, text: c + '. ' + nomCategorie(c) })); });
    var groupes = ordre.map(function (z) {
      var grid = el('div', { className: 'ref-grid' });
      var cartesR = zones[z].sort(function (a, b) { return a.categorie - b.categorie; }).map(function (r) {
        var x = refTexte(r);
        var c = el('div', { className: 'ref-card' }, [
          el('p', { className: 'ref-cat', text: nomCategorie(r.categorie) }),
          el('a', { className: 'ref-nom', href: r.lien, target: '_blank', rel: 'noopener noreferrer', text: x.nom }),
          x.resume ? el('p', { text: x.resume }) : null,
          x.pourquoi ? el('p', { className: 'ref-why', text: '→ ' + x.pourquoi }) : null,
          el('div', { className: 'ref-meta' }, [r.acronyme ? badge('badge-statut badge-sm', r.acronyme) : null, badgePert(r, true),
            el('span', { text: [r.autorite, t('ref_since') + refDepuis(r.applicable_depuis)].filter(Boolean).join(' · ') }),
            r.amende_max ? badge('badge-fine badge-fine-cap badge-sm', t('ref_fine') + r.amende_max) : null])
        ]);
        c._r = r; c._t = normaliser([x.nom, r.nom, r.acronyme, r.autorite, x.resume, nomZone(r.zone)].join(' '));
        grid.appendChild(c); return c;
      });
      var sec = el('section', { className: 'ref-pays' }, [el('h3', { text: nomZone(z) + ' · ' + zones[z].length }), grid]);
      liste.appendChild(sec);
      return { sec: sec, cartes: cartesR };
    });
    function filtrer() {
      var z = zs.value, c = cs.value, s2 = normaliser(q.value).trim(), n = 0;
      groupes.forEach(function (g) {
        var vis = 0;
        g.cartes.forEach(function (k) {
          var ok = (!z || k._r.zone === z) && (!c || String(k._r.categorie) === c) && (!s2 || k._t.indexOf(s2) !== -1);
          k.hidden = !ok; if (ok) vis++;
        });
        g.sec.hidden = !vis; n += vis;
      });
      document.getElementById('ref-vide').hidden = n !== 0;
    }
    zs.addEventListener('change', filtrer); cs.addEventListener('change', filtrer); q.addEventListener('input', filtrer);
    document.getElementById('ref-resume').textContent = t('ref_summary')(REF_TEXTES.length, ordre.length);
    document.getElementById('ref-export').addEventListener('click', function () {
      var lignes = [];
      groupes.forEach(function (g) { g.cartes.forEach(function (k) {
        if (k.hidden) return;
        var r = k._r, x = refTexte(r);
        lignes.push([nomZone(r.zone), nomCategorie(r.categorie), x.nom, r.acronyme || '', r.autorite || '', r.applicable_depuis || '', r.amende_max || '', r.pertinence ? t('pert_badge')[r.pertinence] : '', x.resume || '', x.pourquoi || '', r.lien]);
      }); });
      telechargerCsv([t('ref_csv_head')].concat(lignes), 'cyberwatch_textes_applicables_');
    });
  }

  /* ======================================================= DÉBATS ET SIGNAUX */
  /* Stockés à part (data/debats.js) : jamais mélangés à la veille certifiée */
  function renderDebats() {
    var box = document.getElementById('deb-liste'), tend = document.getElementById('tendances');
    document.getElementById('deb-vide').hidden = DEBATS.length > 0;
    // tendances : simple comptage des sujets, 60 derniers jours contre les 60 précédents
    var maintenant = {}, avant = {};
    DEBATS.forEach(function (a) {
      var j = joursDepuis(a.date), cible = j <= 60 ? maintenant : (j <= 120 ? avant : null);
      if (!cible) return;
      themesDe(a).forEach(function (k) { cible[k] = (cible[k] || 0) + 1; });
    });
    var sujets = Object.keys(maintenant).filter(function (k) { return maintenant[k] >= 2; })
      .sort(function (a, b) { return ((maintenant[b] - (avant[b] || 0)) - (maintenant[a] - (avant[a] || 0))) || (maintenant[b] - maintenant[a]); }).slice(0, 10);
    if (!sujets.length) tend.appendChild(el('p', { className: 'block-meta', text: t('deb_none_trend') }));
    var max = Math.max.apply(null, sujets.map(function (k) { return Math.max(maintenant[k], avant[k] || 0); }).concat([1]));
    sujets.forEach(function (k) {
      var n1 = maintenant[k], n0 = avant[k] || 0, diff = n1 - n0;
      tend.appendChild(el('div', { className: 'trend' }, [
        el('span', { text: libelleTheme(k) }),
        el('div', { className: 'trend-bar', title: n0 + ' → ' + n1 }, [el('span', { className: 'trend-now', style: 'width:' + (n1 / max * 100) + '%' })]),
        el('span', { className: 'trend-n' }, [n0 + ' → ' + n1 + ' ', el('span', { className: diff > 0 ? 'trend-up' : '', text: diff > 0 ? '▲' : (diff < 0 ? '▼' : '=') })])
      ]));
    });
    var cartesD = DEBATS.slice().sort(function (x, y) { return x.date < y.date ? 1 : -1; }).map(function (a) {
      var tx = textes(a);
      var c = el('article', { className: 'deb-card' }, [
        el('span', { className: 'deb-mention', text: t('deb_mention') }),
        el('div', { className: 'card-kicker' }, [ZONES[a.zone] ? el('span', { className: 'zone-code', text: codeZone(a.zone) }) : null, el('span', { text: dateLongue(a.date) + ' · ' + (a.source || '') })]),
        el('h4', null, [a.lien ? el('a', { href: a.lien, target: '_blank', rel: 'noopener noreferrer', text: tx.aff.titre }) : tx.aff.titre]),
        tx.aff.resume ? el('p', { text: tx.aff.resume }) : null,
        el('div', { className: 'map-badges' }, themesDe(a).slice(0, 5).map(function (k) { return badge('badge-opinion badge-sm', libelleTheme(k)); }))
      ]);
      c._t = normaliser([a.titre, a.resume, tx.aff.titre, tx.aff.resume, a.source].join(' '));
      box.appendChild(c); return c;
    });
    document.getElementById('deb-recherche').addEventListener('input', function (e) {
      var q = normaliser(e.target.value).trim();
      cartesD.forEach(function (c) { c.hidden = q && c._t.indexOf(q) === -1; });
    });
  }

  /* ================================================================ SOURCES */
  var ACCES = {
    ok: { key: 'a_ok', cls: 'mode-ok', ordre: 3 }, partielle: { key: 'a_partial', cls: 'mode-page', ordre: 1 }, ko: { key: 'a_ko', cls: 'mode-err', ordre: 0 },
    non_configuree: { key: 'a_nc', cls: 'mode-off', ordre: 2 }, inactive: { key: 'a_off', cls: 'mode-off', ordre: 4 }, attente: { key: 'a_wait', cls: 'mode-off', ordre: 5 },
    retiree: { key: 'a_removed', cls: 'mode-off', ordre: 6 }
  };
  var MODES = { rss: 'm_rss', 'rss-auto': 'm_rssauto', 'rss+page': 'm_rsspage', page: 'm_page', erreur: 'm_err', api: 'm_api', rkc: 'm_rkc' };
  var ERREURS_EN = [
    [/Page (\S+) inaccessible : /g, 'Page $1 unreachable: '], [/Flux (\S+) illisible : /g, 'Feed $1 unreadable: '],
    [/Aucun lien d'article détecté sur (\S+) \(page probablement chargée en JavaScript\)/g, 'No article link found on $1 (page probably loaded with JavaScript)'],
    [/interdit aux robots par le robots\.txt du site/g, "disallowed for robots by the site's robots.txt"],
    [/Statut « ([^»]+) » dans l'Excel : source non interrogée\./g, 'Status “$1” in the spreadsheet: source not queried.'],
    [/Retirée depuis le site : plus interrogée\./g, 'Removed from the site: no longer queried.'],
    [/API Légifrance non configurée[^.]*\./g, 'Légifrance API not configured: add the GitHub secrets (see README).']
  ];
  function traduireErreur(txt) { if (LANG !== 'en') return txt; ERREURS_EN.forEach(function (r) { txt = txt.replace(r[0], r[1]); }); return txt; }
  function accesDe(s) { return s.acces || (s.mode === 'erreur' ? 'ko' : (s.erreur ? 'partielle' : 'ok')); }

  function renderEtat() {
    var tbody = document.getElementById('etat-lignes');
    var src = (ETAT.sources || []).slice().sort(function (a, b) {
      return ((ACCES[accesDe(a)] || {}).ordre - (ACCES[accesDe(b)] || {}).ordre) || nomZone(a.zone).localeCompare(nomZone(b.zone), LANG) || (a.nom || '').localeCompare(b.nom || '', LANG);
    });
    var compte = { ok: 0, partielle: 0, ko: 0, autre: 0 };
    src.forEach(function (s) {
      var a = accesDe(s), info = ACCES[a] || ACCES.ko, groupe = a in compte ? a : 'autre';
      compte[groupe]++;
      var details = [s.flux ? t('d_feed') + s.flux : '', s.page ? t('d_pages') + s.page : '', s.erreur ? '⚠ ' + traduireErreur(s.erreur) : ''].filter(Boolean).join(' · ');
      var inactif = ['inactive', 'attente', 'retiree'].indexOf(a) !== -1;
      var action = !s.url ? null : (a === 'retiree'
        ? el('button', { type: 'button', className: 'btn btn-sm', 'data-src-action': 'retablir', 'data-url': s.url, 'data-nom': s.nom, text: t('src_restore') })
        : el('button', { type: 'button', className: 'btn btn-sm btn-danger', 'data-src-action': 'retrait', 'data-url': s.url, 'data-nom': s.nom, text: t('src_remove') }));
      tbody.appendChild(el('tr', { 'data-acces': groupe, 'data-texte': normaliser((s.nom || '') + ' ' + (s.zone || '') + ' ' + nomZone(s.zone)) }, [
        el('td', null, [el('span', { className: 'mode ' + info.cls, text: t(info.key) })]),
        el('td', null, [s.url ? el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.nom || s.url }) : el('span', { text: s.nom }),
          s.origine === 'site' ? badge('badge-sm', t('added_site')) : null, s.nature === 'opinion' ? badge('badge-opinion badge-sm', t('opinion_src')) : null]),
        el('td', { text: nomZone(s.zone) }),
        el('td', { text: MODES[s.mode] ? t(MODES[s.mode]) : '—' }),
        el('td', { className: 'num', text: inactif ? '—' : String(s.nb_trouves || 0) }),
        el('td', { className: 'num', text: inactif ? '—' : String(s.nb_retenus || 0) }),
        el('td', { className: 'remarque', text: details }),
        el('td', null, [action])
      ]));
    });
    document.getElementById('etat-resume').textContent = src.length ? t('src_summary')(ETAT.mise_a_jour ? horodatage(ETAT.mise_a_jour) : '', src.length) : t('src_none');
    var stats = document.getElementById('etat-stats');
    [['ok', 'st_ok', 'mode-ok'], ['partielle', 'st_partial', 'mode-page'], ['ko', 'st_ko', 'mode-err'], ['autre', 'st_other', 'mode-off']].forEach(function (x) {
      stats.appendChild(el('div', { className: 'src-stat ' + x[2] }, [el('span', { className: 'src-stat-num', text: String(compte[x[0]]) }), el('span', { className: 'src-stat-lab', text: t(x[1]) })]));
    });
    var rech = document.getElementById('etat-recherche'), choix = '';
    function filtrer() {
      var q = normaliser(rech.value).trim(), n = 0;
      Array.prototype.forEach.call(tbody.children, function (tr) {
        var ok = (!choix || tr.getAttribute('data-acces') === choix) && (!q || tr.getAttribute('data-texte').indexOf(q) !== -1);
        tr.hidden = !ok; if (ok) n++;
      });
      document.getElementById('etat-vide').hidden = n !== 0 || !src.length;
    }
    document.getElementById('etat-filtres').addEventListener('choix', function (e) { choix = e.detail.getAttribute('data-a'); filtrer(); });
    rech.addEventListener('input', filtrer);
    var tr = META.traduction, st = document.getElementById('trad-status');
    if (tr && tr.active) st.textContent = tr.moteur ? t('trad_ok')(tr.faites || 0, tr.en_attente || 0) : t('trad_off') + (tr.erreur || '');
  }

  function renderAcronymes() {
    var tbody = document.getElementById('acro-lignes'), liste = ACRO.acronymes || [], nouveaux = 0;
    liste.forEach(function (e) {
      var nouveau = joursDepuis(e.premier_vu) <= 7, dans = e.dans_glossaire;
      if (nouveau) nouveaux++;
      tbody.appendChild(el('tr', { 'data-nouveau': nouveau ? '1' : '', 'data-hors': dans ? '' : '1', 'data-texte': normaliser([e.code].concat(e.variantes || []).join(' ')) }, [
        el('td', null, [el('strong', { text: libelleAcro(e.code) }), nouveau ? badge('badge-new badge-sm', t('new_badge')) : null]),
        el('td', { text: (e.variantes || []).join(', ') }), el('td', { className: 'num', text: String(e.nb_articles || 0) }),
        el('td', { text: (e.langues || []).map(function (l) { return (l || '').toUpperCase(); }).join(', ') }), el('td', { text: dateLongue(e.premier_vu) }),
        el('td', null, [el('span', { className: 'mode ' + (dans ? 'mode-ok' : 'mode-off'), text: dans ? t('ac_in') : t('ac_todo') })]),
        el('td', { className: 'remarque' }, [e.lien_exemple ? el('a', { href: e.lien_exemple, target: '_blank', rel: 'noopener noreferrer', text: e.exemple }) : (e.exemple || '')])
      ]));
    });
    document.getElementById('acro-resume').textContent = liste.length ? '· ' + t('ac_summary')(liste.length, nouveaux) : '';
    var r = document.getElementById('acro-recherche'), choix = '';
    function filtrer() {
      var q = normaliser(r.value).trim(), n = 0;
      Array.prototype.forEach.call(tbody.children, function (tr) {
        var ok = (!choix || (choix === 'nouveau' ? tr.getAttribute('data-nouveau') : tr.getAttribute('data-hors'))) && (!q || tr.getAttribute('data-texte').indexOf(q) !== -1);
        tr.hidden = !ok; if (ok) n++;
      });
      document.getElementById('acro-vide').hidden = n !== 0 || !liste.length;
    }
    document.getElementById('acro-filtres').addEventListener('choix', function (e) { choix = e.detail.getAttribute('data-a'); filtrer(); });
    r.addEventListener('input', filtrer);
  }

  function renderGlossaire() {
    var S = (LANG === 'en' && SYNTH_EN && SYNTH_EN.glossaire && SYNTH_EN.glossaire.length) ? SYNTH_EN : SYNTH_FR;
    if (!S || !S.glossaire || !S.glossaire.length) return;
    var ol = el('ol', { className: 'glossary' });
    S.glossaire.forEach(function (g) { ol.appendChild(el('li', null, [el('p', { className: 'gloss-term', text: g.terme }), el('p', { text: g.definition })])); });
    var d = el('details', { className: 'annexe' }, [el('summary', { text: t('glossary') }), ol]);
    var m = document.getElementById('methode'); m.parentNode.insertBefore(d, m);
  }

  /* ---------------------------------------- ajout / retrait de sources depuis le site */
  var modal = document.getElementById('modal');
  function demander(titre, corps, libelleOk, surOk) {
    document.getElementById('modal-titre').textContent = titre;
    var zone = document.getElementById('modal-corps'); zone.textContent = '';
    (Array.isArray(corps) ? corps : [corps]).forEach(function (c) { if (c) zone.appendChild(typeof c === 'string' ? el('p', { text: c }) : c); });
    var ok = document.getElementById('modal-ok'); ok.textContent = libelleOk;
    modal.hidden = false; (zone.querySelector('input') || ok).focus();
    function fermer() { modal.hidden = true; ok.onclick = null; document.removeEventListener('keydown', echap); }
    function echap(e) { if (e.key === 'Escape') fermer(); }
    document.addEventListener('keydown', echap);
    document.getElementById('modal-annuler').onclick = fermer;
    ok.onclick = function () { fermer(); surOk(zone); };
  }
  function lireJeton() { try { return localStorage.getItem('cw-gh-token') || ''; } catch (e) { return ''; } }
  function afficherMode() { document.getElementById('src-mode').textContent = !META.depot ? t('mode_none') : (lireJeton() ? t('mode_token') : t('mode_issue')); }
  function b64enc(txt) { var b = new TextEncoder().encode(txt), s2 = ''; b.forEach(function (x) { s2 += String.fromCharCode(x); }); return btoa(s2); }
  function b64dec(b64) { var bin = atob(b64.replace(/\s/g, '')), arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new TextDecoder().decode(arr); }
  function appliquerDemande(manu, d) {
    manu.ajouts = manu.ajouts || []; manu.retraits = manu.retraits || [];
    var urlDe = function (r) { return typeof r === 'string' ? r : r.url; }, jour = new Date().toISOString().slice(0, 10);
    if (d.action === 'ajout') manu.ajouts = manu.ajouts.filter(function (x) { return x.url !== d.url; });
    manu.retraits = manu.retraits.filter(function (r) { return urlDe(r) !== d.url; });
    if (d.action === 'ajout') manu.ajouts.push({ nom: d.nom, zone: d.zone, type: d.type, url: d.url, flux: d.flux, pages: d.pages, ajoute_le: jour });
    if (d.action === 'retrait') manu.retraits.push({ url: d.url, nom: d.nom, retire_le: jour });
    return manu;
  }
  function envoyerDemande(d) {
    var jeton = lireJeton(), depot = META.depot, branche = META.branche || 'main';
    if (!depot) { toast(t('mode_none')); return; }
    if (!jeton) {
      var corps = (LANG === 'en' ? 'Request made from the Cyber Watch site. Do not edit the block below.' : 'Demande faite depuis le site Cyber Watch. Ne modifiez pas le bloc ci-dessous.') + '\n\n```json\n' + JSON.stringify(d, null, 1) + '\n```\n';
      var titre = '[Source] ' + ({ ajout: 'Ajout', retrait: 'Retrait', retablir: 'Rétablissement' }[d.action]) + ' : ' + d.nom;
      window.open((META.serveur || 'https://github.com') + '/' + depot + '/issues/new?title=' + encodeURIComponent(titre) + '&body=' + encodeURIComponent(corps), '_blank', 'noopener');
      toast(t('opened_gh')); return;
    }
    var api = 'https://api.github.com/repos/' + depot + '/contents/config/sources_manuelles.json';
    var entetes = { Authorization: 'Bearer ' + jeton, Accept: 'application/vnd.github+json' };
    fetch(api + '?ref=' + encodeURIComponent(branche), { headers: entetes })
      .then(function (r) { if (r.status === 404) return null; if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (f) {
        var manu = f ? JSON.parse(b64dec(f.content)) : { ajouts: [], retraits: [] };
        appliquerDemande(manu, d);
        var corps = { message: 'Sources : ' + d.action + ' ' + d.nom + ' (depuis le site)', branch: branche, content: b64enc(JSON.stringify(manu, null, 2) + '\n') };
        if (f) corps.sha = f.sha;
        return fetch(api, { method: 'PUT', headers: entetes, body: JSON.stringify(corps) });
      })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + (r.status === 401 || r.status === 403 ? ' (jeton refusé)' : '')); toast(t('saved_ok')); })
      .catch(function (e) { toast(t('saved_ko') + e.message); });
  }
  function gestionSources() {
    var form = document.getElementById('src-form'), err = document.getElementById('src-form-err'), zoneSel = document.getElementById('sf-zone');
    Object.keys(ZONES).sort(function (a, b) { return nomZone(a).localeCompare(nomZone(b), LANG); }).forEach(function (z) { zoneSel.appendChild(el('option', { value: z, text: nomZone(z) })); });
    zoneSel.value = 'France';
    afficherMode();
    document.getElementById('src-ajouter').addEventListener('click', function () { form.hidden = !form.hidden; if (!form.hidden) form.querySelector('input').focus(); });
    document.getElementById('src-form-cancel').addEventListener('click', function () { form.hidden = true; err.hidden = true; });
    function lignes(v) { return (v || '').split(/[\s,;]+/).filter(function (u) { return /^https?:\/\//.test(u); }); }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = form.elements;
      var d = { action: 'ajout', nom: f.nom.value.trim(), zone: f.zone.value, type: f.type.value, url: f.url.value.trim(), flux: lignes(f.flux.value), pages: lignes(f.pages.value) };
      if (!d.nom || !/^https?:\/\/[^\s.]+\.[^\s]+/.test(d.url)) { err.textContent = t('sf_err'); err.hidden = false; return; }
      err.hidden = true;
      demander(t('confirm_add_t'), [t('confirm_add')(d.nom, d.url), lireJeton() ? t('via_token') : t('via_issue')], t('confirm'), function () { envoyerDemande(d); form.reset(); zoneSel.value = 'France'; form.hidden = true; });
    });
    document.getElementById('etat-lignes').addEventListener('click', function (e) {
      var b = e.target.closest('[data-src-action]'); if (!b) return;
      var d = { action: b.getAttribute('data-src-action'), url: b.getAttribute('data-url'), nom: b.getAttribute('data-nom') }, retrait = d.action === 'retrait';
      demander(retrait ? t('confirm_rm_t') : t('confirm_rs_t'), [retrait ? t('confirm_rm')(d.nom) : t('confirm_rs')(d.nom), lireJeton() ? t('via_token') : t('via_issue')], t('confirm'), function () { envoyerDemande(d); b.disabled = true; });
    });
    document.getElementById('src-jeton').addEventListener('click', function () {
      var champ = el('input', { type: 'password', className: 'search', autocomplete: 'off', placeholder: 'github_pat_…' }); champ.value = lireJeton();
      demander(t('token_t'), [t('token_help'), champ], t('confirm'), function () {
        var v = champ.value.trim();
        try { if (v) localStorage.setItem('cw-gh-token', v); else localStorage.removeItem('cw-gh-token'); } catch (x) {}
        toast(v ? t('token_saved') : t('token_cleared')); afficherMode();
      });
    });
  }

  /* ================================================================ EXPORTS */
  function ligneExport(c) {
    var titres = {}; RUBRIQUES.forEach(function (r) { titres[r.id] = r.titre; });
    var r = registre[c.id], d = r.d, tx = r.tx;
    var aff = (tx.traduit && !c._original) ? tx.aff : { titre: d.titre, resume: d.resume || '' };
    return { date: d.date, rubriqueId: d.rubrique, rubrique: titres[d.rubrique] || d.rubrique, titre: aff.titre, resume: d.reserve ? '' : aff.resume,
             titreOrig: (tx.traduit && !d.base) ? d.titre : '', langue: d.langue ? (LANGUES[LANG][d.langue] || d.langue) : '',
             source: d.source, zone: nomZone(d.zone), nature: libNature(d.nature), pert: d.pertinence ? t('pert_badge')[d.pertinence] : '',
             statut: d.statut ? libStatut(d.statut) : '', amende: d.amende ? (d.amende.plafond ? t('fine_cap') : '') + d.amende.texte : '', montant: d.amende ? d.amende.montant_eur : '',
             echeances: (d.echeances || []).map(function (e) { return (e.approx ? t('approx') + ' ' : '') + dateLongue(e.date); }).join(' ; '),
             pourquoi: d.nature === 'synthese' ? '' : pourquoiTexte(d), themes: (c._f.theme || []).map(libelleTheme).join(', '), lien: d.lien, traduit: tx.traduit && !d.base };
  }
  function cartesAffichees() { return cartes.filter(function (c) { return c.isConnected && c.closest('.rub') && !c.closest('.rub').hidden; }); }
  function telechargerCsv(lignes, prefixe) {
    function cell(v) { v = String(v === undefined || v === null ? '' : v).replace(/\r?\n/g, ' '); return /[";]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var csv = '﻿' + lignes.map(function (l) { return l.map(cell).join(';'); }).join('\r\n');
    var a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: prefixe + LANG + '_' + new Date().toISOString().slice(0, 10) + '.csv' });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exporterCsv() {
    var sel = cartesAffichees().map(ligneExport);
    if (!sel.length) { toast(t('nothing_export')); return; }
    telechargerCsv([t('csv_head')].concat(sel.map(function (x) {
      return [x.date, x.rubrique, x.pert, x.titre, x.titreOrig, x.langue, x.source, x.zone, x.nature, x.statut, x.amende, x.montant, x.echeances, x.pourquoi, x.themes, x.lien, x.resume];
    })), 'cyberwatch_');
    toast(sel.length + t('exported'));
  }
  function itemPdf(x) {
    return el('div', { className: 'pr-item' }, [
      el('h4', { text: x.titre }),
      el('p', { className: 'pr-line', text: [dateLongue(x.date), x.source, x.zone, x.nature, x.pert, x.statut].filter(Boolean).join(' · ') + (x.traduit ? ' · ' + t('translated_from') + x.langue : '') }),
      x.amende ? el('p', { className: 'pr-fine', text: x.amende }) : null,
      x.echeances ? el('p', { className: 'pr-fine', text: t('ech_title') + ' : ' + x.echeances }) : null,
      x.titreOrig ? el('p', { className: 'pr-orig', text: x.titreOrig }) : null,
      x.resume ? el('p', { text: x.resume }) : null,
      x.pourquoi ? el('p', { className: 'pr-why', text: t('why') + ' : ' + x.pourquoi }) : null,
      x.lien ? el('p', { className: 'pr-link', text: x.lien }) : null
    ]);
  }
  function imprimer(sel, titre, complet) {
    var rep = document.getElementById('print-report'); rep.textContent = '';
    rep.appendChild(el('h1', { text: titre }));
    rep.appendChild(el('p', { className: 'pr-meta', text: t('pdf_generated') + horodatage(new Date().toISOString()) + ' · ' + sel.length + t('pdf_count') + (META.mise_a_jour ? ' · ' + t('edition')(jourSeul(META.mise_a_jour), META.nb_nouveaux || 0) : '') }));
    if (complet) {
      var evs = evenementsAgenda(365).filter(function (e) { return joursJusqua(e.date) >= 0; });
      if (evs.length) {
        rep.appendChild(el('h2', { text: t('pdf_agenda') + ' (' + evs.length + ')' }));
        evs.forEach(function (e) { rep.appendChild(el('p', { className: 'pr-line', text: (e.approx ? t('approx') + ' ' : '') + dateLongue(e.date) + ' — ' + e.titre + ' (' + nomZone(e.zone) + ')' })); });
      }
    }
    var ordre = RUBRIQUES.map(function (r) { return r.id; }), groupes = {};
    sel.forEach(function (x) { (groupes[x.rubriqueId] = groupes[x.rubriqueId] || []).push(x); });
    var ids = Object.keys(groupes).sort(function (a, b) { return ordre.indexOf(a) - ordre.indexOf(b); });
    if (complet) {
      var toc = el('ol');
      ids.forEach(function (id) { toc.appendChild(el('li', { text: groupes[id][0].rubrique + ' — ' + groupes[id].length + t('pdf_count') })); });
      rep.appendChild(el('h2', { text: t('pdf_toc') })); rep.appendChild(toc);
    }
    ids.forEach(function (id) {
      var items = groupes[id];
      rep.appendChild(el('h2', { className: complet ? 'pr-break' : null, text: items[0].rubrique + ' (' + items.length + ')' }));
      if (!complet) { items.forEach(function (x) { rep.appendChild(itemPdf(x)); }); return; }
      var parZ = {}; items.forEach(function (x) { (parZ[x.zone] = parZ[x.zone] || []).push(x); });
      Object.keys(parZ).sort(function (a, b) { return a.localeCompare(b, LANG); }).forEach(function (z) {
        rep.appendChild(el('h3', { text: z + ' (' + parZ[z].length + ')' }));
        parZ[z].sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (x) { rep.appendChild(itemPdf(x)); });
      });
    });
    if (complet && REF_TEXTES.length) {
      rep.appendChild(el('h2', { className: 'pr-break', text: t('ref_pdf') + ' (' + REF_TEXTES.length + ')' }));
      var parZ2 = {}; REF_TEXTES.forEach(function (r) { (parZ2[r.zone] = parZ2[r.zone] || []).push(r); });
      Object.keys(parZ2).sort(function (a, b) { return nomZone(a).localeCompare(nomZone(b), LANG); }).forEach(function (z) {
        rep.appendChild(el('h3', { text: nomZone(z) + ' (' + parZ2[z].length + ')' }));
        parZ2[z].sort(function (a, b) { return a.categorie - b.categorie; }).forEach(function (r) {
          var x = refTexte(r);
          rep.appendChild(el('div', { className: 'pr-item' }, [el('h4', { text: x.nom + (r.acronyme ? ' — ' + r.acronyme : '') }),
            el('p', { className: 'pr-line', text: [nomCategorie(r.categorie), r.autorite, refDepuis(r.applicable_depuis)].filter(Boolean).join(' · ') }),
            r.amende_max ? el('p', { className: 'pr-fine', text: t('ref_fine') + r.amende_max }) : null, x.resume ? el('p', { text: x.resume }) : null,
            x.pourquoi ? el('p', { className: 'pr-why', text: x.pourquoi }) : null, el('p', { className: 'pr-link', text: r.lien })]));
        });
      });
    }
    if (complet && DEBATS.length) {
      rep.appendChild(el('h2', { className: 'pr-break', text: t('deb_pdf') }));
      rep.appendChild(el('p', { className: 'pr-avert', text: t('deb_warn') }));
      DEBATS.slice().sort(function (x, y) { return x.date < y.date ? 1 : -1; }).forEach(function (a) {
        var tx = textes(a);
        rep.appendChild(el('div', { className: 'pr-item' }, [el('h4', { text: tx.aff.titre }), el('p', { className: 'pr-line', text: [t('deb_mention'), dateLongue(a.date), a.source, nomZone(a.zone)].join(' · ') }),
          tx.aff.resume ? el('p', { text: tx.aff.resume }) : null, el('p', { className: 'pr-link', text: a.lien })]));
      });
    }
    document.body.classList.add('printing-report');
    setTimeout(function () { window.print(); }, 80);
  }
  window.addEventListener('afterprint', function () { document.body.classList.remove('printing-report'); });

  function buildTeamsSummary(card) {
    var x = ligneExport(card), lignes = [x.titre, '', [dateLongue(x.date), x.source, x.zone, x.pert].filter(Boolean).join(' · ')];
    if (x.resume) lignes.push('', x.resume);
    if (x.amende) lignes.push('', x.amende);
    if (x.echeances) lignes.push(t('ech_title') + ' : ' + x.echeances);
    if (x.lien) lignes.push('', t('source') + ' : ' + x.lien);
    if (x.themes) lignes.push('', t('keywords') + ' : ' + x.themes);
    return lignes.join('\n');
  }
  function copier(btn) {
    var text = buildTeamsSummary(btn.closest('.card'));
    function ok() { var o = btn.textContent; btn.textContent = t('copied'); btn.classList.add('done'); setTimeout(function () { btn.textContent = o; btn.classList.remove('done'); }, 1800); toast(t('copy_ok')); }
    function secours() { var ta = el('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.top = '-1000px'; document.body.appendChild(ta); ta.select(); var r = false; try { r = document.execCommand('copy'); } catch (e) {} ta.remove(); return r; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok).catch(function () { if (secours()) ok(); else toast(t('copy_ko')); });
    else if (secours()) ok(); else toast(t('copy_ko'));
  }

  /* ============================================================ démarrage */
  sur('textes', appliquerTextes);
  sur('en-tête', renderHeader);
  sur('veille', renderVeille);
  sur('filtres', renderFacettes);
  sur('veille (actions)', brancherVeille);
  sur('éditions', renderVersions);
  sur("l'essentiel", renderEssentiel);
  sur('carte', renderCarte);
  sur('textes applicables', renderReferentiel);
  sur('débats', renderDebats);
  sur('sources', renderEtat);
  sur('acronymes', renderAcronymes);
  sur('glossaire', renderGlossaire);
  sur('gestion des sources', gestionSources);
  sur('filtres (application)', appliquerFiltres);

  document.getElementById('export-csv').addEventListener('click', exporterCsv);
  document.getElementById('export-pdf').addEventListener('click', function () {
    var sel = cartesAffichees().map(ligneExport);
    if (!sel.length) { toast(t('nothing_export')); return; }
    imprimer(sel, t('pdf_title'), false);
  });
  document.getElementById('export-pdf-complet').addEventListener('click', function () {
    imprimer(cartes.filter(function (c) { return c._f.rang !== undefined; }).map(ligneExport), t('pdf_all_title'), true);
  });
  document.addEventListener('click', function (e) { var b = e.target.closest ? e.target.closest('[data-copy]') : null; if (b) copier(b); });

  function suivreHash() {
    var onglet = ongletDepuisHash();
    afficherOnglet(onglet);
    var h = (location.hash || '').slice(1), cible = h && ONGLETS.indexOf(h) === -1 && document.getElementById(h);
    if (cible && cible.classList.contains('card')) { ouvrir(cible, true); cible.scrollIntoView({ block: 'start' }); }
    else if (ONGLETS.indexOf(h) !== -1) { var nav = document.querySelector('.site-nav'); if (window.scrollY > nav.offsetTop) window.scrollTo(0, nav.offsetTop); }
  }
  window.addEventListener('hashchange', suivreHash);
  suivreHash();
})();
