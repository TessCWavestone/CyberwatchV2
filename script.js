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
  var ECARTES  = (window.VEILLE_ECARTES || {}).articles || [];
  var MONDE    = window.VEILLE_MONDE || null;
  var VERSIONS = ((window.VEILLE_VERSIONS || {}).versions || []).slice();
  var GLOSSAIRE = ACRO.glossaire || {};
  var META     = DATA.meta || {};
  // garde-fous : jamais d'avis d'expert dans la veille ; une information reprise par plusieurs sources = une seule carte
  var ARTICLES = (DATA.articles || []).filter(function (a) { return a.nature !== 'opinion' && !a.doublon_de; });
  var REF_TEXTES = REF.textes || [];
  var THEMES_P = (META.pertinence || {}).themes || {};
  var TEXTES_CLES_EN = META.textes_cles_en || {};
  var SUJETS = META.sujets || {};   // liste fermée des sujets suivis : { code: { fr, en, groupe: 'textes' | 'autorites' } }
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
      ref_original: "Titre d'origine : ", reactivable: 'Réactivable', reactivable_t: 'Le dernier test mensuel a pu lire cette source : elle peut être remise en « Actif » dans config/sources.xlsx.',
      retest_ok: function (d, n) { return 'Nouveau test du ' + d + ' : de nouveau lisible (' + n + ' articles trouvés), peut être réactivée'; },
      retest_ko: function (d) { return 'Nouveau test du ' + d + ' : toujours illisible'; }, aussi: 'Aussi publié par : ', rkc_veilles: 'Alertes RKC lues : ', rkc_n: function (n) { return n + ' articles'; },
      agenda_none_more: function (h) { return 'Aucune autre échéance repérée au-delà de ' + h + ' : les dates clés viennent des textes (« d’ici le… », « applicable à compter du… ») et des textes applicables.'; },
      tm_title: 'Nouvelles réglementations et normes',
      tm_lead: "Tous les textes importants de la période (lois, décrets, lignes directrices, normes, consultations), regroupés par texte : un sujet repris par plusieurs sources n'apparaît qu'une fois, avec toutes ses sources. Classement par règles fixes (textes clés, signal réglementaire), sans IA générative. En cas de doute, l'article est gardé et marqué « à vérifier ».",
      tm_empty: 'Aucun texte important repéré sur la période.', tm_sources: function (n) { return n + (n > 1 ? ' sources' : ' source'); }, tm_other: 'Autres textes officiels',
      tm_more: function (n) { return 'Voir les ' + n + ' autres sources'; },
      badge_ess: 'Essentiel', badge_verif: 'À vérifier', verif_title: "Repéré automatiquement dans une source non officielle (ou sans texte clé connu) : vérifiez sur la source officielle.",
      fb_important: '★ Important', fb_not: '✕ Pas pertinent', fb_t_imp: 'Signaler cet article comme important ?', fb_t_not: 'Signaler cet article comme non pertinent ?',
      fb_b_imp: "Il sera gardé et mis dans L'essentiel à la prochaine collecte ; les articles semblables seront mieux notés.",
      fb_b_not: "Il sera écarté à la prochaine collecte (consultable dans Sources › Articles écartés) ; les articles semblables seront moins bien notés.",
      surv_hidden: function (n) { return n + ' articles « à surveiller » (faible pertinence, gardés pour ne rien manquer) sont masqués.'; },
      surv_shown: function (n) { return n + ' articles « à surveiller » sont affichés.'; }, surv_show: 'Les afficher', surv_hide: 'Les masquer',
      why_key: 'Texte clé cité : ', why_motif: 'Classement : ',
      cov_title: 'Couverture : pays × rubrique', cov_lead: "Date du dernier article pertinent par pays et par rubrique. En rouge : rien depuis plus de 60 jours — vérifiez les sources de ce pays (ou l'actualité est simplement calme).",
      cov_none: 'rien', cov_summary: function (n) { return '· ' + n + ' cases sans article pertinent depuis 60 jours'; }, cov_zone: 'Pays / zone', cov_all: 'Toutes rubriques',
      ec_title: 'Articles écartés', ec_lead: "Articles collectés mais jugés hors sujet : alertes de vulnérabilités, événements, marchés, finance, télécoms, sujets hors Europe, note trop faible… Ils ne sont pas perdus : vérifiez ici qu'aucun texte important n'a été écarté à tort, et cliquez « Important » pour le remettre dans la veille.",
      ec_search_ph: 'Filtrer les écartés…', ec_export: 'Télécharger la liste (Excel)', ec_th_date: 'Date', ec_th_title: 'Titre', ec_th_reason: 'Motif', ec_all: 'Tous les motifs',
      ec_summary: function (n, s2) { return '· ' + n + ' sur 120 jours, dont ' + s2 + ' à la dernière collecte'; },
      ec_more: function (n) { return n + ' autres lignes : affinez le filtre ou téléchargez la liste.'; },
      ec_csv_head: ['Date', 'Titre', 'Titre (anglais)', 'Source', 'Pays / zone', 'Motif', 'Note', 'Lien'],
      flag_retirer: 'À retirer ?', flag_retirer_t: 'Rien lu lors des deux dernières collectes : la source bloque sans doute les robots.',
      m_opendata: 'Données ouvertes (JO)', pdf_prep: 'Préparation du PDF…', pdf_missing: 'Le PDF de la veille complète sera créé à la prochaine collecte sur GitHub.',
      pdf_fail: "PDF impossible ici (bibliothèque non chargée) : choisissez « Enregistrer au format PDF » dans la fenêtre qui s'ouvre.",
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
      une_title: 'À la une', une_lead: "Les cinq informations les plus importantes du moment, classées par des règles fixes (sans IA générative) : texte clé, échéance proche, texte adopté ou en vigueur, source officielle, fraîcheur.",
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
      search_ph: 'Rechercher (NIS2, IVDR, amende…) — "ENS" entre guillemets = recherche exacte',
      search_hint: 'Astuce : un acronyme entre guillemets ("ENS", "CRA") ne renvoie que les articles où il est détecté tel quel (majuscules respectées) ; sans guillemets, la recherche porte sur tout le texte.',
      f_autorite: 'Autorités', f_grand: 'Grands thèmes', ac_textes: 'Textes et normes', ac_autorites: 'Autorités', ac_candidats: 'Candidats à valider',
      ac_th_type: 'Type', ac_type: { textes: 'Texte ou norme', autorites: 'Autorité', candidat: 'Candidat (à valider)' }, filters: 'Affiner', reset: 'Tout effacer', show_originals: "Textes d'origine (non traduits)",
      sort_date: 'Plus récents', sort_pert: 'Plus pertinents', sort_fine: 'Plus fortes amendes',
      f_pert: 'Pertinence', f_zone: 'Pays / zone', f_theme: 'Textes et normes', f_section: 'Rubrique', f_status: 'Statut du texte', f_nature: 'Source', f_fine: 'Amendes',
      more_themes: function (n) { return 'Voir tout (' + n + ')'; }, less_themes: 'Réduire',
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
      src_title: 'Sources de la veille', src_lead: "Toutes les sources (liste maîtresse config/sources.xlsx du dépôt GitHub, ajouts faits depuis ce site, veille RKC) et leur accessibilité lors de la dernière collecte. Les sources « ignorées » ne sont pas collectées (motif affiché) ; elles sont retestées automatiquement le 1er lundi de chaque mois. Vous pouvez ajouter ou retirer une source : c'est pris en compte à la collecte suivante.",
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
      acro_title: 'Sujets suivis (textes, normes, autorités)', ac_all: 'Tous', ac_new: 'Nouveaux (7 jours)', ac_out: 'Conservés tels quels', ac_search_ph: 'Filtrer…',
      acro_lead: "Liste fermée et relue des sujets suivis (collecte/sujets.py) : ce sont eux qui servent de filtres dans Veille › Affiner. Les variantes nationales sont regroupées (ΓΚΠΔ, DSGVO → RGPD). Les « candidats » sont des acronymes inconnus vus dans au moins 3 articles pertinents : à ajouter à la liste s'ils sont utiles, sinon à ignorer. Dates, termes informatiques généraux (SQL, API…), finance et télécoms sont exclus.",
      ac_th_acro: 'Sujet', ac_th_var: 'Variantes', ac_th_n: 'Articles', ac_th_lang: 'Langues', ac_th_first: 'Vu la 1re fois', ac_th_glo: 'Glossaire', ac_th_ex: 'Exemple récent',
      ac_empty: 'Aucun sujet pour ce filtre.', ac_in: '✓ Harmonisé', ac_todo: 'Tel quel', ac_summary: function (n, nc) { return n + ' sujets présents dans la veille · ' + nc + ' candidats à valider'; },
      method: 'Méthode', method_lead: 'Comment la veille est collectée, notée et présentée — gratuitement, sans IA payante ni clé API.',
      footer: 'Cyber Watch — Wavestone · collecte, notation et traduction automatiques et gratuites.', footer_note: "Ce site ne constitue pas un conseil juridique. Les avis d'experts (onglet Débats et signaux) ne sont pas des informations certifiées.",
      nothing_export: 'Aucun article à exporter', exported: ' articles exportés', too_many: "Trop d'articles : filtrez d'abord (max. 300)",
      pdf_title: "Cyber Watch — sélection d'articles", pdf_all_title: 'Cyber Watch — la veille complète', pdf_generated: 'Généré le ', pdf_count: ' articles', pdf_toc: 'Sommaire', pdf_agenda: 'Dates clés à venir',
      csv_head: ['Date', 'Rubrique', 'Pertinence', 'Titre', "Titre d'origine", 'Langue', 'Source', 'Pays / zone', 'Nature', 'Statut', 'Amende', 'Amende (€, estimation)', 'Dates clés', 'Pourquoi', 'Thèmes', 'Lien', 'Résumé'],
      robust_err: "Une partie de la page n'a pas pu s'afficher : ", at: ' à ', no_date: 'Sans date',
      method_html: [
        ['Collecte', "<p>Chaque lundi à 7 h (et à la demande), un script lit toutes les sources : flux RSS, pages d'actualités datées, Journal officiel de l'UE (EUR-Lex) et français (données ouvertes de la DILA), et l'alerte RKC déposée dans un dépôt privé. La base couvre l'actualité depuis le 1er janvier 2026 (badge « Base 2026 » pour la recherche documentaire initiale).</p>"],
        ['Pertinence', "<p>Chaque article reçoit une note d'un petit modèle open source gratuit (exécuté sur GitHub) qui compare son sens aux thèmes du client, puis des règles fixes et lisibles décident du niveau : <strong>un texte clé cité</strong> (NIS2, CRA, AI Act, IVDR, MDR, MDCG, EHDS, Data Act, CER, ISO 27001, EN 18031, IEC 81001-5-1, DTAC, DSPT, ENS, HDS, SecNumCloud, C5, NEN 7510…) n'est jamais écarté ; <strong>« très pertinent »</strong> exige un signal réglementaire (loi, décret, lignes directrices, consultation, norme, sanction… dans toutes les langues) ; le bruit (alertes de vulnérabilités, événements, marchés, finance, télécoms) est écarté, sauf source officielle ; hors Europe, seuls les textes à portée mondiale (ISO/IEC, IMDRF, FDA cybersécurité des dispositifs) sont gardés.</p>"],
        ['Rien ne se perd', "<p>Les articles de faible pertinence sont gardés dans « À surveiller » (masqués par défaut). Les articles écartés restent consultables et téléchargeables dans Sources › Articles écartés. Les boutons « Important » et « Pas pertinent » corrigent le classement à la collecte suivante et servent d'exemples au modèle.</p>"],
        ["L'essentiel", "<p>« Points clés » : les 5 alertes les plus urgentes, 8 au plus (échéances à 30 jours, nouveaux textes adoptés, textes en préparation, textes inconnus détectés). Un nouveau texte y reste 4 semaines après sa détection, une échéance les 30 jours qui la précèdent ; ensuite l'alerte passe dans « Points clés précédents ». « Nouvelles réglementations et normes » ne retient que les textes et normes importants, regroupés par texte avec toutes leurs sources. En cas de doute (source non officielle, texte inconnu), l'article est gardé avec le badge « À vérifier ». Les dates clés ne sont retenues que près d'un mot d'obligation (« d'ici le », « applicable à compter du »…), jamais pour un webinaire ou une réunion.</p>"],
        ['Nouveautés et archives', "<p>« Nouveautés » montre les 30 derniers jours (60 s'il y a peu d'articles) ; tout le reste est dans « Archives ». Chaque collecte crée une édition, consultable dans le sélecteur « Édition ».</p>"],
        ['Débats et signaux', "<p>Les avis d'experts viennent uniquement de sources classées « Avis d'experts (non certifié) », et seuls les avis pertinents ou très pertinents sont gardés. Ils sont stockés à part et n'apparaissent jamais dans la veille, la carte, L'essentiel ni les textes applicables.</p>"],
        ['Veille RKC', "<p>L'alerte RKC (Nexis Newsdesk) est lue dans un dépôt privé ; seuls les articles pertinents ou très pertinents sont gardés. Seuls le titre, la publication, la date et la note sont publiés : l'extrait, souvent payant, n'apparaît jamais sur ce site.</p>"],
        ['Traduction et limites', "<p>Titres et résumés sont traduits par un moteur libre (Argos Translate) ; les acronymes ne sont jamais traduits ; une traduction défaillante est remplacée par le texte d'origine. Tout est automatique : en cas de doute, lisez la source. Les montants convertis sont des estimations.</p>"]
      ]
    },
    en: {
      skip: 'Skip to content', btn_export: 'Export ▾', btn_update: 'Run an update',
      ref_original: 'Original title: ', reactivable: 'Can be reactivated', reactivable_t: 'The last monthly test could read this source: it can be set back to “Actif” in config/sources.xlsx.',
      retest_ok: function (d, n) { return 'Re-tested on ' + d + ': readable again (' + n + ' articles found), can be reactivated'; },
      retest_ko: function (d) { return 'Re-tested on ' + d + ': still unreadable'; }, aussi: 'Also published by: ', rkc_veilles: 'RKC alerts read: ', rkc_n: function (n) { return n + ' articles'; },
      agenda_none_more: function (h) { return 'No other deadline found beyond ' + h + ': key dates come from the texts (“by…”, “applicable from…”) and from the applicable texts.'; },
      tm_title: 'New regulations and standards',
      tm_lead: 'Every important text of the period (laws, decrees, guidelines, standards, consultations), grouped by text: a topic covered by several sources appears once, with all its sources. Ranked by fixed rules (key texts, regulatory signal), with no generative AI. When in doubt, the article is kept and marked “to be checked”.',
      tm_empty: 'No important text found for this period.', tm_sources: function (n) { return n + (n > 1 ? ' sources' : ' source'); }, tm_other: 'Other official texts',
      tm_more: function (n) { return 'Show ' + n + ' more sources'; },
      badge_ess: 'Key point', badge_verif: 'To be checked', verif_title: 'Detected automatically in a non-official source (or with no known key text): check the official source.',
      fb_important: '★ Important', fb_not: '✕ Not relevant', fb_t_imp: 'Flag this article as important?', fb_t_not: 'Flag this article as not relevant?',
      fb_b_imp: 'It will be kept and added to Key points at the next collection; similar articles will be rated higher.',
      fb_b_not: 'It will be discarded at the next collection (still listed in Sources › Discarded articles); similar articles will be rated lower.',
      surv_hidden: function (n) { return n + ' “to monitor” articles (low relevance, kept so that nothing is missed) are hidden.'; },
      surv_shown: function (n) { return n + ' “to monitor” articles are shown.'; }, surv_show: 'Show them', surv_hide: 'Hide them',
      why_key: 'Key text mentioned: ', why_motif: 'Rating: ',
      cov_title: 'Coverage: country × section', cov_lead: 'Date of the latest relevant article per country and section. In red: nothing for more than 60 days — check the sources for that country (or news is simply quiet).',
      cov_none: 'none', cov_summary: function (n) { return '· ' + n + ' cells with no relevant article for 60 days'; }, cov_zone: 'Country / area', cov_all: 'All sections',
      ec_title: 'Discarded articles', ec_lead: 'Articles collected but judged off-topic: vulnerability alerts, events, business news, finance, telecoms, non-European topics, score too low… They are not lost: check here that no important text was discarded by mistake, and click “Important” to put it back in the watch.',
      ec_search_ph: 'Filter discarded articles…', ec_export: 'Download the list (Excel)', ec_th_date: 'Date', ec_th_title: 'Title', ec_th_reason: 'Reason', ec_all: 'All reasons',
      ec_summary: function (n, s2) { return '· ' + n + ' over 120 days, ' + s2 + ' at the last collection'; },
      ec_more: function (n) { return n + ' more rows: refine the filter or download the list.'; },
      ec_csv_head: ['Date', 'Title', 'Title (English)', 'Source', 'Country / area', 'Reason', 'Score', 'Link'],
      flag_retirer: 'Remove?', flag_retirer_t: 'Nothing read at the last two collections: the source probably blocks robots.',
      m_opendata: 'Open data (Official Journal)', pdf_prep: 'Preparing the PDF…', pdf_missing: 'The full-watch PDF will be created at the next collection on GitHub.',
      pdf_fail: 'PDF not available here (library not loaded): choose “Save as PDF” in the window that opens.',
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
      une_title: 'Top stories', une_lead: 'The five most important items right now, ranked by fixed rules (no generative AI): key text, upcoming deadline, adopted or in-force text, official source, freshness.',
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
      search_ph: 'Search (NIS2, IVDR, fine…) — "ENS" in quotes = exact search',
      search_hint: 'Tip: an acronym in quotes ("ENS", "CRA") only returns articles where it is detected as such (case-sensitive); without quotes, the whole text is searched.',
      f_autorite: 'Authorities', f_grand: 'Main themes', ac_textes: 'Texts and standards', ac_autorites: 'Authorities', ac_candidats: 'Candidates to review',
      ac_th_type: 'Type', ac_type: { textes: 'Text or standard', autorites: 'Authority', candidat: 'Candidate (to review)' }, filters: 'Refine', reset: 'Clear all', show_originals: 'Original texts (untranslated)',
      sort_date: 'Newest', sort_pert: 'Most relevant', sort_fine: 'Largest fines',
      f_pert: 'Relevance', f_zone: 'Country / area', f_theme: 'Texts and standards', f_section: 'Section', f_status: 'Status of the text', f_nature: 'Source', f_fine: 'Fines',
      more_themes: function (n) { return 'Show all (' + n + ')'; }, less_themes: 'Show fewer',
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
      src_title: 'Watch sources', src_lead: 'Every source (master list config/sources.xlsx in the GitHub repository, additions made on this site, RKC watch) and whether it could be read during the last collection. “Ignored” sources are not collected (reason shown); they are re-tested automatically on the first Monday of each month. You can add or remove a source: it applies from the next collection.',
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
      acro_title: 'Tracked topics (texts, standards, authorities)', ac_all: 'All', ac_new: 'New (7 days)', ac_out: 'Kept as is', ac_search_ph: 'Filter…',
      acro_lead: 'Closed, reviewed list of tracked topics (collecte/sujets.py): they are the filters in Watch › Refine. National variants are grouped (ΓΚΠΔ, DSGVO → GDPR). “Candidates” are unknown acronyms seen in at least 3 relevant articles: add them to the list if useful, otherwise ignore them. Dates, general IT terms (SQL, API…), finance and telecoms are excluded.',
      ac_th_acro: 'Topic', ac_th_var: 'Variants', ac_th_n: 'Articles', ac_th_lang: 'Languages', ac_th_first: 'First seen', ac_th_glo: 'Glossary', ac_th_ex: 'Recent example',
      ac_empty: 'No topic for this filter.', ac_in: '✓ Harmonised', ac_todo: 'As is', ac_summary: function (n, nc) { return n + ' topics found in the watch · ' + nc + ' candidates to review'; },
      method: 'Method', method_lead: 'How the watch is collected, rated and presented — free of charge, with no paid AI and no API key.',
      footer: 'Cyber Watch — Wavestone · free automated collection, rating and translation.', footer_note: 'This site does not constitute legal advice. Expert opinions (Debates & signals tab) are not certified information.',
      nothing_export: 'No article to export', exported: ' articles exported', too_many: 'Too many articles: filter first (max. 300)',
      pdf_title: 'Cyber Watch — selected articles', pdf_all_title: 'Cyber Watch — the full watch', pdf_generated: 'Generated on ', pdf_count: ' articles', pdf_toc: 'Contents', pdf_agenda: 'Upcoming key dates',
      csv_head: ['Date', 'Section', 'Relevance', 'Title', 'Original title', 'Language', 'Source', 'Country / area', 'Type', 'Status', 'Fine', 'Fine (€, estimate)', 'Key dates', 'Why', 'Topics', 'Link', 'Summary'],
      robust_err: 'Part of the page could not be displayed: ', at: ' at ', no_date: 'No date',
      method_html: [
        ['Collection', '<p>Every Monday at 7 am (and on demand), a script reads every source: RSS feeds, dated news pages, the EU Official Journal (EUR-Lex) and the French one (DILA open data), and the RKC alert stored in a private repository. The database covers news since 1 January 2026 (“2026 base” badge for the initial desk research).</p>'],
        ['Relevance', '<p>Each article is scored by a small, free, open-source model (running on GitHub) that compares its meaning with the client’s themes; then fixed, readable rules set the level: <strong>an article mentioning a key text</strong> (NIS2, CRA, AI Act, IVDR, MDR, MDCG, EHDS, Data Act, CER, ISO 27001, EN 18031, IEC 81001-5-1, DTAC, DSPT, ENS, HDS, SecNumCloud, C5, NEN 7510…) is never discarded; <strong>“highly relevant”</strong> requires a regulatory signal (law, decree, guidelines, consultation, standard, sanction… in every language); noise (vulnerability alerts, events, business news, finance, telecoms) is discarded unless the source is official; outside Europe, only texts with a global scope (ISO/IEC, IMDRF, FDA medical-device cybersecurity) are kept.</p>'],
        ['Nothing is lost', '<p>Low-relevance articles are kept under “To monitor” (hidden by default). Discarded articles remain listed and downloadable in Sources › Discarded articles. The “Important” and “Not relevant” buttons correct the rating at the next collection and serve as examples for the model.</p>'],
        ['Key points', '<p>“Key points”: the 5 most urgent alerts, 8 at most (deadlines within 30 days, newly adopted texts, texts in preparation, unknown texts detected). A new text stays there for 4 weeks after detection, a deadline for the 30 days before it; then the alert moves to “Previous key points”. “New regulations and standards” only keeps important texts and standards, grouped by text with all their sources. When in doubt (non-official source, unknown text), the article is kept with a “To be checked” badge. Key dates are only kept next to an obligation word (“by”, “applicable from”…), never for a webinar or a meeting.</p>'],
        ['Latest and archive', '<p>“Latest” shows the last 30 days (60 when there are few articles); everything else is in “Archive”. Each collection creates an edition, available in the “Edition” selector.</p>'],
        ['Debates & signals', '<p>Expert opinions come only from sources classified as “Expert opinion (not certified)”, and only relevant or highly relevant ones are kept. They are stored separately and never appear in the watch, the map, Key points or applicable texts.</p>'],
        ['RKC watch', '<p>The RKC alert (Nexis Newsdesk) is read from a private repository; only relevant or highly relevant articles are kept. Only the title, publication, date and rating are published: the excerpt, often paywalled, never appears on this site.</p>'],
        ['Translation and limits', '<p>Titles and summaries are translated by a free engine (Argos Translate); acronyms are never translated; a failed translation is replaced by the original text. Everything is automatic: when in doubt, read the source. Converted amounts are estimates.</p>']
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
  /* Sujets suivis (liste fermée, calculée par la collecte) : textes et normes, autorités */
  function libSujet(code) { var x = SUJETS[code]; return x ? (x[LANG] || x.fr || code) : code; }
  function sujetsDe(a, groupe) {
    var codes = a.sujets || (a.acronymes || []).filter(function (c) { return SUJETS[c]; });
    return codes.filter(function (c) { return SUJETS[c] && (!groupe || SUJETS[c].groupe === groupe); });
  }
  function sujetsDepuisTags(tags) {   // analyses rédigées : tags libres rapprochés des sujets suivis
    var out = [];
    (tags || []).forEach(function (tg) {
      var n = normaliser(tg);
      Object.keys(SUJETS).forEach(function (c) { if ((normaliser(c) === n || normaliser(SUJETS[c].fr) === n || normaliser(SUJETS[c].en) === n) && out.indexOf(c) === -1) out.push(c); });
    });
    return out;
  }
  function themesDe(a) {
    if (a.sujets || Object.keys(SUJETS).length) return sujetsDe(a).map(function (c) { return 's:' + c; });
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
  function libelleTheme(k) {
    if (k.indexOf('s:') === 0) return libSujet(k.slice(2));
    if (k.indexOf('g:') === 0) return nomTheme(k.slice(2));
    var i = LIB_THEME[k]; if (!i) return k.slice(2); return i.acro ? libelleAcro(i.val) : libelleTag(i.val);
  }

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
  var MOTIFS_EN = [
    [/^texte clé : /, 'key text: '], [/sujet hors Europe sans portée mondiale/, 'non-European topic with no global scope'],
    [/^hors sujet : /, 'off-topic: '], [/^source officielle, sujet secondaire : /, 'official source, secondary topic: '],
    [/source officielle, sans lien direct avec la cyber, les données ou la santé numérique/, 'official source, no direct link with cyber, data or digital health'],
    [/note trop faible \(([\d.]+)\), aucun texte clé/, 'score too low ($1), no key text'], [/aucun lien avec la cyber, les données, l'IA ou la santé/, 'no link with cyber, data, AI or health'],
    [/source volumineuse : seuls les articles pertinents sont gardés/, 'high-volume source: only relevant articles are kept'],
    [/veille RKC : moins que « pertinent »/, 'RKC watch: below “relevant”'], [/avis d'expert : moins que « pertinent »/, 'expert opinion: below “relevant”'],
    [/jugé non pertinent par un lecteur/, 'marked not relevant by a reader'], [/jugé important par un lecteur/, 'marked important by a reader'],
    [/texte à portée mondiale/, 'text with a global scope'], [/proche d'un thème hors sujet \(modèle\)/, 'close to an off-topic theme (model)'],
    [/vulnérabilités \/ alertes techniques/g, 'vulnerabilities / technical alerts'], [/menaces \/ incidents/g, 'threats / incidents'],
    [/événements \/ webinaires/g, 'events / webinars'], [/vœux \/ prix \/ RH/g, 'greetings / awards / HR'], [/marchés \/ entreprises/g, 'business / markets'],
    [/finance \/ banque/g, 'finance / banking'], [/télécoms/g, 'telecoms'], [/sensibilisation \/ conseils/g, 'awareness / tips'],
    [/médicaments \(hors dispositifs\)/g, 'medicines (not devices)'], [/hors sujet \(autres domaines\)/g, 'off-topic (other fields)']
  ];
  function motifTexte(m) { m = m || ''; if (LANG === 'en') MOTIFS_EN.forEach(function (r) { m = m.replace(r[0], r[1]); }); return m; }
  function libTexteCle(x) { return LANG === 'en' ? (TEXTES_CLES_EN[x] || x) : x; }
  function pourquoiTexte(a) {
    if (a.base) return (a.pourquoi || {})[LANG] || (a.pourquoi || {}).fr || '';
    var m = [];
    if (a.textes_cles && a.textes_cles.length) m.push(t('why_key') + a.textes_cles.map(libTexteCle).join(', '));
    else if (a.motif) m.push(t('why_motif') + motifTexte(a.motif));
    if (a.themes && a.themes.length) m.push(t('why_themes') + a.themes.map(nomTheme).join(', '));
    if (a.tags && a.tags.length) m.push(t('why_kw') + a.tags.map(libelleTag).join(', '));
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
    sur('nouveautés depuis la dernière visite', renderVisite);
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
    k.appendChild(el('span', { text: '· ' + (a.source || '') + (a.publication ? ' · ' + a.publication : '') }));
    return k;
  }

  function ajout(parent, n) { if (n) parent.appendChild(n); }
  function carteArticle(a) {
    var id = 'a-' + a.id, tx = textes(a);
    registre[id] = { d: a, tx: tx };
    var foot = el('div', { className: 'card-foot' });
    if (estNouveau(a)) ajout(foot, badge('badge-new', t('new_badge'), t('new_title')));
    ajout(foot, badgePert(a));
    if (a.essentiel) ajout(foot, badge('badge-ess', t('badge_ess')));
    if (a.essentiel && a.a_verifier) ajout(foot, badge('badge-verif', t('badge_verif'), t('verif_title')));
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
      theme: sujetsDe(a, 'textes').map(function (c) { return 's:' + c; }), autorite: sujetsDe(a, 'autorites').map(function (c) { return 's:' + c; }),
      grand: (a.pertinence !== 'faible' ? (a.themes || []) : []).map(function (x) { return 'g:' + x; }),
      codes: sujetsDe(a), brut: [a.titre, a.resume, tx.aff.titre, tx.aff.resume].join(' \n '), date: a.date || '', nouveau: estNouveau(a),
      recent: estRecent(a), rang: rangVersion(a), version: a.version || '',
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
      if (a.aussi && a.aussi.length) {
        var aussi = [t('aussi')];
        a.aussi.forEach(function (x, i) { if (i) aussi.push(' · '); aussi.push(el('a', { href: x.lien, target: '_blank', rel: 'noopener noreferrer', text: x.source + (x.publication ? ' (' + x.publication + ')' : '') })); });
        parts.push(el('p', { className: 'src-line' }, aussi));
      }
      if (themes.length) {
        var tl = el('ul', { className: 'tags' });
        themes.forEach(function (k) {
          var fac = (SUJETS[k.slice(2)] || {}).groupe === 'autorites' ? 'autorite' : 'theme';
          tl.appendChild(el('li', null, [el('button', { type: 'button', className: 'tag', 'data-theme': k, 'data-facette': fac, text: libelleTheme(k) })]));
        });
        parts.push(tl);
      }
      parts.push(el('div', { className: 'card-actions' }, [el('button', { type: 'button', className: 'btn btn-sm btn-copy', 'data-copy': true, text: t('copy') })].concat(a.base ? [] : boutonsAvis(a))));
      return parts;
    };
    return card;
  }

  /* Avis des lecteurs : « Important » / « Pas pertinent » -> issue GitHub « [Avis] » (ou écriture directe avec jeton) */
  function boutonsAvis(a) {
    return ['important', 'pas_pertinent'].map(function (v) {
      return el('button', { type: 'button', className: 'btn btn-sm btn-avis btn-avis-' + v, 'data-avis': v, 'data-id': a.id,
        'data-titre': (a.titre || '').slice(0, 250), 'data-lien': a.lien || '', text: v === 'important' ? t('fb_important') : t('fb_not') });
    });
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
    var codesS = sujetsDepuisTags(f.tags), themes = codesS.map(function (c) { return 's:' + c; });
    card._f = { section: 'syntheses', nature: 'synthese', zone: '—', pert: 'moyenne', statut: '', amende: '',
                theme: codesS.filter(function (c) { return SUJETS[c].groupe === 'textes'; }).map(function (c) { return 's:' + c; }),
                autorite: codesS.filter(function (c) { return SUJETS[c].groupe === 'autorites'; }).map(function (c) { return 's:' + c; }),
                grand: [], codes: codesS, brut: [f.titre, f.accroche].join(' '), recent: false, rang: undefined, version: '',
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
  var etatFiltres = { fenetre: 'recent', tri: 'date', q: [], exact: [], versionMax: null, versionSeule: '', du: '', au: '', depuisVisite: false };
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
    // Thèmes = textes et normes suivis ; Autorités ; Grands thèmes (note de pertinence). Listes courtes, toutes visibles.
    [['theme', 'fc-theme'], ['autorite', 'fc-autorite'], ['grand', 'fc-grand']].forEach(function (x) {
      var c = compte(x[0]), b = document.getElementById(x[1]); if (!b) return;
      var cles = Object.keys(c).sort(function (p, q) { return c[q] - c[p] || libelleTheme(p).localeCompare(libelleTheme(q)); });
      var MAX = 20, caches = [];
      cles.forEach(function (k, i) { var ch = chip(x[0], k, libelleTheme(k), c[k]); if (i >= MAX) { ch.hidden = true; caches.push(ch); } b.appendChild(ch); });
      if (!cles.length) b.closest('.facet').hidden = true;
      if (caches.length) {   // les moins fréquents derrière un bouton « Voir tout »
        var plus = el('button', { type: 'button', className: 'linkbtn chips-plus', text: t('more_themes')(cles.length) }), ouvert = false;
        plus.addEventListener('click', function (ev) {
          ev.preventDefault(); ev.stopPropagation(); ouvert = !ouvert;
          caches.forEach(function (ch) { ch.hidden = !ouvert && !ch.querySelector('input').checked; });
          plus.textContent = ouvert ? t('less_themes') : t('more_themes')(cles.length);
        });
        b.parentNode.appendChild(plus);
      }
    });
    var plusT = document.getElementById('more-themes'); if (plusT) plusT.hidden = true;
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

  var montrerFaible = false;
  function correspond(card, sel) {
    var f = card._f;
    card._masque = false;
    if (etatFiltres.versionMax !== null) {
      if (f.rang === undefined) { if (etatFiltres.versionSeule) return false; }
      else if (f.rang > etatFiltres.versionMax || (etatFiltres.versionSeule && f.version !== etatFiltres.versionSeule)) return false;
    }
    if (etatFiltres.du || etatFiltres.au) {   // période choisie : remplace « Nouveautés / Archives »
      if (!f.date || (etatFiltres.du && f.date < etatFiltres.du) || (etatFiltres.au && f.date > etatFiltres.au)) return false;
    } else if (!etatFiltres.q.length && !etatFiltres.exact.length && etatFiltres.versionMax === null && !etatFiltres.depuisVisite) {
      if (etatFiltres.fenetre === 'recent' && !f.recent) return false;
      if (etatFiltres.fenetre === 'archives' && f.recent) return false;
    }
    if (etatFiltres.depuisVisite && !f.nouveau) return false;
    if (sel.section.length && sel.section.indexOf(f.section) === -1) return false;
    if (sel.nature.length && sel.nature.indexOf(f.nature) === -1) return false;
    if (sel.zone.length && sel.zone.indexOf(f.zone) === -1) return false;
    if (sel.pert.length && sel.pert.indexOf(f.pert) === -1) return false;
    if (sel.statut.length && sel.statut.indexOf(f.statut) === -1) return false;
    if (sel.amende.length && sel.amende.indexOf(f.amende) === -1) return false;
    if (sel.theme.length && !sel.theme.some(function (k) { return f.theme.indexOf(k) !== -1; })) return false;
    if (sel.autorite.length && !sel.autorite.some(function (k) { return (f.autorite || []).indexOf(k) !== -1; })) return false;
    if (sel.grand.length && !sel.grand.some(function (k) { return (f.grand || []).indexOf(k) !== -1; })) return false;
    // recherche exacte : "ENS" -> sujet suivi ENS, ou le mot exact (casse respectée) dans le titre / résumé
    for (var x = 0; x < etatFiltres.exact.length; x++) {
      var ex = etatFiltres.exact[x], exN = normaliser(ex);
      var parCode = (f.codes || []).some(function (c) { return normaliser(c) === exN; });
      var rx = new RegExp('(^|[^\\p{L}\\p{N}])' + ex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}])', 'u');
      if (!parCode && !rx.test(f.brut || '')) return false;
    }
    for (var j = 0; j < etatFiltres.q.length; j++) if (f.texte.indexOf(etatFiltres.q[j]) === -1) return false;
    // « À surveiller » (faible pertinence) : masqué par défaut, sauf recherche ou filtre explicite
    if (f.pert === 'faible' && !montrerFaible && !etatFiltres.q.length && !etatFiltres.exact.length && sel.pert.indexOf('faible') === -1) { card._masque = true; return false; }
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
    var sel = { section: selection('section'), nature: selection('nature'), zone: selection('zone'), pert: selection('pert'), statut: selection('statut'), amende: selection('amende'), theme: selection('theme'), autorite: selection('autorite'), grand: selection('grand') };
    var total = 0, visibles = 0, nRecent = 0, nArch = 0, nMasques = 0, nFaiblesVis = 0;
    var parRub = {};
    cartes.forEach(function (c) {
      if (c._f.recent) nRecent++; else nArch++;
      total++;
      var ok = correspond(c, sel);
      if (c._masque) nMasques++;
      if (ok && c._f.pert === 'faible') nFaiblesVis++;
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
      var parMois = (etatFiltres.fenetre === 'archives' || etatFiltres.du || etatFiltres.au) && etatFiltres.tri === 'date' && !etatFiltres.q.length;
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
    var periode = etatFiltres.du || etatFiltres.au;
    document.getElementById('window-note').textContent = periode ? t('window_periode')(etatFiltres.du ? dateLongue(etatFiltres.du) : '…', etatFiltres.au ? dateLongue(etatFiltres.au) : t('per_auj'))
      : etatFiltres.depuisVisite ? t('window_visite')(VISITE.libelle) : etatFiltres.q.length ? '' : (etatFiltres.fenetre === 'recent' ? t('window_recent')(JOURS_RECENT) : t('window_archives')(JOURS_RECENT));
    Array.prototype.forEach.call(document.querySelectorAll('#fenetre button'), function (b) { b.disabled = !!(periode || etatFiltres.depuisVisite); });
    var base = (etatFiltres.q.length || periode || etatFiltres.depuisVisite) ? total : (etatFiltres.fenetre === 'recent' ? nRecent : nArch);
    document.getElementById('result-count').textContent = t('shown')(visibles, base);
    document.getElementById('empty-state').hidden = visibles !== 0 || !cartes.length;
    var sn = document.getElementById('surveiller-note');
    if (sn) {
      var nFaibles = montrerFaible ? nFaiblesVis : nMasques;
      sn.hidden = !nFaibles;
      document.getElementById('surveiller-texte').textContent = montrerFaible ? t('surv_shown')(nFaibles) + ' ' : t('surv_hidden')(nMasques) + ' ';
      document.getElementById('surveiller-bascule').textContent = montrerFaible ? t('surv_hide') : t('surv_show');
    }
    var actifs = sel.section.length + sel.nature.length + sel.zone.length + sel.pert.length + sel.statut.length + sel.amende.length + sel.theme.length + sel.autorite.length + sel.grand.length + (periode ? 1 : 0) + (etatFiltres.depuisVisite ? 1 : 0);
    var ac = document.getElementById('active-count'); ac.textContent = actifs; ac.hidden = !actifs;
    Array.prototype.forEach.call(document.querySelectorAll('.tag[data-theme]'), function (b) { var v = b.getAttribute('data-theme'); b.setAttribute('aria-pressed', sel.theme.indexOf(v) !== -1 || sel.autorite.indexOf(v) !== -1 ? 'true' : 'false'); });
  }

  function brancherVeille() {
    document.getElementById('fenetre').addEventListener('choix', function (e) { etatFiltres.fenetre = e.detail.getAttribute('data-f'); appliquerFiltres(); });
    document.getElementById('tri').addEventListener('change', function (e) { etatFiltres.tri = e.target.value; appliquerFiltres(); });
    var timer = null;
    document.getElementById('recherche').addEventListener('input', function (e) {
      clearTimeout(timer); timer = setTimeout(function () {
        // "…" entre guillemets = recherche exacte (acronyme ou mot, casse respectée) ; le reste = recherche large
        var v = e.target.value, exact = [];
        v = v.replace(/["“”«»]\s*([^"“”«»]+?)\s*["“”«»]/g, function (m0, x) { exact.push(x); return ' '; });
        etatFiltres.exact = exact;
        etatFiltres.q = normaliser(v).split(/\s+/).filter(Boolean); appliquerFiltres();
      }, 180);
    });
    var tg = document.getElementById('toggle-filters'), panneau = document.getElementById('facets');
    tg.addEventListener('click', function () { var o = panneau.hidden; panneau.hidden = !o; tg.setAttribute('aria-expanded', o ? 'true' : 'false'); });
    document.getElementById('reset-filters').addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('input[data-facet]'), function (i) { i.checked = false; });
      document.getElementById('recherche').value = ''; etatFiltres.q = []; etatFiltres.exact = [];
      etatFiltres.du = etatFiltres.au = ''; etatFiltres.depuisVisite = false;
      document.getElementById('per-du').value = document.getElementById('per-au').value = ''; document.getElementById('depuis-visite').checked = false;
      appliquerFiltres();
    });
    brancherPeriode();
    document.getElementById('surveiller-bascule').addEventListener('click', function () { montrerFaible = !montrerFaible; appliquerFiltres(); });
    document.getElementById('voir-originaux').addEventListener('change', function (e) { voirOriginaux = e.target.checked; cartes.forEach(function (c) { montrerTexte(c, voirOriginaux); }); });
    document.getElementById('rubriques').addEventListener('click', function (e) {
      var tag = e.target.closest('.tag[data-theme]');
      if (tag) {
        var inp = document.querySelector('input[data-facet="' + (tag.getAttribute('data-facette') || 'theme') + '"][value="' + tag.getAttribute('data-theme').replace(/"/g, '\\"') + '"]');
        if (inp) { inp.checked = !inp.checked; if (inp.closest('.chip').hidden) inp.closest('.chip').hidden = false; appliquerFiltres(); }
        return;
      }
      var bas = e.target.closest('[data-bascule]');
      if (bas) { var cb = bas.closest('.card'); montrerTexte(cb, !cb._original); return; }
      if (e.target.closest('[data-copy]') || e.target.closest('[data-avis]') || e.target.closest('a')) return;
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
  function renderEssentiel() {
    sur('points clés', renderPointsCles);
    renderTextesMois(30);
    document.getElementById('tm-periode').addEventListener('choix', function (e) { renderTextesMois(+e.detail.getAttribute('data-j')); });
    // nombre de dates à venir par horizon, affiché sur chaque bouton (les boutons ne changent rien s'il n'y a pas plus de dates)
    Array.prototype.forEach.call(document.querySelectorAll('#agenda-horizon button'), function (b) {
      var n = evenementsAgenda(+b.getAttribute('data-h')).filter(function (e) { return joursJusqua(e.date) >= 0; }).length;
      b.appendChild(el('span', { className: 'seg-n', text: ' ' + n }));
    });
    renderAgenda(90);
    document.getElementById('agenda-horizon').addEventListener('choix', function (e) { renderAgenda(+e.detail.getAttribute('data-h')); });
    sur('bilans', renderBilans);
    renderKpis();
  }

  /* Nouvelles réglementations et normes : articles de L'essentiel regroupés par texte clé */
  function renderTextesMois(jours) {
    var box = document.getElementById('tm-liste'); box.textContent = '';
    var groupes = {};
    ARTICLES.forEach(function (a) {
      if (!a.essentiel || a.base || joursDepuis(a.date) > jours) return;
      var cle = (a.textes_cles && a.textes_cles[0]) || '';
      (groupes[cle] = groupes[cle] || []).push(a);
    });
    var cles = Object.keys(groupes).sort(function (x, y) {
      if (!x) return 1; if (!y) return -1;
      return (groupes[y].length - groupes[x].length) || x.localeCompare(y);
    });
    document.getElementById('tm-vide').hidden = cles.length > 0;
    cles.forEach(function (cle) {
      var arts = groupes[cle].sort(function (x, y) {
        return ((x.nature === 'officielle' ? 0 : 1) - (y.nature === 'officielle' ? 0 : 1)) || (y.date > x.date ? 1 : y.date < x.date ? -1 : 0);
      });
      var ul = el('ul', { className: 'tm-items' }), cachees = [];
      arts.forEach(function (a, i) {
        var tx = textes(a);
        var li = el('li', { className: 'tm-item' }, [
          el('div', { className: 'tm-meta' }, [ZONES[a.zone] ? el('span', { className: 'zone-code', text: codeZone(a.zone) }) : null,
            el('span', { text: dateCourte(a.date) + ' · ' + (a.source || '') + (a.publication ? ' · ' + a.publication : '') }),
            a.nature === 'officielle' ? badge('badge-statut badge-sm', libNature('officielle')) : null,
            a.a_verifier ? badge('badge-verif badge-sm', t('badge_verif'), t('verif_title')) : null,
            a.statut && a.statut !== 'autre' ? badge('badge-statut badge-sm', libStatut(a.statut)) : null,
            a.payant ? badge('badge-fine badge-fine-cap badge-sm', '🔒 ' + t('badge_payant')) : null]),
          el('a', { className: 'tm-titre', href: a.lien || '#', target: '_blank', rel: 'noopener noreferrer', text: tx.aff.titre })
        ]);
        if (i >= 5) { li.hidden = true; cachees.push(li); }
        ul.appendChild(li);
      });
      var carte = el('article', { className: 'tm-groupe' }, [
        el('header', { className: 'tm-head' }, [el('h3', { text: cle ? libTexteCle(cle) : t('tm_other') }), el('span', { className: 'tm-n', text: t('tm_sources')(arts.length) })]),
        ul
      ]);
      if (cachees.length) {
        var plus = el('button', { type: 'button', className: 'linkbtn', text: t('tm_more')(cachees.length) });
        plus.addEventListener('click', function () { cachees.forEach(function (x) { x.hidden = false; }); plus.remove(); });
        carte.appendChild(plus);
      }
      box.appendChild(carte);
    });
  }

  function evenementsAgenda(horizon, zone, recul) {
    var evs = []; recul = recul || 30;   // recul : jours passés gardés (30 par défaut ; plus pour les bilans)
    ARTICLES.forEach(function (a) {
      if (zone && a.zone !== zone) return;
      if (a.pertinence === 'faible') return;   // pas d'échéance tirée d'un article « à surveiller »
      (a.echeances || []).forEach(function (e) {
        var j = joursJusqua(e.date);
        if (j < -recul || j > horizon) return;
        evs.push({ date: e.date, approx: e.approx, titre: textes(a).aff.titre, lien: a.lien, ctx: a.reserve ? '' : extraitEcheance(e), zone: a.zone, source: a.source, a: a });
      });
    });
    REF_TEXTES.forEach(function (r) {
      if (zone && r.zone !== zone) return;
      var v = r.applicable_depuis || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
      var j = joursJusqua(v);
      if (j < -recul || j > horizon) return;
      evs.push({ date: v, approx: false, titre: t('applies') + refTexte(r).nom, lien: r.lien, ctx: LANG === 'en' ? (r.resume_en || '') : (r.resume_fr || ''), zone: r.zone, source: r.autorite || '', ref: true });
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
    var libH = { 90: t('h90'), 180: t('h180'), 365: t('h365') }[horizon];
    var nPrec = horizon > 90 ? evenementsAgenda({ 180: 90, 365: 180, 1100: 365 }[horizon]).filter(function (e) { return joursJusqua(e.date) >= 0; }).length : -1;
    var note = document.getElementById('agenda-note');
    if (!note) { note = el('p', { className: 'block-meta', id: 'agenda-note' }); ol.parentNode.insertBefore(note, ol); }
    note.textContent = (nPrec === futurs.length && horizon > 90) ? t('agenda_none_more')({ 180: t('h90'), 365: t('h180'), 1100: t('h365') }[horizon]) : '';
    // 3 mois : 20 dates visibles puis « voir plus » ; horizons plus longs : tout est affiché (sinon les boutons semblent sans effet)
    var LIMITE = horizon > 90 ? 1000 : 20, mois = null, n = 0, plus = null;
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
    var recents = ARTICLES.filter(function (a) { return estRecent(a) && a.pertinence !== 'faible'; }).length;
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
    function articlesZone(z) { return ARTICLES.filter(function (a) { return a.zone === z && a.pertinence !== 'faible' && (!periode || joursDepuis(a.date) <= +periode); }); }
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
    return { nom: LANG === 'en' ? (r.nom_en || r.nom) : (r.nom_fr || r.nom), original: r.nom_original || '', resume: LANG === 'en' ? (r.resume_en || r.resume_fr) : r.resume_fr,
             pourquoi: LANG === 'en' ? (r.pourquoi_en || r.pourquoi_fr) : r.pourquoi_fr };
  }
  function refAutorite(r) { return LANG === 'en' ? (r.autorite_en || r.autorite || '') : (r.autorite || ''); }
  function refAmende(r) { return LANG === 'en' ? (r.amende_max_en || r.amende_max || '') : (r.amende_max || ''); }
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
          x.original ? el('p', { className: 'ref-orig', text: t('ref_original') + x.original }) : null,
          x.resume ? el('p', { text: x.resume }) : null,
          x.pourquoi ? el('p', { className: 'ref-why', text: '→ ' + x.pourquoi }) : null,
          el('div', { className: 'ref-meta' }, [r.acronyme ? badge('badge-statut badge-sm', r.acronyme) : null, badgePert(r, true),
            el('span', { text: [refAutorite(r), t('ref_since') + refDepuis(r.applicable_depuis)].filter(Boolean).join(' · ') }),
            r.amende_max ? badge('badge-fine badge-fine-cap badge-sm', t('ref_fine') + refAmende(r)) : null])
        ]);
        c._r = r; c._t = normaliser([x.nom, r.nom, r.nom_en, r.nom_original, r.acronyme, r.autorite, x.resume, nomZone(r.zone)].join(' '));
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
        lignes.push([nomZone(r.zone), nomCategorie(r.categorie), x.nom, r.acronyme || '', refAutorite(r), r.applicable_depuis || '', refAmende(r), r.pertinence ? t('pert_badge')[r.pertinence] : '', x.resume || '', x.pourquoi || '', r.lien]);
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
  var MODES = { rss: 'm_rss', 'rss-auto': 'm_rssauto', 'rss+page': 'm_rsspage', page: 'm_page', erreur: 'm_err', api: 'm_api', rkc: 'm_rkc', opendata: 'm_opendata' };
  var ERREURS_EN = [
    [/Page (\S+) inaccessible : /g, 'Page $1 unreachable: '], [/Flux (\S+) illisible : /g, 'Feed $1 unreadable: '],
    [/Aucun lien d'article détecté sur (\S+) \(page probablement chargée en JavaScript\)/g, 'No article link found on $1 (page probably loaded with JavaScript)'],
    [/interdit aux robots par le robots\.txt du site/g, "disallowed for robots by the site's robots.txt"],
    [/Statut « ([^»]+) » dans l'Excel : source non interrogée\./g, 'Status “$1” in the spreadsheet: source not queried.'],
    [/Retirée depuis le site : plus interrogée\./g, 'Removed from the site: no longer queried.'],
    [/Liste des archives DILA illisible : /g, 'DILA archive list unreadable: '], [/(\d+) archive\(s\) du JO lue\(s\)/g, '$1 Official Journal archive(s) read'],
    [/aucun article Newsdesk reconnu/g, 'no Newsdesk article recognised'],
    [/Retirée le ([\d\/]+) : le site bloque les robots \(erreur 403 ou page protégée\)\./g, 'Removed on $1: the site blocks robots (403 error or protected page).'],
    [/Retirée le ([\d\/]+) : page construite en JavaScript, aucun article lisible par le serveur\./g, 'Removed on $1: page built with JavaScript, no article readable by the server.'],
    [/Doublon de « ([^»]+) » : non interrogée\./g, 'Duplicate of “$1”: not queried.'], [/Remplacée par « ([^»]+) »\./g, 'Replaced by “$1”.'],
    [/Désactivée dans la liste des sources \(config\/sources\.xlsx\)/g, 'Disabled in the source list (config/sources.xlsx)']
  ];
  function traduireErreur(txt) { if (LANG !== 'en') return txt; ERREURS_EN.forEach(function (r) { txt = txt.replace(r[0], r[1]); }); return txt; }
  function inactifSrc(s) { return s.acces === 'inactive' || s.acces === 'retiree'; }
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
      var details = [s.flux ? t('d_feed') + s.flux : '', s.page ? t('d_pages') + s.page : '',
        (s.veilles && s.veilles.length) ? t('rkc_veilles') + s.veilles.map(function (v) { return (v.date ? dateLongue(v.date) : '?') + ' (' + t('rkc_n')(v.articles) + ')'; }).join(', ') : '',
        s.erreur ? (inactifSrc(s) ? '' : '⚠ ') + traduireErreur(s.erreur) : '',
        s.retest ? (s.retest.lisible ? t('retest_ok')(dateLongue(s.retest.date), s.retest.nb_trouves) : t('retest_ko')(dateLongue(s.retest.date))) : ''].filter(Boolean).join(' · ');
      var inactif = ['inactive', 'attente', 'retiree'].indexOf(a) !== -1;
      var action = !s.url ? null : (a === 'retiree'
        ? el('button', { type: 'button', className: 'btn btn-sm', 'data-src-action': 'retablir', 'data-url': s.url, 'data-nom': s.nom, text: t('src_restore') })
        : el('button', { type: 'button', className: 'btn btn-sm btn-danger', 'data-src-action': 'retrait', 'data-url': s.url, 'data-nom': s.nom, text: t('src_remove') }));
      tbody.appendChild(el('tr', { 'data-acces': groupe, 'data-texte': normaliser((s.nom || '') + ' ' + (s.zone || '') + ' ' + nomZone(s.zone)) }, [
        el('td', null, [el('span', { className: 'mode ' + info.cls, text: t(info.key) })]),
        el('td', null, [s.url ? el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.nom || s.url }) : el('span', { text: s.nom }),
          s.origine === 'site' ? badge('badge-sm', t('added_site')) : null, s.nature === 'opinion' ? badge('badge-opinion badge-sm', t('opinion_src')) : null,
          s.a_retirer ? badge('badge-verif badge-sm', t('flag_retirer'), t('flag_retirer_t')) : null,
          (s.retest && s.retest.lisible) ? badge('badge-ess badge-sm', t('reactivable'), t('reactivable_t')) : null]),
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

  /* Couverture : date du dernier article pertinent par pays et par rubrique (rouge si > 60 jours) */
  function renderCouverture() {
    var table = document.getElementById('cov-table'); if (!table) return;
    var zones = Object.keys(ZONES).filter(function (z) { return z !== 'Worldwide' && z !== 'Bulgarie'; })
      .sort(function (a, b) { return a === 'Europe' ? -1 : b === 'Europe' ? 1 : nomZone(a).localeCompare(nomZone(b), LANG); });
    var rubs = (META.rubriques || []).filter(function (r) { return r.id !== 'autres'; });
    var der = {};
    ARTICLES.forEach(function (a) {
      if (a.base || (a.pertinence !== 'elevee' && a.pertinence !== 'moyenne')) return;
      [a.rubrique, '*'].forEach(function (r) { var k = a.zone + '|' + r; if (!der[k] || a.date > der[k]) der[k] = a.date; });
    });
    var thead = el('tr', null, [el('th', { text: t('cov_zone') })].concat(rubs.map(function (r) { return el('th', { text: titreRubrique(r) }); })).concat([el('th', { text: t('cov_all') })]));
    table.appendChild(el('thead', null, [thead]));
    var tb = el('tbody'), rouges = 0;
    zones.forEach(function (z) {
      var tr = el('tr', null, [el('td', null, [el('span', { className: 'zone-code', text: codeZone(z) }), ' ' + nomZone(z)])]);
      rubs.map(function (r) { return r.id; }).concat(['*']).forEach(function (r) {
        var d = der[z + '|' + r], vieux = !d || joursDepuis(d) > 60;
        if (vieux) rouges++;
        tr.appendChild(el('td', { className: 'cov-cell' + (vieux ? ' cov-old' : ''), text: d ? dateCourte(d) + (joursDepuis(d) > 300 ? ' ' + d.slice(0, 4) : '') : t('cov_none') }));
      });
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    document.getElementById('cov-resume').textContent = t('cov_summary')(rouges);
  }

  /* Articles écartés : liste consultable et téléchargeable, avec bouton « Important » pour les repêcher */
  function renderEcartes() {
    var tbody = document.getElementById('ec-lignes'); if (!tbody) return;
    var liste = ECARTES.slice().sort(function (x, y) { return (y.date || '') > (x.date || '') ? 1 : -1; });
    var derniere = META.version || '';
    var nDerniere = META.nb_ecartes_nouveaux || 0;
    document.getElementById('ec-resume').textContent = liste.length ? t('ec_summary')(liste.length, nDerniere) : '';
    function cat(m) { return (m || '').replace(/ \([\d.]+\)/, '').split(' : ')[0]; }
    var cats = {}; liste.forEach(function (e) { var c = cat(e.motif); cats[c] = (cats[c] || 0) + 1; });
    var sel = document.getElementById('ec-motif');
    sel.appendChild(el('option', { value: '', text: t('ec_all') }));
    Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; }).forEach(function (c) { sel.appendChild(el('option', { value: c, text: motifTexte(c) + ' (' + cats[c] + ')' })); });
    var q = document.getElementById('ec-recherche'), MAX = 300, filtres = [];
    function titreDe(e) { return LANG === 'en' && e.titre_en ? e.titre_en : e.titre; }
    function dessiner() {
      var s2 = normaliser(q.value).trim(), c = sel.value;
      filtres = liste.filter(function (e) {
        return (!c || cat(e.motif) === c) && (!s2 || normaliser([e.titre, e.titre_en, e.source, e.motif].join(' ')).indexOf(s2) !== -1);
      });
      tbody.textContent = '';
      filtres.slice(0, MAX).forEach(function (e) {
        tbody.appendChild(el('tr', null, [
          el('td', { text: dateCourte(e.date) }),
          el('td', null, [el('a', { href: e.lien, target: '_blank', rel: 'noopener noreferrer', text: titreDe(e) })]),
          el('td', { text: (e.source || '') + (e.zone ? ' · ' + nomZone(e.zone) : '') }),
          el('td', { className: 'remarque', text: motifTexte(e.motif) }),
          el('td', null, [el('button', { type: 'button', className: 'btn btn-sm btn-avis btn-avis-important', 'data-avis': 'important', 'data-id': e.id,
            'data-titre': (e.titre || '').slice(0, 250), 'data-lien': e.lien || '', text: t('fb_important') })])
        ]));
      });
      document.getElementById('ec-plus').textContent = filtres.length > MAX ? t('ec_more')(filtres.length - MAX) : '';
    }
    q.addEventListener('input', dessiner); sel.addEventListener('change', dessiner);
    document.getElementById('ec-export').addEventListener('click', function () {
      telechargerCsv([t('ec_csv_head')].concat(filtres.map(function (e) { return [e.date, e.titre, e.titre_en || '', e.source, nomZone(e.zone), motifTexte(e.motif), e.score === undefined ? '' : e.score, e.lien]; })), 'cyberwatch_ecartes_');
    });
    dessiner();
  }

  function renderAcronymes() {
    var tbody = document.getElementById('acro-lignes');
    var suivis = ACRO.suivis || [], cands = ACRO.candidats || [];
    function titreEx(x) {   // titre d'exemple dans la langue du site (traduction si disponible)
      if (!x) return '';
      if (x.langue === LANG) return x.titre;
      return (LANG === 'en' ? x.titre_en : x.titre_fr) || x.titre;
    }
    function ligne(code, lib, type, n, ex) {
      tbody.appendChild(el('tr', { 'data-type': type, 'data-texte': normaliser(code + ' ' + lib + ' ' + titreEx(ex)) }, [
        el('td', null, [el('strong', { text: code }), lib && lib !== code ? el('span', { className: 'block-meta', text: ' — ' + lib }) : null]),
        el('td', null, [el('span', { className: 'mode ' + (type === 'candidat' ? 'mode-off' : 'mode-ok'), text: t('ac_type')[type] })]),
        el('td', { className: 'num', text: String(n || 0) }),
        el('td', { className: 'remarque' }, ex ? [dateCourte(ex.date) + ' · ', el('a', { href: ex.lien, target: '_blank', rel: 'noopener noreferrer', text: titreEx(ex) })] : [])
      ]));
    }
    suivis.forEach(function (e) { ligne(e.code, e[LANG] || e.fr, e.groupe, e.nb_articles, e.exemple); });
    cands.forEach(function (e) { ligne(e.code, '', 'candidat', e.nb_articles, e.exemple); });
    document.getElementById('acro-resume').textContent = (suivis.length || cands.length) ? '· ' + t('ac_summary')(suivis.length, cands.length) : '';
    var r = document.getElementById('acro-recherche'), choix = '';
    function filtrer() {
      var q = normaliser(r.value).trim(), n = 0;
      Array.prototype.forEach.call(tbody.children, function (tr) {
        var ok = (!choix || tr.getAttribute('data-type') === choix) && (!q || tr.getAttribute('data-texte').indexOf(q) !== -1);
        tr.hidden = !ok; if (ok) n++;
      });
      document.getElementById('acro-vide').hidden = n !== 0;
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
  function envoyerAvis(d) {
    var jeton = lireJeton(), depot = META.depot, branche = META.branche || 'main';
    if (!depot) { toast(t('mode_none')); return; }
    if (!jeton) {
      var corps = (LANG === 'en' ? 'Opinion given on the Cyber Watch site. Do not edit the block below.' : 'Avis donné depuis le site Cyber Watch. Ne modifiez pas le bloc ci-dessous.') + '\n\n```json\n' + JSON.stringify(d, null, 1) + '\n```\n';
      var titre = '[Avis] ' + (d.avis === 'important' ? 'Important' : 'Pas pertinent') + ' : ' + (d.titre || d.id).slice(0, 120);
      window.open((META.serveur || 'https://github.com') + '/' + depot + '/issues/new?title=' + encodeURIComponent(titre) + '&body=' + encodeURIComponent(corps), '_blank', 'noopener');
      toast(t('opened_gh')); return;
    }
    var api = 'https://api.github.com/repos/' + depot + '/contents/config/retours.json';
    var entetes = { Authorization: 'Bearer ' + jeton, Accept: 'application/vnd.github+json' };
    fetch(api + '?ref=' + encodeURIComponent(branche), { headers: entetes })
      .then(function (r) { if (r.status === 404) return null; if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (f) {
        var ret = f ? JSON.parse(b64dec(f.content)) : {};
        ret.articles = ret.articles || {};
        ret.articles[d.id] = { avis: d.avis, titre: d.titre, lien: d.lien, le: new Date().toISOString().slice(0, 10) };
        var corps = { message: 'Avis : ' + d.avis + ' — ' + (d.titre || d.id).slice(0, 80) + ' (depuis le site)', branch: branche, content: b64enc(JSON.stringify(ret, null, 1) + '\n') };
        if (f) corps.sha = f.sha;
        return fetch(api, { method: 'PUT', headers: entetes, body: JSON.stringify(corps) });
      })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); toast(t('saved_ok')); })
      .catch(function (e) { toast(t('saved_ko') + e.message); });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-avis]') : null; if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var d = { action: 'avis', avis: b.getAttribute('data-avis'), id: b.getAttribute('data-id'), titre: b.getAttribute('data-titre'), lien: b.getAttribute('data-lien') };
    var imp = d.avis === 'important';
    demander(imp ? t('fb_t_imp') : t('fb_t_not'), [d.titre, imp ? t('fb_b_imp') : t('fb_b_not'), lireJeton() ? t('via_token') : t('via_issue')], t('confirm'),
      function () { envoyerAvis(d); b.disabled = true; });
  });

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
             pourquoi: d.nature === 'synthese' ? '' : pourquoiTexte(d), themes: (c._f.theme || []).concat(c._f.autorite || []).map(libelleTheme).join(', '), lien: d.lien, traduit: tx.traduit && !d.base };
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
  function imprimer(sel, titre, complet, telecharger) {
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
            el('p', { className: 'pr-line', text: [nomCategorie(r.categorie), refAutorite(r), refDepuis(r.applicable_depuis)].filter(Boolean).join(' · ') }),
            r.amende_max ? el('p', { className: 'pr-fine', text: t('ref_fine') + refAmende(r) }) : null, x.resume ? el('p', { text: x.resume }) : null,
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
    if (telecharger) { telechargerPdf(rep, titre); return; }
    document.body.classList.add('printing-report');
    setTimeout(function () { window.print(); }, 80);
  }

  /* PDF téléchargé directement (sans fenêtre d'impression) : bibliothèque libre html2pdf.js,
     chargée seulement au clic ; rendu par morceaux pour les longues sélections. */
  var URL_HTML2PDF = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
  function chargerHtml2pdf() {
    return new Promise(function (ok, ko) {
      if (window.html2pdf) { ok(window.html2pdf); return; }
      var sc = document.createElement('script'); sc.src = URL_HTML2PDF; sc.async = true;
      sc.onload = function () { window.html2pdf ? ok(window.html2pdf) : ko(new Error('html2pdf')); };
      sc.onerror = function () { ko(new Error('html2pdf')); };
      document.head.appendChild(sc);
    });
  }
  function repliImpression(msg) {
    if (msg) toast(msg);
    document.body.classList.remove('pdf-rendering');
    document.body.classList.add('printing-report');
    setTimeout(function () { window.print(); }, 80);
  }
  function telechargerPdf(rep, titre, prefixe) {
    toast(t('pdf_prep'));
    var nom = 'cyberwatch_' + (prefixe || 'selection') + '_' + LANG + '_' + new Date().toISOString().slice(0, 10) + '.pdf';
    chargerHtml2pdf().then(function (h2p) {
      document.body.classList.add('pdf-rendering');
      // morceaux de ~12 éléments : chaque morceau est rendu séparément (limite de taille des images du navigateur)
      var enfants = Array.prototype.slice.call(rep.children), morceaux = [], cur = null, n = 0;
      enfants.forEach(function (c) {
        if (!cur || n >= 12) { cur = el('div', { className: 'print-report pdf-chunk' }); morceaux.push(cur); n = 0; }
        cur.appendChild(c.cloneNode(true)); if (c.classList.contains('pr-item')) n++;
      });
      var hote = el('div', { className: 'pdf-host' }); morceaux.forEach(function (m) { hote.appendChild(m); }); document.body.appendChild(hote);
      var opt = { margin: [10, 10, 12, 10], filename: nom, image: { type: 'jpeg', quality: 0.92 },
                  html2canvas: { scale: 1.6, useCORS: true, backgroundColor: '#ffffff' }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                  pagebreak: { mode: ['css', 'legacy'], avoid: ['.pr-item', 'h2', 'h3'] } };
      var w = h2p().set(opt).from(morceaux[0]).toPdf();
      morceaux.slice(1).forEach(function (m) {
        w = w.get('pdf').then(function (pdf) { pdf.addPage(); }).from(m).toContainer().toCanvas().toPdf();
      });
      return w.save().then(function () { hote.remove(); document.body.classList.remove('pdf-rendering'); });
    }).catch(function () { var h = document.querySelector('.pdf-host'); if (h) h.remove(); repliImpression(t('pdf_fail')); });
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

  /* ==========================================================================
     v5 — Points clés (alertes stables), nouveautés depuis la dernière visite,
     période et archives, bilans et restitutions, collecte en cours, assistant.
     ========================================================================== */
  var T5 = {
    fr: {
      new_title: 'Nouveau depuis votre dernière visite',
      vis_first: function (n) { return 'Bienvenue : les articles des 7 derniers jours sont marqués « Nouveau » (' + n + ').'; },
      vis_new: function (n, p, d) { return n + (n > 1 ? ' nouveautés' : ' nouveauté') + ' depuis votre dernière visite (' + d + ')' + (p ? ', dont ' + p + (p > 1 ? ' points clés' : ' point clé') : '') + '.'; },
      vis_none: function (d) { return 'Rien de nouveau depuis votre dernière visite (' + d + ').'; },
      vis_voir: 'Voir les nouveautés',
      window_periode: function (a, b) { return 'Période : du ' + a + ' au ' + b + '.'; },
      window_visite: function (d) { return 'Nouveautés depuis votre dernière visite (' + d + ').'; },
      f_periode: 'Période', per_du: 'Du', per_au: 'au', per_1m: '1 mois', per_clear: 'Effacer', per_auj: "aujourd'hui",
      since_visit: 'Seulement les nouveautés depuis ma dernière visite',
      per_arch: function (n, d) { return n + ' articles antérieurs au ' + d + ' sont archivés : ils sont chargés automatiquement si la période choisie commence avant cette date.'; },
      arch_loading: 'Chargement des archives…', arch_loaded: function (n) { return n + ' articles archivés chargés.'; }, arch_ko: 'Archives indisponibles.',
      pc_title: 'Points clés',
      pc_lead: "Les 5 faits réglementaires les plus urgents qui peuvent concerner l'entreprise dans un de ses pays (jusqu'à 8 en cas d'urgences) : échéance dans les 30 jours, nouveau texte adopté, texte en préparation (proposition, projet de loi, consultation), texte inconnu détecté. Un nouveau texte reste ici 4 semaines après sa détection ; chaque nouvelle étape (adoption, entrée en vigueur) crée une nouvelle alerte, et sa date d'application revient ici 30 jours avant. Le reste est dans « Points clés précédents ». Règles fixes, sans IA générative.",
      pc_empty: 'Aucun point clé en cours.', pc_rss: "S'abonner (Outlook / RSS)",
      pc_types: { echeance: 'Échéance', adopte: 'Texte adopté', signale: 'Signalé important', proposition: 'Texte en préparation', a_qualifier: 'Nouveau texte détecté' },
      pc_types_long: { echeance: 'Échéance dans les 30 jours', adopte: 'Nouveau texte adopté, publié ou en vigueur', signale: 'Jugé important par un lecteur', proposition: 'Proposition, projet de loi, consultation, lignes directrices', a_qualifier: 'Texte absent de la liste des textes suivis : à qualifier' },
      pc_new: 'Nouveau', pc_maj: 'Mis à jour', pc_maj_t: 'Nouvelle source depuis votre dernière visite',
      pc_inconnu: 'Texte inconnu', pc_inconnu_t: "Ce texte n'est pas dans la liste des textes suivis : repéré par des signaux forts (adopté, publié, proposition…). À qualifier par un humain.",
      pc_detecte: function (d) { return 'Détecté le ' + d; }, pc_sources: function (n) { return n + (n > 1 ? ' sources' : ' source'); },
      pc_texte: 'Texte : ', pc_toutes: function (n) { return 'Toutes les sources (' + n + ')'; }, pc_voir_veille: 'Voir dans la veille',
      pc_plus: function (n) { return 'Voir les ' + n + ' autres points clés'; }, pc_moins: 'Réduire',
      pc_prev: 'Points clés précédents', pc_prev_lead: 'Les autres alertes encore d’actualité, puis les alertes terminées (affichées plus de 4 semaines, ou échéance passée), classées par mois.',
      pc_autres: function (n) { return 'Autres alertes en cours (' + n + ')'; },
      vis_passes: function (n) { return n + (n > 1 ? ' points clés détectés depuis votre visite sont déjà dans « Points clés précédents »' : ' point clé détecté depuis votre visite est déjà dans « Points clés précédents »'); },
      pc_prev_n: function (n) { return '(' + n + ')'; }, pc_fin: function (d) { return 'jusqu’au ' + d; },
      rss_titre: "S'abonner aux points clés", rss_copier: 'Copier le lien', rss_copie: 'Lien copié',
      rss_corps: ["Ce lien donne un flux RSS des points clés, mis à jour à chaque collecte. Outlook (version classique) : clic droit sur « Flux RSS » dans la liste des dossiers › « Ajouter un nouveau flux RSS… », puis collez le lien. Il fonctionne aussi dans tout lecteur RSS.", "Le nouvel Outlook et Outlook sur le web ne lisent pas les flux RSS : utilisez dans ce cas un lecteur RSS."],
      bi_title: 'Bilans et restitutions',
      bi_lead: 'Un bilan par mois et une restitution sur la période de votre choix (6 derniers mois par défaut), pour ne rien perdre même si la veille n’a pas été consultée chaque semaine.',
      bi_month: 'Bilan mensuel', bi_pdf: 'Télécharger (PDF)', bi_rest: 'Restitution sur une période', bi_rest_pdf: 'Restitution (PDF)', bi_rest_csv: 'Articles de la période (Excel)',
      bi_rest_note: 'La restitution reprend les points clés, les nouveaux textes et normes, les dates clés et les articles très pertinents de la période, classés par pays.',
      bi_en_cours: ' (en cours)',
      bi_k: { pc: 'points clés', textes: 'textes et normes importants', pert: 'articles très pertinents', ech: 'dates clés (mois + 3 mois)' },
      bi_top_pc: 'Points clés du mois', bi_top_textes: 'Textes les plus cités', bi_rien: 'Rien de notable ce mois-ci.',
      rest_titre: function (a, b) { return 'Restitution de la veille — du ' + a + ' au ' + b; },
      bilan_titre: function (m) { return 'Bilan mensuel de la veille — ' + m; },
      rp_periode: function (a, b) { return 'Période : du ' + a + ' au ' + b; },
      rp_pc: 'Points clés', rp_textes: 'Nouveaux textes et normes', rp_dates: 'Dates clés (période et 3 mois suivants)', rp_pert: 'Articles très pertinents, par pays',
      rp_tronque: function (n) { return '… et ' + n + ' autres articles (voir l’export Excel).'; }, rp_vide: 'Rien sur la période.',
      rp_resume: function (a, b, c, d) { return a + ' points clés · ' + b + ' textes et normes importants · ' + c + ' articles très pertinents · ' + d + ' dates clés'; },
      cs_titre: 'Collecte en cours', cs_auto: 'automatique', cs_manuel: 'lancée depuis le site ou GitHub',
      cs_lancee: function (h, d) { return 'démarrée à ' + h + ' (' + d + ')'; },
      cs_etape: function (n, m, l) { return 'Étape ' + n + '/' + m + ' : ' + l; }, cs_fin: function (h) { return 'fin estimée vers ' + h; },
      cs_attente: 'En attente d’une machine GitHub…', cs_demandee: 'Collecte demandée : démarrage dans quelques secondes…',
      cs_ok: 'Collecte terminée : les nouvelles données sont en ligne.', cs_recharger: 'Recharger la page',
      cs_ko: 'La collecte a échoué ou a été interrompue. Le site affiche toujours les données de la collecte précédente.',
      cs_etapes: { prep: 'Préparation', garde: 'Vérification de l’horaire', rkc: 'Lecture des veilles RKC', outils: 'Installation des outils', collecte: 'Lecture des sources, tri et traduction des articles', enreg: 'Enregistrement des données', publi: 'Publication du site' },
      update_title_relais: 'Lance une nouvelle collecte (environ 10 minutes), sans compte GitHub',
      lm_titre: 'Lancer une nouvelle collecte ?', lm_ok: 'Lancer',
      lm_corps: function (m) { return 'La collecte lit toutes les sources, trie et traduit les articles, puis met le site à jour. Elle dure environ ' + m + ' minutes ; son avancement s’affiche en haut de la page.'; },
      lm_envoye: 'Collecte demandée.', lm_deja: 'Une collecte est déjà en cours.', lm_heure: 'Une collecte a déjà été lancée il y a moins d’une heure.',
      lm_jour: 'Nombre maximal de collectes pour aujourd’hui atteint.', lm_ko: 'Impossible de lancer la collecte pour le moment.',
      lm_code_titre: "Code d'accès", lm_code_corps: "Saisissez le code d'accès communiqué par l'équipe.", lm_code_ko: 'Code incorrect, réessayez.',
      as_btn: 'Poser une question', as_title: 'Assistant de recherche', as_go: 'Chercher', as_ph: 'Ex. : obligations NIS2 en Belgique',
      as_note: "L'assistant cherche uniquement dans le contenu de la veille (points clés, articles, textes applicables, dates clés). Il ne rédige pas de réponse et ne va pas chercher sur Internet : il vous montre les contenus les plus proches de votre question.",
      as_ex: ['Obligations NIS2 en Belgique', 'Échéances des 3 prochains mois en Allemagne', 'Nouveaux textes sur les dispositifs médicaux', 'Sanctions RGPD en Italie', "Projets de loi sur l'intelligence artificielle"],
      as_compris: "J'ai compris : ", as_pays: 'pays', as_sujet: 'sujet', as_mots: 'mots', as_type: 'recherche',
      as_types: { echeance: 'échéances', sanction: 'sanctions', nouveau: 'nouveautés', projet: 'textes en préparation', obligation: 'obligations' },
      as_horizon: function (j) { return 'dans les ' + Math.round(j / 30) + ' mois'; },
      as_sec: { alerte: 'Points clés', date: 'Dates clés', texte: 'Textes applicables', article: 'Articles de la veille' },
      as_rien: "Rien trouvé dans la veille pour cette question. Essayez d'autres mots : le nom du texte (NIS2, IVDR…), le pays, ou un mot du sujet.",
      as_plus: function (n) { return 'Voir ' + n + ' résultats de plus'; }, as_ref_voir: 'Voir dans Textes applicables', as_applicable: 'Applicable depuis le '
    },
    en: {
      new_title: 'New since your last visit',
      vis_first: function (n) { return 'Welcome: articles from the last 7 days are marked “New” (' + n + ').'; },
      vis_new: function (n, p, d) { return n + (n > 1 ? ' new items' : ' new item') + ' since your last visit (' + d + ')' + (p ? ', including ' + p + (p > 1 ? ' key points' : ' key point') : '') + '.'; },
      vis_none: function (d) { return 'Nothing new since your last visit (' + d + ').'; },
      vis_voir: 'Show new items',
      window_periode: function (a, b) { return 'Period: from ' + a + ' to ' + b + '.'; },
      window_visite: function (d) { return 'New since your last visit (' + d + ').'; },
      f_periode: 'Period', per_du: 'From', per_au: 'to', per_1m: '1 month', per_clear: 'Clear', per_auj: 'today',
      since_visit: 'Only new items since my last visit',
      per_arch: function (n, d) { return n + ' articles older than ' + d + ' are archived: they are loaded automatically when the chosen period starts before that date.'; },
      arch_loading: 'Loading archives…', arch_loaded: function (n) { return n + ' archived articles loaded.'; }, arch_ko: 'Archives unavailable.',
      pc_title: 'Key points',
      pc_lead: 'The 5 most urgent regulatory facts that may concern the company in one of its countries (up to 8 when urgent): deadline within 30 days, newly adopted text, text in preparation (proposal, bill, consultation), unknown text detected. A new text stays here for 4 weeks after detection; each new step (adoption, entry into force) creates a new alert, and its application date comes back here 30 days before. Everything else is in “Previous key points”. Fixed rules, no generative AI.',
      pc_empty: 'No current key point.', pc_rss: 'Subscribe (Outlook / RSS)',
      pc_types: { echeance: 'Deadline', adopte: 'Text adopted', signale: 'Flagged important', proposition: 'Text in preparation', a_qualifier: 'New text detected' },
      pc_types_long: { echeance: 'Deadline within 30 days', adopte: 'New text adopted, published or in force', signale: 'Flagged as important by a reader', proposition: 'Proposal, bill, consultation, guidelines', a_qualifier: 'Text not in the list of tracked texts: to be assessed' },
      pc_new: 'New', pc_maj: 'Updated', pc_maj_t: 'New source since your last visit',
      pc_inconnu: 'Unknown text', pc_inconnu_t: 'This text is not in the list of tracked texts: spotted through strong signals (adopted, published, proposal…). To be assessed by a person.',
      pc_detecte: function (d) { return 'Detected on ' + d; }, pc_sources: function (n) { return n + (n > 1 ? ' sources' : ' source'); },
      pc_texte: 'Text: ', pc_toutes: function (n) { return 'All sources (' + n + ')'; }, pc_voir_veille: 'Show in the watch',
      pc_plus: function (n) { return 'Show ' + n + ' more key points'; }, pc_moins: 'Show less',
      pc_prev: 'Previous key points', pc_prev_lead: 'Other current alerts, then finished alerts (shown for more than 4 weeks, or deadline passed), by month.',
      pc_autres: function (n) { return 'Other current alerts (' + n + ')'; },
      vis_passes: function (n) { return n + (n > 1 ? ' key points detected since your visit are already in “Previous key points”' : ' key point detected since your visit is already in “Previous key points”'); },
      pc_prev_n: function (n) { return '(' + n + ')'; }, pc_fin: function (d) { return 'until ' + d; },
      rss_titre: 'Subscribe to key points', rss_copier: 'Copy the link', rss_copie: 'Link copied',
      rss_corps: ['This link is an RSS feed of the key points, updated at each collection. Outlook (classic): right-click “RSS Feeds” in the folder list › “Add a New RSS Feed…”, then paste the link. It also works in any RSS reader.', 'The new Outlook and Outlook on the web do not read RSS feeds: use an RSS reader instead.'],
      bi_title: 'Reports',
      bi_lead: 'A report per month and a summary over the period of your choice (last 6 months by default), so that nothing is lost even if the watch was not checked every week.',
      bi_month: 'Monthly report', bi_pdf: 'Download (PDF)', bi_rest: 'Summary over a period', bi_rest_pdf: 'Summary (PDF)', bi_rest_csv: 'Articles of the period (Excel)',
      bi_rest_note: 'The summary includes the key points, new texts and standards, key dates and highly relevant articles of the period, by country.',
      bi_en_cours: ' (in progress)',
      bi_k: { pc: 'key points', textes: 'important texts and standards', pert: 'highly relevant articles', ech: 'key dates (month + 3 months)' },
      bi_top_pc: 'Key points of the month', bi_top_textes: 'Most cited texts', bi_rien: 'Nothing notable this month.',
      rest_titre: function (a, b) { return 'Regulatory watch summary — ' + a + ' to ' + b; },
      bilan_titre: function (m) { return 'Monthly regulatory watch report — ' + m; },
      rp_periode: function (a, b) { return 'Period: ' + a + ' to ' + b; },
      rp_pc: 'Key points', rp_textes: 'New texts and standards', rp_dates: 'Key dates (period and next 3 months)', rp_pert: 'Highly relevant articles, by country',
      rp_tronque: function (n) { return '… and ' + n + ' more articles (see the Excel export).'; }, rp_vide: 'Nothing in this period.',
      rp_resume: function (a, b, c, d) { return a + ' key points · ' + b + ' important texts and standards · ' + c + ' highly relevant articles · ' + d + ' key dates'; },
      cs_titre: 'Collection in progress', cs_auto: 'automatic', cs_manuel: 'started from the site or GitHub',
      cs_lancee: function (h, d) { return 'started at ' + h + ' (' + d + ')'; },
      cs_etape: function (n, m, l) { return 'Step ' + n + '/' + m + ': ' + l; }, cs_fin: function (h) { return 'expected to end around ' + h; },
      cs_attente: 'Waiting for a GitHub machine…', cs_demandee: 'Collection requested: starting in a few seconds…',
      cs_ok: 'Collection finished: the new data is online.', cs_recharger: 'Reload the page',
      cs_ko: 'The collection failed or was interrupted. The site still shows the data of the previous collection.',
      cs_etapes: { prep: 'Preparation', garde: 'Checking the schedule', rkc: 'Reading RKC alerts', outils: 'Installing tools', collecte: 'Reading sources, sorting and translating articles', enreg: 'Saving data', publi: 'Publishing the site' },
      update_title_relais: 'Starts a new collection (about 10 minutes), no GitHub account needed',
      lm_titre: 'Start a new collection?', lm_ok: 'Start',
      lm_corps: function (m) { return 'The collection reads all sources, sorts and translates the articles, then updates the site. It takes about ' + m + ' minutes; its progress is shown at the top of the page.'; },
      lm_envoye: 'Collection requested.', lm_deja: 'A collection is already running.', lm_heure: 'A collection was already started less than an hour ago.',
      lm_jour: 'Maximum number of collections for today reached.', lm_ko: 'Unable to start the collection right now.',
      lm_code_titre: 'Access code', lm_code_corps: 'Enter the access code provided by the team.', lm_code_ko: 'Wrong code, try again.',
      as_btn: 'Ask a question', as_title: 'Search assistant', as_go: 'Search', as_ph: 'E.g. NIS2 obligations in Belgium',
      as_note: 'The assistant only searches the content of the watch (key points, articles, applicable texts, key dates). It does not write an answer and does not search the Internet: it shows you the content closest to your question.',
      as_ex: ['NIS2 obligations in Belgium', 'Deadlines in the next 3 months in Germany', 'New texts on medical devices', 'GDPR fines in Italy', 'Draft laws on artificial intelligence'],
      as_compris: 'Understood: ', as_pays: 'country', as_sujet: 'topic', as_mots: 'words', as_type: 'looking for',
      as_types: { echeance: 'deadlines', sanction: 'fines', nouveau: 'new items', projet: 'texts in preparation', obligation: 'obligations' },
      as_horizon: function (j) { return 'within ' + Math.round(j / 30) + ' months'; },
      as_sec: { alerte: 'Key points', date: 'Key dates', texte: 'Applicable texts', article: 'Watch articles' },
      as_rien: 'Nothing found in the watch for this question. Try other words: the name of the text (NIS2, IVDR…), the country, or a topic word.',
      as_plus: function (n) { return 'Show ' + n + ' more results'; }, as_ref_voir: 'Show in Applicable texts', as_applicable: 'Applicable since '
    }
  };
  Object.keys(T5.fr).forEach(function (k) { T.fr[k] = T5.fr[k]; });
  Object.keys(T5.en).forEach(function (k) { T.en[k] = T5.en[k]; });

  function isoJour(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function moisAvant(n) { var d = new Date(aujourdhui.getTime()); d.setMonth(d.getMonth() - n); return d; }
  function heureCourte(d) { return d.toLocaleTimeString(LANG === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  var AUJ_ISO = isoJour(aujourdhui);
  var ARTICLES_PAR_ID = {};
  ARTICLES.forEach(function (a) { ARTICLES_PAR_ID[a.id] = a; });
  var ALERTES = ((window.VEILLE_ALERTES || {}).alertes || []);

  /* ------------------------------------------- nouveautés depuis la dernière visite */
  // Mémorisé dans ce navigateur uniquement (aucun compte). Pendant la visite, la référence ne bouge pas.
  var VISITE = (function () {
    var ref = null, premiere = false;
    try { ref = sessionStorage.getItem('cw-ref-visite'); } catch (e) {}
    if (ref === null) {
      var prec = null;
      try { prec = localStorage.getItem('cw-derniere-visite'); } catch (e) {}
      ref = prec || '';
      try { sessionStorage.setItem('cw-ref-visite', ref); } catch (e) {}
    }
    try { if (META.version) localStorage.setItem('cw-derniere-visite', META.version); } catch (e) {}
    if (!ref) { premiere = true; ref = isoJour(new Date(aujourdhui.getTime() - 7 * 86400000)) + '-0000'; }
    return { ref: ref, premiere: premiere, libelle: dateLongue(ref.slice(0, 10)) };
  })();
  function estNouveau(a) { var v = a && a.version; return !!v && v !== 'base' && v > VISITE.ref; }

  function renderVisite() {
    var box = document.getElementById('visite-banner'); if (!box || !META.version) return;
    var nArt = ARTICLES.filter(function (a) { return estNouveau(a) && a.pertinence !== 'faible'; }).length;
    var nPc = ALERTES.filter(estNouvelleAlerte).length;
    var txt = VISITE.premiere ? t('vis_first')(nArt) : (nArt || nPc ? t('vis_new')(nArt, nPc, VISITE.libelle) : t('vis_none')(VISITE.libelle));
    box.textContent = '';
    box.appendChild(el('span', { text: txt }));
    if (nArt) {
      var b = el('button', { type: 'button', className: 'linkbtn', text: t('vis_voir') });
      b.addEventListener('click', function () {
        etatFiltres.depuisVisite = true; document.getElementById('depuis-visite').checked = true;
        location.hash = '#veille'; appliquerFiltres();
      });
      box.appendChild(b);
    }
    // points clés détectés depuis la visite mais déjà hors des 5 à 8 affichés (absence de plusieurs semaines)
    var sel = selectionPointsCles(), nPasses = sel.autres.concat(sel.prec).filter(estNouvelleAlerte).length;
    if (nPasses && !VISITE.premiere) {
      var bp = el('button', { type: 'button', className: 'linkbtn', text: t('vis_passes')(nPasses) });
      bp.addEventListener('click', ouvrirPrecedents);
      box.appendChild(bp);
    }
    box.classList.toggle('visite-new', !!(nArt || nPc) && !VISITE.premiere);
    box.hidden = false;
  }

  /* ------------------------------------------------------------- points clés */
  var PRIO = { echeance: 1, adopte: 2, signale: 2, proposition: 3, a_qualifier: 4 };
  function alerteActive(x) { return x.type === 'echeance' ? ((x.echeance || '') >= AUJ_ISO && joursJusqua(x.echeance) <= 30) : (x.fin || '') >= AUJ_ISO; }
  function estNouvelleAlerte(x) { return !!x.version && x.version > VISITE.ref; }
  function estMajAlerte(x) { return !estNouvelleAlerte(x) && !!x.version_maj && x.version_maj > VISITE.ref; }
  function critique(x) {
    // « critique » : seule raison d'afficher plus de 8 points clés (jamais plus de 12)
    return (x.type === 'echeance' && joursJusqua(x.echeance) <= 14) || ((x.type === 'adopte' || x.type === 'signale') && !x.a_verifier && joursDepuis(x.detecte_le) <= 7);
  }
  function trierAlertes(l) {
    // Ordre d'urgence : échéances à 14 jours ou moins, puis alternance « nouveaux textes » (les plus récemment
    // détectés d'abord ; à détection égale : adopté > en préparation > à qualifier) / « échéances suivantes ».
    function parDate(x, y) { return x.echeance < y.echeance ? -1 : x.echeance > y.echeance ? 1 : 0; }
    var proches = l.filter(function (x) { return x.type === 'echeance' && joursJusqua(x.echeance) <= 14; }).sort(parDate);
    var suivantes = l.filter(function (x) { return x.type === 'echeance' && joursJusqua(x.echeance) > 14; }).sort(parDate);
    var textesN = l.filter(function (x) { return x.type !== 'echeance'; }).sort(function (x, y) {
      if ((x.detecte_le || '') !== (y.detecte_le || '')) return (y.detecte_le || '') > (x.detecte_le || '') ? 1 : -1;
      return ((PRIO[x.type] || 9) - (PRIO[y.type] || 9)) || ((y.date || '') > (x.date || '') ? 1 : -1);
    });
    var res = proches.slice();
    while (textesN.length || suivantes.length) { if (textesN.length) res.push(textesN.shift()); if (suivantes.length) res.push(suivantes.shift()); }
    return res;
  }
  function titreApercu(ap) {
    var a = ARTICLES_PAR_ID[ap.id]; if (a) return textes(a).aff.titre;
    if (!ap.langue || ap.langue === LANG) return ap.titre;
    var tr = (ap.trad || {})[LANG]; return (tr && tr.titre) || ap.titre;
  }
  function titreAlerte(x) {
    if (x.ref) return (LANG === 'en' && x.ref.nom_en) ? x.ref.nom_en : x.ref.nom;
    var ap = (x.articles || [])[0]; return ap ? titreApercu(ap) : libTexteCle(x.texte || '');
  }
  function lienAlerte(x) { return (x.ref && x.ref.lien) || ((x.articles || [])[0] || {}).lien || ''; }
  function voirDansVeille(id) {
    var a = ARTICLES_PAR_ID[id]; if (!a) return;
    // affiche le jour de publication de l'article, sans autre filtre, et ouvre sa carte
    Array.prototype.forEach.call(document.querySelectorAll('input[data-facet]'), function (i) { i.checked = false; });
    document.getElementById('recherche').value = ''; etatFiltres.q = []; etatFiltres.exact = []; etatFiltres.depuisVisite = false;
    etatFiltres.du = etatFiltres.au = a.date; document.getElementById('per-du').value = document.getElementById('per-au').value = a.date;
    document.getElementById('depuis-visite').checked = false;
    if (a.pertinence === 'faible') montrerFaible = true;
    appliquerFiltres();
    if (location.hash !== '#veille') location.hash = '#veille'; else afficherOnglet('veille');
    var c = document.getElementById('a-' + id);
    if (c) { ouvrir(c, true); setTimeout(function () { c.scrollIntoView({ block: 'start' }); }, 120); }
  }
  function carteAlerte(x, compacte) {
    var lien = lienAlerte(x), titre = titreAlerte(x), nv = estNouvelleAlerte(x), maj = estMajAlerte(x);
    var haut = el('div', { className: 'pc-top' }, [
      el('span', { className: 'pc-type pc-t-' + x.type, text: t('pc_types')[x.type] || x.type, title: t('pc_types_long')[x.type] || '' }),
      nv ? badge('badge-new badge-sm', t('pc_new'), t('new_title')) : (maj ? badge('badge-maj badge-sm', t('pc_maj'), t('pc_maj_t')) : null),
      ZONES[x.zone] ? el('span', { className: 'zone-code', text: codeZone(x.zone), title: nomZone(x.zone) }) : null,
      el('span', { className: 'pc-zone', text: nomZone(x.zone) }),
      x.inconnu ? badge('badge-verif badge-sm', t('pc_inconnu'), t('pc_inconnu_t')) : null,
      x.a_verifier && !x.inconnu ? badge('badge-verif badge-sm', t('badge_verif'), t('verif_title')) : null
    ]);
    var meta = [];
    if (x.type === 'echeance') meta.push(el('strong', { className: 'pc-ech', text: '⏱ ' + dateLongue(x.echeance) + ' · ' + t('in_days')(joursJusqua(x.echeance)) }));
    else meta.push(el('span', { text: t('pc_detecte')(dateLongue(x.detecte_le)) }));
    if (x.nb_articles > 1) meta.push(el('span', { text: t('pc_sources')(x.nb_articles) }));
    else if ((x.articles || [])[0]) meta.push(el('span', { text: x.articles[0].source || '' }));
    if (x.texte && !x.ref) meta.push(el('span', { text: t('pc_texte') + libTexteCle(x.texte) }));
    if (x.ref && x.ref.autorite) meta.push(el('span', { text: x.ref.autorite }));
    var corps = [haut, el('h3', { className: 'pc-titre' }, [lien ? el('a', { href: lien, target: '_blank', rel: 'noopener noreferrer', text: titre }) : titre]),
      el('p', { className: 'pc-meta' }, meta.reduce(function (acc, m, i) { if (i) acc.push(' · '); acc.push(m); return acc; }, []))];
    if (!compacte) {
      var extrait = x.extrait ? (x.extrait[LANG] || x.extrait.fr || x.extrait.en || '') : '';
      if (!extrait && x.ref) extrait = (LANG === 'en' ? x.ref.resume_en : x.ref.resume_fr) || '';
      if (extrait) corps.push(el('p', { className: 'pc-extrait', text: extrait.length > 260 ? extrait.slice(0, 257) + '…' : extrait }));
      var arts = x.articles || [];
      if (arts.length > 1) {
        var ul = el('ul', { className: 'pc-sources' });
        arts.forEach(function (ap) {
          ul.appendChild(el('li', null, [el('span', { className: 'pc-src-meta', text: dateCourte(ap.date) + ' · ' + (ap.source || '') + ' · ' }),
            ap.lien ? el('a', { href: ap.lien, target: '_blank', rel: 'noopener noreferrer', text: titreApercu(ap) }) : titreApercu(ap)]));
        });
        corps.push(el('details', { className: 'pc-details' }, [el('summary', { text: t('pc_toutes')(x.nb_articles) }), ul]));
      }
      if (arts[0] && ARTICLES_PAR_ID[arts[0].id]) {
        var v = el('button', { type: 'button', className: 'linkbtn pc-voir', text: t('pc_voir_veille') + ' ›' });
        v.addEventListener('click', function () { voirDansVeille(arts[0].id); });
        corps.push(v);
      }
    }
    return el('article', { className: 'pc-card pc-c-' + x.type + (compacte ? ' pc-compacte' : '') + (nv ? ' pc-nouveau' : '') }, corps);
  }
  // 5 points clés affichés (jusqu'à 8 s'il y a des urgences) ; les autres alertes en cours et les alertes
  // terminées sont dans « Points clés précédents »
  var SEL_PC = null;
  function selectionPointsCles() {
    if (SEL_PC) return SEL_PC;
    var act = trierAlertes(ALERTES.filter(alerteActive));
    var n = Math.min(8, Math.max(5, act.filter(critique).length));
    SEL_PC = { top: act.slice(0, n), autres: act.slice(n), prec: ALERTES.filter(function (x) { return !alerteActive(x); }) };
    return SEL_PC;
  }
  function ouvrirPrecedents() {
    var det = document.getElementById('pc-precedents');
    location.hash = '#essentiel'; det.open = true;
    setTimeout(function () { det.scrollIntoView({ block: 'start' }); }, 80);
  }
  function renderPointsCles() {
    var liste = document.getElementById('pc-liste');
    var leg = document.getElementById('pc-legende');
    ['echeance', 'adopte', 'proposition', 'a_qualifier'].forEach(function (k, i) {
      leg.appendChild(el('span', { className: 'pc-leg' }, [el('span', { className: 'pc-type pc-t-' + k, text: String(i + 1) }), el('span', { text: t('pc_types_long')[k] })]));
    });
    var sel = selectionPointsCles();
    document.getElementById('pc-vide').hidden = sel.top.length > 0;
    sel.top.forEach(function (x) { liste.appendChild(carteAlerte(x, false)); });
    var nPrec = sel.autres.length + sel.prec.length;
    document.getElementById('pc-prev-n').textContent = t('pc_prev_n')(nPrec);
    var det = document.getElementById('pc-precedents'), fait = false;
    det.hidden = !nPrec;
    det.addEventListener('toggle', function () {
      if (!det.open || fait) return; fait = true;
      var box = document.getElementById('pc-prev-liste'), mois = null, grille = null;
      if (sel.autres.length) {   // encore d'actualité, mais au-delà des 5 à 8 points affichés
        box.appendChild(el('h3', { className: 'sub-title', text: t('pc_autres')(sel.autres.length) }));
        grille = el('div', { className: 'pc-liste pc-liste-compacte' }); box.appendChild(grille);
        sel.autres.forEach(function (x) { grille.appendChild(carteAlerte(x, true)); });
      }
      sel.prec.map(function (x) { return { x: x, d: x.type === 'echeance' ? x.echeance : (x.detecte_le || '') }; })
        .sort(function (p, q) { return p.d < q.d ? 1 : -1; })
        .forEach(function (p) {
          var m = moisAnnee(p.d);
          if (m !== mois) { mois = m; box.appendChild(el('h3', { className: 'sub-title', text: m })); grille = el('div', { className: 'pc-liste pc-liste-compacte' }); box.appendChild(grille); }
          grille.appendChild(carteAlerte(p.x, true));
        });
    });
    document.getElementById('pc-rss').addEventListener('click', function () {
      var url = new URL('data/points_cles_' + LANG + '.xml', location.href).href;
      var inp = el('input', { type: 'text', value: url, readOnly: true, className: 'select' });
      demander(t('rss_titre'), t('rss_corps').concat([inp]), t('rss_copier'), function () {
        function ok() { toast(t('rss_copie')); }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok).catch(function () {});
        else { inp.select(); try { document.execCommand('copy'); ok(); } catch (e) {} }
      });
      setTimeout(function () { inp.select(); }, 30);
    });
  }

  /* ------------------------------------------------- archives (plus de 6 mois) */
  var ARCHIVES_INFO = META.archives || { nb: 0 };
  var archivesChargees = !ARCHIVES_INFO.nb, promesseArchives = null;
  function besoinArchives(du) { return !archivesChargees && !!du && du < (ARCHIVES_INFO.avant || ''); }
  function chargerArchives() {
    if (archivesChargees) return Promise.resolve();
    if (promesseArchives) return promesseArchives;
    toast(t('arch_loading'));
    promesseArchives = new Promise(function (ok) {
      var sc = document.createElement('script'); sc.src = 'data/actualites_archives.js'; sc.async = true;
      sc.onload = function () {
        var arts = ((window.VEILLE_ARCHIVES || {}).articles || []).filter(function (a) { return a.nature !== 'opinion' && !a.doublon_de && !ARTICLES_PAR_ID[a.id]; });
        arts.forEach(function (a) { ARTICLES_PAR_ID[a.id] = a; ARTICLES.push(a); cartes.push(carteArticle(a)); });
        archivesChargees = true; toast(t('arch_loaded')(arts.length)); ok();
      };
      sc.onerror = function () { archivesChargees = true; toast(t('arch_ko')); ok(); };
      document.head.appendChild(sc);
    });
    return promesseArchives;
  }

  /* --------------------------------------------------------- période (Veille) */
  function brancherPeriode() {
    var du = document.getElementById('per-du'), au = document.getElementById('per-au');
    function appliquer() {
      etatFiltres.du = du.value || ''; etatFiltres.au = au.value || '';
      if (besoinArchives(etatFiltres.du)) chargerArchives().then(appliquerFiltres);
      appliquerFiltres();
    }
    du.addEventListener('change', appliquer); au.addEventListener('change', appliquer);
    document.getElementById('per-preset').addEventListener('choix', function (e) {
      var m = +e.detail.getAttribute('data-m');
      du.value = m ? isoJour(moisAvant(m)) : ''; au.value = '';
      if (!m) Array.prototype.forEach.call(document.querySelectorAll('#per-preset button'), function (b) { b.setAttribute('aria-pressed', 'false'); });
      appliquer();
    });
    document.getElementById('depuis-visite').addEventListener('change', function (e) { etatFiltres.depuisVisite = e.target.checked; appliquerFiltres(); });
    var note = document.getElementById('per-archives');
    if (ARCHIVES_INFO.nb) { note.textContent = t('per_arch')(ARCHIVES_INFO.nb, dateLongue(ARCHIVES_INFO.avant)); note.hidden = false; }
  }

  /* ------------------------------------------------- bilans et restitutions */
  function dansPeriode(d, du, au) { return !!d && d >= du && d <= au; }
  function contenuPeriode(du, au) {
    var fin3 = isoJour(new Date(isoToDate(au).getTime() + 92 * 86400000));
    var pc = trierAlertes(ALERTES.filter(function (x) { return x.type === 'echeance' ? dansPeriode(x.echeance, du, au) : dansPeriode(x.detecte_le, du, au); }));
    var ess = ARTICLES.filter(function (a) { return a.essentiel && !a.base && dansPeriode(a.date, du, au); });
    var pert = ARTICLES.filter(function (a) { return a.pertinence === 'elevee' && !a.base && !a.essentiel && dansPeriode(a.date, du, au); });
    var dates = evenementsAgenda(3000, null, 3000).filter(function (e) { return dansPeriode(e.date, du, fin3); });
    var parTexte = {};
    ess.forEach(function (a) { var k = (a.textes_cles && a.textes_cles[0]) || ''; (parTexte[k] = parTexte[k] || []).push(a); });
    return { pc: pc, ess: ess, pert: pert, dates: dates, parTexte: parTexte };
  }
  function moisListe() {
    var plusAncien = ARCHIVES_INFO.plus_ancien || '';
    ARTICLES.forEach(function (a) { if (!a.base && a.date && (!plusAncien || a.date < plusAncien)) plusAncien = a.date; });
    var res = [], d = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), 1);
    for (var i = 0; i < 24; i++) {
      var m = isoJour(d).slice(0, 7);
      if (plusAncien && m < plusAncien.slice(0, 7)) break;
      res.push(m); d.setMonth(d.getMonth() - 1);
    }
    return res;
  }
  function bornesMois(m) {
    var d = isoToDate(m + '-01'), f = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return [m + '-01', isoJour(f) < AUJ_ISO ? isoJour(f) : AUJ_ISO];
  }
  function afficherBilan(m) {
    var b = bornesMois(m), box = document.getElementById('bilan-resume');
    (besoinArchives(b[0]) ? chargerArchives() : Promise.resolve()).then(function () {
      var c = contenuPeriode(b[0], b[1]); box.textContent = '';
      var k = t('bi_k');
      box.appendChild(el('div', { className: 'bilan-kpis' }, [[c.pc.length, k.pc], [Object.keys(c.parTexte).length, k.textes], [c.pert.length, k.pert], [c.dates.length, k.ech]].map(function (x) {
        return el('div', { className: 'kpi kpi-sm' }, [el('span', { className: 'kpi-n', text: String(x[0]) }), el('span', { className: 'kpi-l', text: x[1] })]);
      })));
      if (!c.pc.length && !c.ess.length) { box.appendChild(el('p', { className: 'block-meta', text: t('bi_rien') })); return; }
      if (c.pc.length) {
        box.appendChild(el('h4', { text: t('bi_top_pc') }));
        var ul = el('ul', { className: 'bilan-liste' });
        c.pc.slice(0, 6).forEach(function (x) {
          var l = lienAlerte(x);
          ul.appendChild(el('li', null, [el('span', { className: 'pc-type pc-t-' + x.type, text: t('pc_types')[x.type] }), ' ', codeZone(x.zone) ? el('span', { className: 'zone-code', text: codeZone(x.zone) }) : null, ' ',
            l ? el('a', { href: l, target: '_blank', rel: 'noopener noreferrer', text: titreAlerte(x) }) : titreAlerte(x)]));
        });
        box.appendChild(ul);
      }
      var cles = Object.keys(c.parTexte).filter(Boolean).sort(function (x, y) { return c.parTexte[y].length - c.parTexte[x].length; }).slice(0, 8);
      if (cles.length) {
        box.appendChild(el('h4', { text: t('bi_top_textes') }));
        box.appendChild(el('p', { className: 'bilan-textes', text: cles.map(function (x) { return libTexteCle(x) + ' (' + c.parTexte[x].length + ')'; }).join(' · ') }));
      }
    });
  }
  function itemCompact(titre, ligne, lien) {
    return el('div', { className: 'pr-item pr-compact' }, [el('h4', { text: titre }), ligne ? el('p', { className: 'pr-line', text: ligne }) : null, lien ? el('p', { className: 'pr-link', text: lien }) : null]);
  }
  function genererRapport(du, au, titre, prefixe) {
    (besoinArchives(du) ? chargerArchives() : Promise.resolve()).then(function () {
      var c = contenuPeriode(du, au), rep = document.getElementById('print-report'); rep.textContent = '';
      rep.appendChild(el('h1', { text: titre }));
      rep.appendChild(el('p', { className: 'pr-meta', text: t('rp_periode')(dateLongue(du), dateLongue(au)) + ' · ' + t('pdf_generated') + horodatage(new Date().toISOString()) }));
      rep.appendChild(el('p', { className: 'pr-meta', text: t('rp_resume')(c.pc.length, c.ess.length, c.pert.length, c.dates.length) }));
      rep.appendChild(el('h2', { text: t('rp_pc') + ' (' + c.pc.length + ')' }));
      if (!c.pc.length) rep.appendChild(el('p', { text: t('rp_vide') }));
      c.pc.forEach(function (x) {
        rep.appendChild(itemCompact(titreAlerte(x), [t('pc_types')[x.type], nomZone(x.zone), x.type === 'echeance' ? dateLongue(x.echeance) : t('pc_detecte')(dateLongue(x.detecte_le)),
          x.nb_articles > 1 ? t('pc_sources')(x.nb_articles) : '', x.texte && !x.ref ? libTexteCle(x.texte) : ''].filter(Boolean).join(' · '), lienAlerte(x)));
      });
      var cles = Object.keys(c.parTexte).sort(function (x, y) { if (!x) return 1; if (!y) return -1; return c.parTexte[y].length - c.parTexte[x].length; });
      rep.appendChild(el('h2', { className: 'pr-break', text: t('rp_textes') + ' (' + c.ess.length + ')' }));
      if (!cles.length) rep.appendChild(el('p', { text: t('rp_vide') }));
      cles.forEach(function (k) {
        rep.appendChild(el('h3', { text: (k ? libTexteCle(k) : t('tm_other')) + ' (' + c.parTexte[k].length + ')' }));
        c.parTexte[k].sort(function (x, y) { return x.date < y.date ? 1 : -1; }).forEach(function (a) {
          rep.appendChild(itemCompact(textes(a).aff.titre, [dateLongue(a.date), a.source, nomZone(a.zone), a.statut ? libStatut(a.statut) : '', a.a_verifier ? t('badge_verif') : ''].filter(Boolean).join(' · '), a.lien));
        });
      });
      rep.appendChild(el('h2', { className: 'pr-break', text: t('rp_dates') + ' (' + c.dates.length + ')' }));
      if (!c.dates.length) rep.appendChild(el('p', { text: t('rp_vide') }));
      c.dates.forEach(function (e) { rep.appendChild(el('p', { className: 'pr-line', text: (e.approx ? t('approx') + ' ' : '') + dateLongue(e.date) + ' — ' + e.titre + ' (' + nomZone(e.zone) + ')' })); });
      rep.appendChild(el('h2', { className: 'pr-break', text: t('rp_pert') + ' (' + c.pert.length + ')' }));
      if (!c.pert.length) rep.appendChild(el('p', { text: t('rp_vide') }));
      var MAX = 350, parZ = {};
      c.pert.sort(function (x, y) { return x.date < y.date ? 1 : -1; }).slice(0, MAX).forEach(function (a) { (parZ[a.zone] = parZ[a.zone] || []).push(a); });
      Object.keys(parZ).sort(function (x, y) { return nomZone(x).localeCompare(nomZone(y), LANG); }).forEach(function (z) {
        rep.appendChild(el('h3', { text: nomZone(z) + ' (' + parZ[z].length + ')' }));
        parZ[z].forEach(function (a) { rep.appendChild(itemCompact(textes(a).aff.titre, [dateLongue(a.date), a.source, a.statut ? libStatut(a.statut) : ''].filter(Boolean).join(' · '), a.lien)); });
      });
      if (c.pert.length > MAX) rep.appendChild(el('p', { text: t('rp_tronque')(c.pert.length - MAX) }));
      telechargerPdf(rep, titre, prefixe);
    });
  }
  function renderBilans() {
    var sel = document.getElementById('bilan-mois');
    moisListe().forEach(function (m, i) { sel.appendChild(el('option', { value: m, text: moisAnnee(m + '-01') + (i === 0 ? t('bi_en_cours') : '') })); });
    if (sel.options.length > 1) sel.selectedIndex = 1;   // le dernier mois complet
    sel.addEventListener('change', function () { afficherBilan(sel.value); });
    if (sel.value) afficherBilan(sel.value);
    document.getElementById('bilan-pdf').addEventListener('click', function () {
      if (!sel.value) return; var b = bornesMois(sel.value);
      genererRapport(b[0], b[1], t('bilan_titre')(moisAnnee(sel.value + '-01')), 'bilan_' + sel.value);
    });
    var du = document.getElementById('rest-du'), au = document.getElementById('rest-au');
    function preset(m) { du.value = isoJour(moisAvant(m)); au.value = AUJ_ISO; }
    preset(6);
    document.getElementById('rest-preset').addEventListener('choix', function (e) { preset(+e.detail.getAttribute('data-m')); });
    function bornes() { var a = du.value || isoJour(moisAvant(6)), b = au.value || AUJ_ISO; return a <= b ? [a, b] : [b, a]; }
    document.getElementById('rest-pdf').addEventListener('click', function () {
      var b = bornes(); genererRapport(b[0], b[1], t('rest_titre')(dateLongue(b[0]), dateLongue(b[1])), 'restitution');
    });
    document.getElementById('rest-csv').addEventListener('click', function () {
      var b = bornes();
      (besoinArchives(b[0]) ? chargerArchives() : Promise.resolve()).then(function () {
        var arts = ARTICLES.filter(function (a) { return !a.base && a.pertinence !== 'faible' && dansPeriode(a.date, b[0], b[1]); })
          .sort(function (x, y) { return x.date < y.date ? 1 : -1; });
        if (!arts.length) { toast(t('nothing_export')); return; }
        var lignes = arts.map(function (a) {
          var c = cartes.filter(function (k) { return k.id === 'a-' + a.id; })[0];
          var x = c ? ligneExport(c) : null; if (!x) return null;
          return [x.date, x.rubrique, x.pert, x.titre, x.titreOrig, x.langue, x.source, x.zone, x.nature, x.statut, x.amende, x.montant, x.echeances, x.pourquoi, x.themes, x.lien, x.resume];
        }).filter(Boolean);
        telechargerCsv([t('csv_head')].concat(lignes), 'cyberwatch_restitution_');
        toast(lignes.length + t('exported'));
      });
    });
  }

  /* ---------------------------------------------- collecte en cours (bandeau) */
  var EN_COURS = ['queued', 'in_progress', 'waiting', 'requested', 'pending'];
  var COLLECTE = { vu: false, fini: false, timer: null, run: null, duree: null, pause: false, demande: 0 };
  function apiGh(chemin) {
    return fetch('https://api.github.com' + chemin, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' }).then(function (r) {
      if (r.status === 403 || r.status === 429) { var e = new Error('limite'); e.limite = true; throw e; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function lireEtatCollecte() {
    if (META.url_relais) return fetch(META.url_relais.replace(/\/+$/, '') + '/etat', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('relais'); return r.json(); });
    if (!META.depot) return Promise.reject(new Error('depot'));
    if (COLLECTE.run) {   // collecte repérée : on ne suit plus que ses étapes (1 appel)
      return apiGh('/repos/' + META.depot + '/actions/runs/' + COLLECTE.run.id + '/jobs').then(function (j) {
        var job = (j.jobs || [])[0] || {};
        if (job.status === 'completed') { COLLECTE.run = null; return { en_cours: false, derniere: { conclusion: job.conclusion } }; }
        return { en_cours: true, duree_habituelle_s: COLLECTE.duree, collecte: { debut: COLLECTE.run.debut, declenchement: COLLECTE.run.decl,
          statut: job.status || 'queued', etapes: (job.steps || []).map(function (s) { return { nom: s.name, statut: s.status, conclusion: s.conclusion }; }) } };
      });
    }
    return apiGh('/repos/' + META.depot + '/actions/workflows/veille.yml/runs?per_page=10').then(function (d) {
      var runs = d.workflow_runs || [];
      var actif = runs.filter(function (r) { return EN_COURS.indexOf(r.status) !== -1; })[0];
      var ok = runs.filter(function (r) { return r.conclusion === 'success' && (new Date(r.updated_at) - new Date(r.run_started_at)) > 120000; })[0];
      COLLECTE.duree = ok ? Math.round((new Date(ok.updated_at) - new Date(ok.run_started_at)) / 1000) : null;
      if (!actif) return { en_cours: false, duree_habituelle_s: COLLECTE.duree };
      COLLECTE.run = { id: actif.id, debut: actif.run_started_at || actif.created_at, decl: actif.event === 'schedule' ? 'automatique' : 'manuel' };
      return lireEtatCollecte();
    });
  }
  function libelleEtape(nom) {
    var e = t('cs_etapes'); nom = nom || '';
    if (/horaire/i.test(nom)) return e.garde;
    if (/RKC/.test(nom)) return e.rkc;
    if (/Collecter/i.test(nom)) return e.collecte;
    if (/Enregistrer/i.test(nom)) return e.enreg;
    if (/Python|d[ée]pendances|mod[eè]les|cache/i.test(nom)) return e.outils;
    if (/site|pages|Publier|artifact/i.test(nom)) return e.publi;
    return e.prep;
  }
  function boutonLancement() { return document.getElementById('lancer-maj'); }
  function montrerBouton(oui) { var b = boutonLancement(); if (b && (META.url_relais || META.url_lancer_maj)) b.hidden = !oui; }
  function afficherCollecte(etat) {
    var box = document.getElementById('collecte-bandeau');
    if (etat.duree_habituelle_s) COLLECTE.duree = etat.duree_habituelle_s;
    // juste après une demande, GitHub met parfois une minute à créer la collecte : on patiente
    if (!etat.en_cours && COLLECTE.demande && Date.now() - COLLECTE.demande < 150000) return;
    if (etat.en_cours) {
      COLLECTE.demande = 0;
      var c = etat.collecte || {}, etapes = (c.etapes || []).filter(function (s) { return !/^(Set up job|Post |Complete job)/.test(s.nom) && s.conclusion !== 'skipped'; });
      var cour = etapes.filter(function (s) { return s.statut === 'in_progress'; })[0];
      // créneau automatique encore à l'étape « vérifier l'horaire » : souvent un créneau ignoré, on n'affiche rien
      if (c.declenchement === 'automatique' && !COLLECTE.vu && (!cour || /horaire|branche|checkout/i.test(cour.nom))) { box.hidden = true; return; }
      COLLECTE.vu = true; COLLECTE.fini = false; montrerBouton(false);
      var debut = c.debut ? new Date(c.debut) : new Date(), duree = etat.duree_habituelle_s || 600;
      var ecoule = (Date.now() - debut.getTime()) / 1000, pct = Math.max(3, Math.min(95, ecoule / duree * 100));
      var ligne2 = '';
      if (!etapes.length || c.statut === 'queued') { ligne2 = t('cs_attente'); pct = 2; }
      else {
        var idx = cour ? etapes.indexOf(cour) + 1 : etapes.filter(function (s) { return s.statut === 'completed'; }).length;
        ligne2 = t('cs_etape')(Math.max(1, idx), etapes.length, libelleEtape(cour ? cour.nom : '')) + ' · ' + t('cs_fin')(heureCourte(new Date(debut.getTime() + duree * 1000)));
      }
      box.className = 'collecte-bandeau cb-encours'; box.textContent = '';
      box.appendChild(el('div', { className: 'cb-ligne' }, [el('span', { className: 'cb-spin', 'aria-hidden': 'true' }),
        el('strong', { text: t('cs_titre') }), el('span', { text: ' — ' + t('cs_lancee')(heureCourte(debut), c.declenchement === 'automatique' ? t('cs_auto') : t('cs_manuel')) })]));
      box.appendChild(el('div', { className: 'cb-ligne cb-etape', text: ligne2 }));
      var barre = el('div', { className: 'cb-barre', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)) });
      barre.appendChild(el('div', { className: 'cb-rempli', style: 'width:' + pct.toFixed(1) + '%' }));
      box.appendChild(barre); box.hidden = false;
      return;
    }
    if (COLLECTE.vu && !COLLECTE.fini) {
      COLLECTE.fini = true; COLLECTE.vu = false;
      var ok = !etat.derniere || etat.derniere.conclusion === 'success';
      box.className = 'collecte-bandeau ' + (ok ? 'cb-ok' : 'cb-ko'); box.textContent = '';
      box.appendChild(el('span', { text: (ok ? '✅ ' + t('cs_ok') : '⚠️ ' + t('cs_ko')) + ' ' }));
      if (ok) { var r = el('button', { type: 'button', className: 'btn btn-sm', text: t('cs_recharger') }); r.addEventListener('click', function () { location.reload(); }); box.appendChild(r); }
      box.hidden = false;
    } else if (!COLLECTE.fini) box.hidden = true;
    montrerBouton(true);
  }
  function planifier(ms) { clearTimeout(COLLECTE.timer); COLLECTE.timer = setTimeout(sonder, ms); }
  function sonder() {
    if (document.hidden) { COLLECTE.pause = true; return; }
    lireEtatCollecte().then(function (e) {
      afficherCollecte(e);
      // limite de l'API publique GitHub : 60 appels/heure par adresse IP -> rythme prudent
      planifier(e.en_cours ? (META.url_relais ? 30000 : 75000) : (COLLECTE.demande ? 15000 : 600000));
    }).catch(function (err) { planifier(err && err.limite ? 900000 : 600000); });
  }
  function afficherDemande() {
    var box = document.getElementById('collecte-bandeau');
    box.className = 'collecte-bandeau cb-encours'; box.textContent = '';
    box.appendChild(el('div', { className: 'cb-ligne' }, [el('span', { className: 'cb-spin', 'aria-hidden': 'true' }), el('strong', { text: t('cs_demandee') })]));
    box.hidden = false; COLLECTE.vu = true; COLLECTE.fini = false; COLLECTE.demande = Date.now(); montrerBouton(false);
  }
  function envoyerLancement(code) {
    fetch(META.url_relais.replace(/\/+$/, '') + '/lancer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code || '' }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (x) {
        if (x.s === 202) { toast(t('lm_envoye')); afficherDemande(); planifier(15000); return; }
        if (x.s === 403 && x.j.erreur === 'code') {
          var inp = el('input', { type: 'password', autocomplete: 'off', className: 'select' });
          demander(t('lm_code_titre'), [code ? t('lm_code_ko') : t('lm_code_corps'), inp], t('lm_ok'), function () { envoyerLancement(inp.value); });
          return;
        }
        if (x.s === 409) { toast(t('lm_deja')); sonder(); return; }
        if (x.s === 429) { toast(x.j.erreur === 'jour' ? t('lm_jour') : t('lm_heure')); return; }
        toast(t('lm_ko'));
      }).catch(function () { toast(t('lm_ko')); });
  }
  function suivreCollecte() {
    var btn = boutonLancement();
    if (META.url_relais) {
      btn.hidden = false; btn.removeAttribute('target'); btn.setAttribute('href', '#'); btn.title = t('update_title_relais');
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var min = Math.max(5, Math.round((COLLECTE.duree || 600) / 60));
        demander(t('lm_titre'), [t('lm_corps')(min)], t('lm_ok'), function () { envoyerLancement(''); });
      });
    } else if (META.url_lancer_maj) { btn.href = META.url_lancer_maj; btn.hidden = false; btn.title = t('update_title'); }
    if (!META.depot && !META.url_relais) return;
    document.addEventListener('visibilitychange', function () { if (!document.hidden && COLLECTE.pause) { COLLECTE.pause = false; sonder(); } });
    sonder();
  }

  /* ------------------------------------------- assistant de recherche (sans IA générative) */
  var ZONE_MOTS = {
    'Allemagne': ['allemagne', 'allemand', 'allemande', 'allemands', 'germany', 'german', 'deutschland'],
    'Autriche': ['autriche', 'autrichien', 'autrichienne', 'austria', 'austrian'],
    'Belgique': ['belgique', 'belge', 'belges', 'belgium', 'belgian'],
    'Bulgarie': ['bulgarie', 'bulgare', 'bulgaria', 'bulgarian'],
    'Danemark': ['danemark', 'danois', 'danoise', 'denmark', 'danish'],
    'Espagne': ['espagne', 'espagnol', 'espagnole', 'spain', 'spanish'],
    'Finlande': ['finlande', 'finlandais', 'finland', 'finnish'],
    'France': ['france', 'francais', 'francaise', 'french'],
    'Grèce': ['grece', 'grec', 'grecque', 'greece', 'greek'],
    'Hongrie': ['hongrie', 'hongrois', 'hungary', 'hungarian'],
    'Italie': ['italie', 'italien', 'italienne', 'italy', 'italian'],
    'Norvège': ['norvege', 'norvegien', 'norway', 'norwegian'],
    'Pays-Bas': ['pays-bas', 'pays bas', 'neerlandais', 'hollande', 'netherlands', 'dutch', 'holland'],
    'Pologne': ['pologne', 'polonais', 'polonaise', 'poland', 'polish'],
    'Portugal': ['portugal', 'portugais', 'portugaise', 'portuguese'],
    'Rép. Tchèque': ['tcheque', 'tchequie', 'czech', 'czechia'],
    'Royaume-Uni': ['royaume-uni', 'royaume uni', 'britannique', 'angleterre', 'uk', 'united kingdom', 'britain', 'british', 'england'],
    'Suède': ['suede', 'suedois', 'suedoise', 'sweden', 'swedish'],
    'Suisse': ['suisse', 'switzerland', 'swiss'],
    'Europe': ['europe', 'europeen', 'europeenne', 'europeens', 'ue', 'eu', 'union europeenne', 'european union', 'european']
  };
  var SYN_SUJETS = {
    'MDR': ['dispositif medical', 'dispositifs medicaux', 'medical device', 'medical devices'],
    'IVDR': ['diagnostic in vitro', 'diagnostics in vitro', 'in vitro', 'ivd', 'dmdiv'],
    'GDPR': ['rgpd', 'gdpr', 'donnees personnelles', 'personal data', 'protection des donnees', 'data protection', 'vie privee', 'privacy'],
    'AI Act': ['intelligence artificielle', 'artificial intelligence', 'ia', 'ai', 'reglement ia', 'ai act'],
    'NIS2': ['nis 2', 'nis2', 'nis'], 'CRA': ['cyber resilience act', 'cyberresilience', 'cra'],
    'EHDS': ['donnees de sante', 'health data', 'ehds', 'espace europeen des donnees de sante'],
    'PLD': ['responsabilite du fait des produits', 'product liability', 'produits defectueux'],
    'HDS': ['hebergement de donnees de sante', 'hds'], 'Cybersecurity Act': ['cybersecurity act', 'certification cyber']
  };
  var MOTS_VIDES = ('le la les un une des du de d l au aux et ou en dans sur pour par avec sans ce ces cet cette qui que quoi quel quelle quels quelles est sont a ont il elle ils elles on nous vous je tu mon ma mes ' +
    'son sa ses leur leurs y ne pas plus moins tout tous toute toutes comme mais donc car si quand comment combien pourquoi faut doit doivent the of and or in on for to with without is are was were be by at from ' +
    'this that these those what which who how when why do does did any all about into over under between there their it its as an a me my our your new nouveau nouveaux nouvelle nouvelles ' +
    'prochains prochaines prochain prochaine next mois months month annee year jours days dernier derniers derniere dernieres latest recent recents recentes recente texte textes').split(' ');
  var VIDES = {}; MOTS_VIDES.forEach(function (m) { VIDES[m] = 1; });
  var INTENTIONS = {
    echeance: /\b(echeances?|dates? (limites?|cles?)|deadlines?|quand|when|calendrier|agenda|d'ici|avant le|due|applicable a partir|entree en vigueur|entry into force)\b/,
    sanction: /\b(amendes?|sanctions?|penalites?|fines?|penalt\w*|enforcement|condamn\w*)\b/,
    nouveau: /\b(nouveaux?|nouvelles?|new|recents?|recentes?|derni\w*|latest|adopt\w*|publi\w*|published)\b/,
    projet: /\b(projets?|propositions?|consultations?|drafts?|proposals?|bills?|en preparation|in preparation)\b/,
    obligation: /\b(obligations?|exigences?|requirements?|obliged|must|doit|doivent|conformite|compliance)\b/
  };
  function radical(m) { return m.length > 4 ? m.replace(/(ements|ement|ations|ation|ions|ion|ies|es|s|x)$/, '') : m; }
  function jetons(txt) {
    return normaliser(txt).replace(/[^a-z0-9\u0370-\u03ff\u0400-\u04ff]+/g, ' ').split(' ').filter(function (m) { return m && !VIDES[m] && m.length > 1; }).map(radical);
  }
  function motif(mots) { return new RegExp('(^|[^a-z0-9])(' + mots.map(function (m) { return m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[- ]/g, '[- ]?'); }).join('|') + ')(?=[^a-z0-9]|$)'); }
  var RX_ZONES = {}; Object.keys(ZONE_MOTS).forEach(function (z) { RX_ZONES[z] = motif(ZONE_MOTS[z]); });
  var RX_SUJETS = {};
  Object.keys(SUJETS).forEach(function (c) {
    var s = SUJETS[c] || {}, mots = [normaliser(c)];
    [s.fr, s.en].forEach(function (l) { if (!l) return; var base = normaliser(l.split(' (')[0]).trim(); if (base.length >= 3) mots.push(base); });
    (SYN_SUJETS[c] || []).forEach(function (m) { mots.push(m); });
    RX_SUJETS[c] = motif(mots.filter(function (m, i, arr) { return m && arr.indexOf(m) === i; }));
  });
  function sujetsDuTexte(n) { return Object.keys(RX_SUJETS).filter(function (c) { return RX_SUJETS[c].test(n); }); }
  var INDEX = null;
  function construireIndex() {
    var docs = [];
    function ajouterDoc(d, txt) { d.n = normaliser(txt); d.toks = jetons(txt); d.tf = {}; d.toks.forEach(function (m) { d.tf[m] = (d.tf[m] || 0) + 1; }); docs.push(d); }
    ALERTES.filter(alerteActive).forEach(function (x) {
      var txt = [titreAlerte(x), x.texte, libTexteCle(x.texte || ''), (x.articles || []).map(function (ap) { return ap.titre + ' ' + titreApercu(ap); }).join(' '), t('pc_types_long')[x.type]].join(' ');
      ajouterDoc({ kind: 'alerte', x: x, zone: x.zone, date: x.type === 'echeance' ? x.echeance : x.detecte_le, codes: sujetsDuTexte(normaliser(txt)) }, txt);
    });
    ARTICLES.forEach(function (a) {
      var tr = a.trad || {}, txt = [a.titre, a.resume, (tr.fr || {}).titre, (tr.fr || {}).resume, (tr.en || {}).titre, (tr.en || {}).resume, a.source, (a.tags || []).join(' '),
        (a.sujets || []).map(libSujet).join(' '), (a.textes_cles || []).join(' ')].join(' ');
      ajouterDoc({ kind: 'article', a: a, zone: a.zone, date: a.date, codes: (a.sujets || []).concat(sujetsDuTexte(normaliser(a.titre + ' ' + ((tr.fr || {}).titre || '') + ' ' + ((tr.en || {}).titre || '')))) }, txt);
    });
    REF_TEXTES.forEach(function (r) {
      var txt = [r.nom, r.nom_en, r.nom_fr, r.nom_original, r.acronyme, r.resume_fr, r.resume_en, r.pourquoi_fr, r.pourquoi_en, r.autorite].join(' ');
      ajouterDoc({ kind: 'texte', r: r, zone: r.zone, date: /^\d{4}-\d{2}-\d{2}$/.test(r.applicable_depuis || '') ? r.applicable_depuis : '', codes: sujetsDuTexte(normaliser([r.nom, r.nom_en, r.acronyme].join(' '))) }, txt);
    });
    evenementsAgenda(3000).forEach(function (e) {
      if (joursJusqua(e.date) < -30) return;
      var txt = [e.titre, e.ctx, e.source].join(' ');
      ajouterDoc({ kind: 'date', e: e, zone: e.zone, date: e.date, codes: e.a ? (e.a.sujets || []) : sujetsDuTexte(normaliser(txt)), a: e.a }, txt);
    });
    var df = {}, total = 0;
    docs.forEach(function (d) { total += d.toks.length; Object.keys(d.tf).forEach(function (m) { df[m] = (df[m] || 0) + 1; }); });
    INDEX = { docs: docs, df: df, N: docs.length, moy: total / Math.max(1, docs.length) };
  }
  function comprendre(question) {
    var n = ' ' + normaliser(question) + ' ', q = { zones: [], sujets: [], intents: [], horizon: 0, mots: [] };
    Object.keys(RX_ZONES).forEach(function (z) { if (RX_ZONES[z].test(n)) q.zones.push(z); });
    q.sujets = sujetsDuTexte(n);
    Object.keys(INTENTIONS).forEach(function (k) { if (INTENTIONS[k].test(n)) q.intents.push(k); });
    var h = /(\d{1,2})\s*(prochains?\s*|next\s*|derniers?\s*|last\s*)?(mois|months?)/.exec(n);
    if (h) q.horizon = +h[1] * 31; else if (/\b(ce mois|this month)\b/.test(n)) q.horizon = 31; else if (/\b(cette annee|this year)\b/.test(n)) q.horizon = 366;
    // mots restants (hors pays, sujets et mots d'intention) : recherche plein texte
    var reste = n;
    Object.keys(RX_ZONES).forEach(function (z) { reste = reste.replace(new RegExp(RX_ZONES[z].source, 'g'), ' '); });
    q.sujets.forEach(function (c) { reste = reste.replace(new RegExp(RX_SUJETS[c].source, 'g'), ' '); });
    Object.keys(INTENTIONS).forEach(function (k) { reste = reste.replace(new RegExp(INTENTIONS[k].source, 'g'), ' '); });
    q.mots = jetons(reste).filter(function (m) { return !/^\d+$/.test(m); });
    q.motsAff = normaliser(reste).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(function (m) { return m.length > 1 && !VIDES[m] && !/^\d+$/.test(m); });
    return q;
  }
  function noter(d, q) {
    var s = 0, k1 = 1.2, b = 0.75, texteOk = false;
    q.mots.forEach(function (m) {
      var tf = d.tf[m]; if (!tf) return; texteOk = true;
      var idf = Math.log(1 + (INDEX.N - INDEX.df[m] + 0.5) / (INDEX.df[m] + 0.5));
      s += idf * tf * (k1 + 1) / (tf + k1 * (1 - b + b * d.toks.length / INDEX.moy));
    });
    if (q.mots.length && !texteOk && !(q.sujets.length && q.sujets.some(function (c) { return d.codes.indexOf(c) !== -1; }))) return -1;
    if (q.zones.length) {
      if (q.zones.indexOf(d.zone) !== -1) s += 3;
      else if (d.zone === 'Europe' && q.zones.indexOf('Europe') === -1 && d.kind !== 'article') s += 0.3;   // un texte européen s'applique aussi
      else return -1;
    }
    if (q.sujets.length) {
      if (q.sujets.some(function (c) { return d.codes.indexOf(c) !== -1; })) s += 4;
      else if (!texteOk) return -1; else s -= 1;
    }
    if (!q.mots.length && !q.zones.length && !q.sujets.length && !q.intents.length) return -1;
    var a = d.a;
    if (a) {
      if (a.pertinence === 'elevee') s += 1.5; else if (a.pertinence === 'moyenne') s += 0.7; else s -= 0.5;
      if (a.essentiel) s += 1;
      if (q.intents.indexOf('sanction') !== -1) { if (a.amende || a.statut === 'sanction') s += 3; else if (d.kind === 'article') s -= 1; }
      if (q.intents.indexOf('projet') !== -1 && ['projet', 'consultation'].indexOf(a.statut) !== -1) s += 2.5;
      if (q.intents.indexOf('nouveau') !== -1 && ['adopte', 'en_vigueur'].indexOf(a.statut) !== -1) s += 1.5;
    }
    if (d.kind === 'alerte') { s += 1.5; if (q.intents.indexOf('projet') !== -1 && d.x.type === 'proposition') s += 2; if (q.intents.indexOf('nouveau') !== -1 && d.x.type === 'adopte') s += 2; }
    if (d.kind === 'texte' && q.intents.indexOf('obligation') !== -1) s += 2;
    if (d.kind === 'date' || (d.kind === 'alerte' && d.x.type === 'echeance')) {
      if (q.intents.indexOf('echeance') !== -1) s += 3;
      var j = joursJusqua(d.date);
      if (q.horizon && (j < 0 || j > q.horizon)) return -1;
    } else if (q.horizon && d.date && joursDepuis(d.date) > q.horizon && q.intents.indexOf('echeance') === -1) return -1;
    var age = d.date ? joursDepuis(d.date) : 9999;
    if (age >= 0 && age <= 30) s += (q.intents.indexOf('nouveau') !== -1 ? 2 : 0.8); else if (age <= 90) s += 0.4;
    return s;
  }
  function itemAssistant(d) {
    if (d.kind === 'alerte') return carteAlerte(d.x, true);
    if (d.kind === 'texte') {
      var r = d.r, x = refTexte(r);
      return el('div', { className: 'as-item' }, [el('div', { className: 'as-meta' }, [ZONES[r.zone] ? el('span', { className: 'zone-code', text: codeZone(r.zone) }) : null,
        el('span', { text: [nomZone(r.zone), refAutorite(r), /^\d{4}-\d{2}-\d{2}$/.test(r.applicable_depuis || '') ? t('as_applicable') + dateLongue(r.applicable_depuis) : ''].filter(Boolean).join(' · ') })]),
        el('a', { className: 'as-titre', href: r.lien, target: '_blank', rel: 'noopener noreferrer', text: x.nom + (r.acronyme ? ' — ' + r.acronyme : '') }),
        x.resume ? el('p', { className: 'as-extrait', text: x.resume.length > 220 ? x.resume.slice(0, 217) + '…' : x.resume }) : null]);
    }
    if (d.kind === 'date') {
      var e = d.e;
      return el('div', { className: 'as-item' }, [el('div', { className: 'as-meta' }, [el('strong', { className: 'pc-ech', text: '⏱ ' + (e.approx ? t('approx') + ' ' : '') + dateLongue(e.date) }),
        ZONES[e.zone] ? el('span', { className: 'zone-code', text: codeZone(e.zone) }) : null, el('span', { text: nomZone(e.zone) })]),
        e.lien ? el('a', { className: 'as-titre', href: e.lien, target: '_blank', rel: 'noopener noreferrer', text: e.titre }) : el('span', { className: 'as-titre', text: e.titre }),
        e.ctx ? el('p', { className: 'as-extrait', text: e.ctx.length > 200 ? e.ctx.slice(0, 197) + '…' : e.ctx }) : null]);
    }
    var a = d.a, tx = textes(a);
    var voir = el('button', { type: 'button', className: 'linkbtn', text: t('pc_voir_veille') + ' ›' });
    voir.addEventListener('click', function () { fermerAssistant(); voirDansVeille(a.id); });
    return el('div', { className: 'as-item' }, [el('div', { className: 'as-meta' }, [ZONES[a.zone] ? el('span', { className: 'zone-code', text: codeZone(a.zone) }) : null,
      el('span', { text: dateCourte(a.date) + ' · ' + (a.source || '') }), badgePert(a, true), a.statut && a.statut !== 'autre' ? badge('badge-statut badge-sm', libStatut(a.statut)) : null]),
      a.lien ? el('a', { className: 'as-titre', href: a.lien, target: '_blank', rel: 'noopener noreferrer', text: tx.aff.titre }) : el('span', { className: 'as-titre', text: tx.aff.titre }),
      voir]);
  }
  function chercher(question) {
    if (!INDEX) construireIndex();
    var q = comprendre(question), res = document.getElementById('as-resultats'), comp = document.getElementById('as-compris');
    res.textContent = ''; comp.textContent = '';
    var morceaux = [];
    if (q.zones.length) morceaux.push(t('as_pays') + ' : ' + q.zones.map(nomZone).join(', '));
    if (q.sujets.length) morceaux.push(t('as_sujet') + ' : ' + q.sujets.map(libSujet).join(', '));
    if (q.intents.length) morceaux.push(t('as_type') + ' : ' + q.intents.map(function (k) { return t('as_types')[k]; }).join(', ') + (q.horizon ? ' ' + t('as_horizon')(q.horizon) : ''));
    if (q.motsAff.length) morceaux.push(t('as_mots') + ' : ' + q.motsAff.join(' '));
    comp.hidden = !morceaux.length;
    if (morceaux.length) { comp.appendChild(el('strong', { text: t('as_compris') })); comp.appendChild(document.createTextNode(morceaux.join(' · '))); }
    var groupes = { alerte: [], date: [], texte: [], article: [] };
    INDEX.docs.forEach(function (d) { var s = noter(d, q); if (s > 0) groupes[d.kind].push({ d: d, s: s }); });
    var ordre = q.intents.indexOf('echeance') !== -1 ? ['date', 'alerte', 'texte', 'article'] : (q.intents.indexOf('obligation') !== -1 ? ['texte', 'alerte', 'date', 'article'] : ['alerte', 'texte', 'date', 'article']);
    if (!q.intents.length) {   // simple recherche par mots : la rubrique qui contient le meilleur résultat d'abord (points clés toujours en tête)
      var meilleur = function (k) { return groupes[k].reduce(function (m, x) { return Math.max(m, x.s); }, 0); };
      ordre = ['alerte'].concat(['texte', 'date', 'article'].sort(function (x, y) { return meilleur(y) - meilleur(x); }));
    }
    var MAX = { alerte: 5, date: 8, texte: 5, article: 10 }, total = 0;
    ordre.forEach(function (k) {
      var l = groupes[k].sort(function (x, y) { return y.s - x.s; }); if (!l.length) return; total += l.length;
      var sec = el('section', { className: 'as-section' }, [el('h3', { text: t('as_sec')[k] + ' (' + l.length + ')' })]);
      var cont = el('div', { className: 'as-liste' }); sec.appendChild(cont);
      var montre = 0;
      function afficher(n) { l.slice(montre, montre + n).forEach(function (x) { cont.appendChild(itemAssistant(x.d)); }); montre = Math.min(l.length, montre + n); }
      afficher(MAX[k]);
      if (l.length > montre) {
        var p = el('button', { type: 'button', className: 'linkbtn', text: t('as_plus')(Math.min(MAX[k] * 2, l.length - montre)) });
        p.addEventListener('click', function () { afficher(MAX[k] * 2); if (montre >= l.length) p.remove(); else p.textContent = t('as_plus')(Math.min(MAX[k] * 2, l.length - montre)); });
        sec.appendChild(p);
      }
      res.appendChild(sec);
    });
    if (!total) res.appendChild(el('p', { className: 'empty', text: t('as_rien') }));
  }
  function fermerAssistant() {
    document.getElementById('assistant').hidden = true;
    document.getElementById('assistant-ouvrir').setAttribute('aria-expanded', 'false');
    document.body.classList.remove('as-ouvert');
  }
  function brancherAssistant() {
    var panneau = document.getElementById('assistant'), ouvrirB = document.getElementById('assistant-ouvrir'), champ = document.getElementById('as-q');
    ouvrirB.addEventListener('click', function () {
      var o = panneau.hidden; if (!o) { fermerAssistant(); return; }
      panneau.hidden = false; ouvrirB.setAttribute('aria-expanded', 'true'); document.body.classList.add('as-ouvert'); champ.focus();
    });
    document.getElementById('assistant-fermer').addEventListener('click', fermerAssistant);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panneau.hidden && document.getElementById('modal').hidden) fermerAssistant(); });
    document.getElementById('as-form').addEventListener('submit', function (e) { e.preventDefault(); if (champ.value.trim()) chercher(champ.value); });
    var ex = document.getElementById('as-exemples');
    t('as_ex').forEach(function (q) {
      var b = el('button', { type: 'button', className: 'chip as-ex', text: q });
      b.addEventListener('click', function () { champ.value = q; chercher(q); });
      ex.appendChild(b);
    });
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
  sur('couverture', renderCouverture);
  sur('écartés', renderEcartes);
  sur('acronymes', renderAcronymes);
  sur('glossaire', renderGlossaire);
  sur('gestion des sources', gestionSources);
  sur('filtres (application)', appliquerFiltres);
  sur('collecte en cours', suivreCollecte);
  sur('assistant de recherche', brancherAssistant);

  document.getElementById('export-csv').addEventListener('click', exporterCsv);
  document.getElementById('export-pdf').addEventListener('click', function () {
    var sel = cartesAffichees().map(ligneExport);
    if (!sel.length) { toast(t('nothing_export')); return; }
    if (sel.length > 300) { toast(t('too_many')); return; }
    imprimer(sel, t('pdf_title'), false, true);
  });
  // la veille complète : PDF généré à chaque collecte par le serveur GitHub (data/cyberwatch_veille_fr|en.pdf)
  document.getElementById('export-pdf-complet').addEventListener('click', function () {
    var url = 'data/cyberwatch_veille_' + LANG + '.pdf';
    function telecharger() {
      var a = el('a', { href: url, download: 'cyberwatch_veille_' + LANG + '_' + (META.mise_a_jour || '').slice(0, 10) + '.pdf' });
      document.body.appendChild(a); a.click(); a.remove();
    }
    if (location.protocol === 'file:') { telecharger(); return; }
    fetch(url, { method: 'HEAD' }).then(function (r) { if (r.ok) telecharger(); else toast(t('pdf_missing')); }).catch(telecharger);
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
