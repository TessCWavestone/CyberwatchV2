/* ==========================================================================
   Cyber Watch — comportements (FR / EN)
   Construit tout le site à partir des fichiers de données (data/*.js) :
   onglets Veille / Carte / Sources, filtres, recherche, traduction des
   articles (avec retour au texte d'origine), exports Excel et PDF.
   Aucune dépendance externe.
   ========================================================================== */

(function () {
  'use strict';

  var DATA     = window.VEILLE_ACTUALITES   || { meta: {}, articles: [] };
  var ETAT     = window.VEILLE_ETAT_SOURCES || { sources: [] };
  var SYNTH_FR = window.VEILLE_SYNTHESES    || { groupes: [], glossaire: [] };
  var SYNTH_EN = window.VEILLE_SYNTHESES_EN || null;
  var ACRO     = window.VEILLE_ACRONYMES    || { glossaire: {}, acronymes: [] };
  var GLOSSAIRE = ACRO.glossaire || {};
  var META     = DATA.meta || {};
  var ARTICLES = DATA.articles || [];
  var VERSIONS = ((window.VEILLE_VERSIONS || {}).versions || []).slice();
  var PERT     = META.pertinence || {};
  var THEMES   = PERT.themes || {};
  var ORDRE_PERT = { elevee: 0, moyenne: 1, faible: 2 };
  var REF      = window.VEILLE_REFERENTIEL || { textes: [], categories: {} };
  var REF_TEXTES = REF.textes || [];
  function nomCategorie(c) { var x = (REF.categories || {})[String(c)]; return x ? (x[LANG] || x.fr) : String(c || ''); }
  function refTexte(r) {
    return { nom: LANG === 'en' ? (r.nom_en || r.nom) : r.nom, resume: LANG === 'en' ? (r.resume_en || r.resume_fr) : r.resume_fr,
             pourquoi: LANG === 'en' ? (r.pourquoi_en || r.pourquoi_fr) : r.pourquoi_fr };
  }
  function refDepuis(v) { return !v || v === 'n.d.' ? '—' : (/^\d{4}-\d{2}-\d{2}$/.test(v) ? dateLongue(v) : v); }

  /* Rang de version de chaque article : base / anciens = 0, puis ordre des collectes */
  var RANG_VERSION = { base: 0, '': 0 };
  VERSIONS.forEach(function (v, i) { RANG_VERSION[v.id] = i + 1; });
  function rangVersion(a) { var r = RANG_VERSION[a.version || '']; return r === undefined ? 0 : r; }

  /* =================================================================== langue */

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
      skip: 'Aller au contenu', btn_update: 'Lancer une mise à jour', btn_excel: 'Exporter la sélection (Excel)', btn_pdf: 'Exporter la sélection (PDF)',
      btn_pdf_all: 'Générer la veille complète (PDF)',
      tab_ref: 'Textes applicables', ref_title: 'Textes applicables',
      ref_lead: "Le socle des textes et référentiels qui s'appliquent aujourd'hui dans chaque pays, même sans actualité récente : lois cyber, données, données de santé, exigences imposées par les acheteurs de santé et par le secteur public à leurs fournisseurs, dispositifs médicaux, IA, sécurité des produits, entités critiques, certifications. Constitué par une recherche systématique (10 catégories × 19 zones), complétable à la main dans config/referentiel.json.",
      ref_th_cat: 'Catégorie', ref_th_text: 'Texte', ref_th_auth: 'Autorité', ref_th_since: 'Applicable depuis', ref_th_fine: 'Amende max.',
      ref_all_zones: 'Tous les pays et zones', ref_all_cats: 'Toutes les catégories', ref_search_ph: 'Filtrer (nom, acronyme, autorité…)',
      ref_empty: 'Aucun texte pour ce filtre.', btn_excel_ref: 'Exporter (Excel)', ref_none: "Pas encore de référentiel : il apparaîtra après la prochaine collecte.",
      ref_summary: function (n, z) { return n + ' textes applicables · ' + z + ' pays et zones'; },
      map_ref: 'Textes applicables', ref_pdf: 'Annexe — Textes applicables par pays',
      ref_csv_head: ['Pays / zone', 'Catégorie', 'Texte', 'Acronyme', 'Autorité', 'Applicable depuis', 'Amende max.', 'Pertinence', 'Résumé', 'Pourquoi', 'Lien'],

      version_label: 'Version de la veille', version_only: 'Seulement les nouveautés de cette version', version_git: 'Voir cette version sur GitHub',
      version_current: ' (actuelle)', version_base: 'Base de connaissance initiale',
      version_opt: function (d, n) { return d + ' · ' + n + (n > 1 ? ' nouveaux' : ' nouveau'); },
      version_banner: function (d, n, t) { return 'Vous consultez la veille telle qu\'elle était le ' + d + ' : ' + t + ' articles, dont ' + n + ' ajoutés par cette collecte.'; },
      version_rattrapage: ' (rattrapage des archives)',
      version_base_banner: function (n) { return 'Vous consultez la base de connaissance initiale (réglementations depuis le 1er janvier 2026) : ' + n + ' articles.'; },
      f_pert: 'Pertinence', pe_elevee: 'Élevée', pe_moyenne: 'Moyenne', pe_faible: 'Faible',
      pert_title: 'Pertinence estimée pour le client', pert_badge: { elevee: 'Pertinence élevée', moyenne: 'Pertinence moyenne', faible: 'Pertinence faible' },
      f_fine: 'Amendes', am_prononcee: 'Amende prononcée', am_plafond: 'Amende maximale prévue', fine_badge: 'Amende : ', fine_cap: 'Amende max. : ',
      f_status: 'Statut du texte',
      statuts: { adopte: 'Adopté', en_vigueur: 'En vigueur', projet: 'Projet', consultation: 'Consultation', lignes_directrices: 'Lignes directrices', sanction: 'Sanction', autre: 'Autre' },
      sort: 'Trier par', sort_date: "Date (plus récent d'abord)", sort_pert: 'Pertinence', sort_fine: "Montant d'amende",
      sorted_pert: 'Triés par pertinence', sorted_fine: "Triés par montant d'amende",
      why: 'Pourquoi cet article est là', why_themes: 'Thèmes proches : ', why_kw: 'Mots-clés présents : ', why_none: "Aucun mot-clé de la liste : gardé pour ne rien manquer (pertinence estimée d'après le sens du texte).",
      why_base: 'Base de connaissance (recherche documentaire du ', why_score: 'Score : ',
      base_badge: 'Base 2026',
      map_top: 'Dernières réglementations', map_all: 'Tous les articles de ce pays', map_latest: 'Dernière : ',
      src_add: '+ Ajouter une source', src_token: 'Jeton GitHub (modification directe)', src_form_title: 'Nouvelle source',
      sf_name: 'Nom de la source *', sf_zone: 'Pays / zone *', sf_type: 'Type de source', sf_url: 'Adresse du site *',
      sf_feeds: 'Flux RSS (facultatif, un par ligne)', sf_pages: "Pages d'actualités datées (facultatif, une par ligne)",
      sf_hint: "La source sera lue à la prochaine collecte (lundi 7 h, ou bouton « Lancer une mise à jour »). Sans flux ni page d'actualités, la collecte cherche un flux RSS sur le site puis surveille sa page d'accueil.",
      sf_submit: 'Ajouter…', cancel: 'Annuler', confirm: 'Confirmer', sf_err: 'Renseignez au moins le nom, le pays et une adresse commençant par https://',
      th_action: 'Action', src_remove: 'Retirer', src_restore: 'Rétablir', a_removed: '⊘ Retirée',
      mode_token: 'Mode : modification directe (jeton enregistré dans ce navigateur)', mode_issue: 'Mode : proposition via GitHub (validation sur GitHub)', mode_none: "Dépôt GitHub inconnu : il apparaîtra après la première collecte sur GitHub.",
      confirm_add_t: 'Ajouter cette source ?', confirm_rm_t: 'Retirer cette source ?', confirm_rs_t: 'Rétablir cette source ?',
      confirm_add: function (n, u) { return '« ' + n + ' » (' + u + ') sera lue à partir de la prochaine collecte.'; },
      confirm_rm: function (n) { return '« ' + n + ' » ne sera plus lue à partir de la prochaine collecte. Les articles déjà collectés restent sur le site. Vous pourrez la rétablir.'; },
      confirm_rs: function (n) { return '« ' + n + ' » sera de nouveau lue à partir de la prochaine collecte.'; },
      via_token: 'La modification est enregistrée directement dans le dépôt GitHub.',
      via_issue: "GitHub va s'ouvrir avec une demande pré-remplie : cliquez sur « Submit new issue ». Si vous êtes collaborateur du dépôt, elle est appliquée automatiquement ; sinon, elle attend la validation d'un collaborateur.",
      saved_ok: 'Enregistré : pris en compte à la prochaine collecte.', saved_ko: 'Échec de l\'enregistrement : ', opened_gh: 'Demande préparée sur GitHub : validez-la dans l\'onglet ouvert.',
      token_t: 'Jeton GitHub', token_help: "Pour modifier les sources directement depuis ce site, collez un jeton « fine-grained » GitHub (gratuit) limité à ce dépôt, avec l'autorisation Contents : Read and write. Il est gardé uniquement dans ce navigateur. Laissez vide et validez pour l'effacer.",
      token_saved: 'Jeton enregistré dans ce navigateur.', token_cleared: 'Jeton effacé.',
      pdf_all_title: 'Cyber Watch — veille complète', pdf_toc: 'Sommaire', pdf_by_zone: 'Par pays / zone',
      robust_err: "Une partie de la page n'a pas pu s'afficher : ",

      stat_total: 'articles collectés', stat_week: 'publiés ces 7 jours', stat_countries: 'pays et zones couverts', stat_sources: 'sources accessibles',
      tab_watch: 'Veille', tab_map: 'Carte', tab_sources: 'Sources',
      filters: 'Filtres', show_originals: "Afficher les textes d'origine", expand_all: 'Tout déplier', collapse_all: 'Tout replier',
      search: 'Rechercher', search_ph: 'Titre, résumé, source… (ex. NIS2, IVDR, ANSSI)',
      f_period: 'Période de publication', p7: '7 jours', p30: '30 jours', p90: '3 mois', pall: 'Tout',
      f_nature: 'Nature de la source', n_officielle: 'Source officielle', n_cabinet: "Cabinet d'avocats", n_presse: 'Presse & autres', n_synthese: 'Analyse rédigée',
      f_section: 'Rubrique', f_zone: 'Pays / zone', f_tag: 'Mot-clé', f_acro: 'Acronyme', reset: 'Réinitialiser les filtres',
      hint: "Dans un même filtre, les choix s'additionnent (« ou ») ; les filtres entre eux se combinent (« et »). Exception : plusieurs mots-clés ou acronymes cochés, l'article doit tous les porter. Un acronyme regroupe ses variantes nationales (ex. RGPD = GDPR, ΓΚΠΔ, DSGVO…).",
      acro_title: 'Acronymes détectés', ac_all: 'Tous', ac_new: 'Nouveaux (7 jours)', ac_out: 'Conservés tels quels', ac_search_ph: 'Filtrer les acronymes…',
      acro_lead: "Tous les acronymes repérés dans les articles collectés, mis à jour à chaque collecte. Les acronymes ne sont jamais traduits. « Harmonisé » : l'acronyme est une variante nationale ramenée à un sigle commun grâce au glossaire (config/acronymes.json), comme ΓΚΠΔ → GDPR. « Conservé tel quel » : il est affiché sans changement ; si c'est en fait une variante nationale d'un sigle européen, ajoutez-la au glossaire.",
      ac_th_acro: 'Acronyme', ac_th_var: 'Variantes rencontrées', ac_th_n: 'Articles', ac_th_lang: 'Langues', ac_th_first: 'Vu la 1re fois', ac_th_glo: 'Glossaire', ac_th_ex: 'Exemple',
      ac_empty: 'Aucun acronyme pour ce filtre.', ac_in: '✓ Harmonisé', ac_todo: 'Conservé tel quel', ac_none: "Pas encore de liste : elle apparaîtra après la prochaine collecte.",
      ac_summary: function (n, nv, h) { return n + ' acronymes · ' + nv + ' nouveaux cette semaine · ' + (n - h) + ' harmonisés via le glossaire'; },
      ac_chip_title: 'Variantes : ',
      empty: 'Aucun article ne correspond à ces filtres.',
      no_data: "Aucun article collecté pour l'instant. Lancez la première mise à jour : les articles apparaîtront ici.",
      glossary: 'Glossaire', glossary_lead: 'Les textes et notions qui reviennent le plus dans cette veille.',
      map_title: 'Carte de la veille', map_lead: "Nombre d'articles par pays (couleur) et dernière réglementation connue. Cliquez sur un pays : sa fiche affiche ses 5 dernières réglementations (statut, amende, pertinence), puis tous ses articles.",
      map_hint: 'Sélectionnez un pays sur la carte.', map_none: 'Aucun article pour cette zone sur la période.', map_close: 'Fermer',
      map_legend: "Nombre d'articles", map_eu: 'Union européenne', map_world: 'International',
      src_title: 'Sources de la veille',
      src_lead: "Toutes les sources (Excel et ajouts faits depuis ce site) et leur accessibilité lors de la dernière collecte. Une source « partielle » a été lue, mais au moins une de ses pages ou un de ses flux a échoué : le détail est dans la colonne Détail. Vous pouvez ajouter ou retirer une source : c'est pris en compte à la collecte suivante.",
      s_all: 'Toutes', s_ok: 'Accessibles', s_partial: 'Partielles', s_ko: 'Inaccessibles', s_other: 'Ignorées / non configurées',
      src_search_ph: 'Filtrer par nom ou pays…', src_empty: 'Aucune source ne correspond à ce filtre.',
      th_access: 'Accès', th_source: 'Source', th_zone: 'Zone', th_read: 'Lecture', th_found: 'Trouvés', th_new: 'Nouveaux', th_detail: 'Détail',
      method: 'Méthode', method_lead: 'Comment les articles sont collectés, notés et traduits, gratuitement, sans IA payante ni clé API.',
      footer: 'Cyber Watch — Wavestone · collecte, notation et traduction automatiques, gratuites.',
      footer_note: 'Site statique. Données dans le dossier data/, réglages dans config/.',
      last_update: 'Dernière mise à jour : ', new_one: ' nouvel article', new_many: ' nouveaux articles', no_run: "Aucune collecte pour l'instant.",
      at: ' à ', update_title: 'Ouvre GitHub : cliquez sur « Run workflow » puis patientez quelques minutes',
      read_source: "Lire l'article sur le site source", translate_link: 'Traduire la page source',
      published: 'publié le ', detected: 'détecté le ', no_pubdate: ' (date de publication non trouvée)', detected_short: ' (détecté)',
      translated_from: 'Traduit automatiquement de : ', show_original: "Voir le texte d'origine", show_translation: 'Voir la traduction',
      pending_translation: 'Traduction en attente (prochaine collecte)',
      copy: 'Copier pour Teams', copied: 'Copié', copy_ok: 'Résumé copié dans le presse-papiers', copy_ko: 'Copie impossible — sélectionnez le texte manuellement',
      new_badge: 'Nouveau', sources: 'Sources', source: 'Source',
      shown_one: ' article affiché', shown_many: ' articles affichés', articles: ' articles', filters_on_one: ' filtre actif', filters_on_many: ' filtres actifs',
      too_many: "Trop d'articles affichés : filtrez d'abord (max. 300)", nothing_export: 'Aucun article à exporter', exported: ' articles exportés',
      csv_head: ['Date', 'Rubrique', 'Pertinence', 'Titre', "Titre d'origine", 'Langue', 'Source', 'Pays / zone', 'Nature', 'Statut', 'Amende', 'Amende (€, estimation)', 'Pourquoi', 'Mots-clés', 'Lien', 'Résumé'],
      no_date: 'Sans date', syntheses: 'Analyses rédigées', keywords: 'Mots-clés',
      pdf_title: 'Cyber Watch — sélection d\'articles', pdf_generated: 'Généré le ', pdf_count: ' articles',
      src_summary: function (q, n) { return (q ? 'Dernière collecte : ' + q + ' · ' : "Aucune collecte lancée pour l'instant · ") + n + ' sources'; },
      src_none: 'Pas encore de liste : elle apparaîtra après la première collecte.',
      st_ok: 'accessibles', st_partial: 'partielles', st_ko: 'inaccessibles', st_other: 'ignorées ou non configurées',
      a_ok: '✓ Accessible', a_partial: '◐ Partielle', a_ko: '✗ Inaccessible', a_nc: '○ Non configurée', a_off: '— Ignorée', a_wait: '… Pas encore lue',
      m_rss: 'Flux RSS (Excel)', m_rssauto: 'Flux RSS découvert', m_rsspage: 'Flux RSS + pages', m_page: 'Surveillance de page', m_err: 'Inaccessible', m_api: 'API officielle',
      d_feed: 'Flux : ', d_pages: 'Pages : ',
      trad_ok: function (n, w) { return 'Traduction automatique active : ' + n + ' textes traduits lors de la dernière collecte' + (w ? ', ' + w + ' articles en attente (traduits à la prochaine collecte).' : '.'); },
      trad_off: "Traduction automatique indisponible lors de la dernière collecte : les textes s'affichent dans leur langue d'origine. ",
      method_html: [
        ['Collecte', "<p>Chaque lundi à 7 h (et à la demande avec « Lancer une mise à jour »), un script lit toutes les sources : flux RSS en priorité, puis les pages d'actualités datées, sinon la page principale. Les sources ajoutées depuis l'onglet Sources sont lues dès la collecte suivante.</p><p>La base contient toute l'actualité depuis le 1er janvier 2026 : une base de connaissance constituée par recherche documentaire (sources vérifiées, badge « Base 2026 »), complétée par un rattrapage des archives de chaque source. Chaque collecte s'ajoute à cette base ; rien n'est supprimé avant 2 ans.</p>"],
        ['Rien n\'est écarté', "<p><strong>Tous les articles collectés sont gardés.</strong> Chacun reçoit une <strong>pertinence</strong> (élevée, moyenne, faible) calculée par un petit modèle d'IA open source et gratuit, exécuté sur le serveur GitHub. Il compare le <em>sens</em> de l'article aux thèmes qui intéressent le client (NIS2, CRA, RGPD, données de santé, dispositifs médicaux et DIV, AI Act, Data Act, normes, pharma…) : il reconnaît les synonymes, les autres langues et les réglementations larges qui concernent toutes les entreprises.</p><p>Les mots-clés de l'Excel ne décident plus : ils <strong>justifient</strong> la présence de l'article (« Pourquoi cet article est là ») et donnent un petit bonus. Les articles sans lien évident sont rangés dans « Autres actualités à surveiller » plutôt que supprimés.</p>"],
        ['Amendes et statut', "<p>Les montants d'amendes cités dans un article sont détectés automatiquement dans toutes les langues de la veille, et convertis en euros (estimation) pour pouvoir filtrer et trier. « Amende maximale prévue » signale un plafond fixé par un texte (ex. « jusqu'à 10 M€ »), à distinguer d'une amende prononcée.</p><p>Le statut (adopté, en vigueur, projet, consultation…) est renseigné pour les éléments de la base de connaissance.</p>"],
        ['Traduction', "<p>Titres et résumés sont traduits automatiquement par un moteur open source et gratuit (Argos Translate). Le texte d'origine reste disponible sur chaque article.</p><p>Les acronymes (NIS2, CRA, ISO 27001…) ne sont jamais traduits ; les équivalents nationaux d'un même texte européen sont harmonisés (ΓΚΠΔ, DSGVO, RODO → GDPR / RGPD), l'original restant entre parenthèses s'il est dans un autre alphabet.</p>"],
        ['Versions', "<p>Chaque collecte crée une version. Le sélecteur « Version de la veille » affiche la veille telle qu'elle était à une date donnée, ou seulement ce que cette collecte a ajouté. Chaque version est aussi conservée sur GitHub.</p>"],
        ['Nature et limites', "<p><span class=\"badge badge-confirme\">Source officielle</span> autorité, régulateur, journal officiel · <span class=\"badge badge-nuance\">Cabinet d'avocats</span> à recouper avec le texte officiel · <span class=\"badge badge-presse\">Presse &amp; autres</span> presse spécialisée, prestataires.</p><p>La pertinence et la traduction sont automatiques : en cas de doute, lisez l'article. Les montants convertis sont des estimations. Ce site ne constitue pas un conseil juridique.</p>"]
      ]
    },
    en: {
      skip: 'Skip to content', btn_update: 'Run an update', btn_excel: 'Export selection (Excel)', btn_pdf: 'Export selection (PDF)',
      btn_pdf_all: 'Generate the full watch (PDF)',
      tab_ref: 'Applicable texts', ref_title: 'Applicable texts',
      ref_lead: 'The baseline of texts and frameworks that apply today in each country, even without recent news: cyber laws, data, health data, requirements set by healthcare buyers and by the public sector for their suppliers, medical devices, AI, product security, critical entities, certifications. Built by systematic research (10 categories × 19 areas); can be completed by hand in config/referentiel.json.',
      ref_th_cat: 'Category', ref_th_text: 'Text', ref_th_auth: 'Authority', ref_th_since: 'Applies since', ref_th_fine: 'Max. fine',
      ref_all_zones: 'All countries and areas', ref_all_cats: 'All categories', ref_search_ph: 'Filter (name, acronym, authority…)',
      ref_empty: 'No text for this filter.', btn_excel_ref: 'Export (Excel)', ref_none: 'No baseline yet: it will appear after the next collection.',
      ref_summary: function (n, z) { return n + ' applicable texts · ' + z + ' countries and areas'; },
      map_ref: 'Applicable texts', ref_pdf: 'Annex — Applicable texts by country',
      ref_csv_head: ['Country / area', 'Category', 'Text', 'Acronym', 'Authority', 'Applies since', 'Max. fine', 'Relevance', 'Summary', 'Why', 'Link'],

      version_label: 'Watch version', version_only: 'Only what this version added', version_git: 'View this version on GitHub',
      version_current: ' (current)', version_base: 'Initial knowledge base',
      version_opt: function (d, n) { return d + ' · ' + n + ' new'; },
      version_banner: function (d, n, t) { return 'You are viewing the watch as it was on ' + d + ': ' + t + ' articles, ' + n + ' of them added by this collection.'; },
      version_rattrapage: ' (archive catch-up)',
      version_base_banner: function (n) { return 'You are viewing the initial knowledge base (regulations since 1 January 2026): ' + n + ' articles.'; },
      f_pert: 'Relevance', pe_elevee: 'High', pe_moyenne: 'Medium', pe_faible: 'Low',
      pert_title: 'Estimated relevance for the client', pert_badge: { elevee: 'High relevance', moyenne: 'Medium relevance', faible: 'Low relevance' },
      f_fine: 'Fines', am_prononcee: 'Fine imposed', am_plafond: 'Maximum fine provided', fine_badge: 'Fine: ', fine_cap: 'Max. fine: ',
      f_status: 'Status of the text',
      statuts: { adopte: 'Adopted', en_vigueur: 'In force', projet: 'Draft', consultation: 'Consultation', lignes_directrices: 'Guidelines', sanction: 'Enforcement', autre: 'Other' },
      sort: 'Sort by', sort_date: 'Date (newest first)', sort_pert: 'Relevance', sort_fine: 'Fine amount',
      sorted_pert: 'Sorted by relevance', sorted_fine: 'Sorted by fine amount',
      why: 'Why this article is here', why_themes: 'Closest themes: ', why_kw: 'Keywords found: ', why_none: 'No keyword from the list: kept so that nothing is missed (relevance estimated from the meaning of the text).',
      why_base: 'Knowledge base (desk research of ', why_score: 'Score: ',
      base_badge: '2026 base',
      map_top: 'Latest regulations', map_all: 'All articles for this country', map_latest: 'Latest: ',
      src_add: '+ Add a source', src_token: 'GitHub token (direct edit)', src_form_title: 'New source',
      sf_name: 'Source name *', sf_zone: 'Country / area *', sf_type: 'Type of source', sf_url: 'Website address *',
      sf_feeds: 'RSS feeds (optional, one per line)', sf_pages: 'Dated news pages (optional, one per line)',
      sf_hint: 'The source will be read at the next collection (Monday 7 am, or the “Run an update” button). Without a feed or news page, the collection looks for an RSS feed on the website, then monitors its home page.',
      sf_submit: 'Add…', cancel: 'Cancel', confirm: 'Confirm', sf_err: 'Fill in at least the name, the country and an address starting with https://',
      th_action: 'Action', src_remove: 'Remove', src_restore: 'Restore', a_removed: '⊘ Removed',
      mode_token: 'Mode: direct edit (token saved in this browser)', mode_issue: 'Mode: proposal through GitHub (approval on GitHub)', mode_none: 'GitHub repository unknown: it will appear after the first collection on GitHub.',
      confirm_add_t: 'Add this source?', confirm_rm_t: 'Remove this source?', confirm_rs_t: 'Restore this source?',
      confirm_add: function (n, u) { return '“' + n + '” (' + u + ') will be read from the next collection onwards.'; },
      confirm_rm: function (n) { return '“' + n + '” will no longer be read from the next collection onwards. Articles already collected stay on the site. You can restore it later.'; },
      confirm_rs: function (n) { return '“' + n + '” will be read again from the next collection onwards.'; },
      via_token: 'The change is saved directly in the GitHub repository.',
      via_issue: 'GitHub will open with a pre-filled request: click “Submit new issue”. If you are a collaborator on the repository it is applied automatically; otherwise it waits for a collaborator to approve it.',
      saved_ok: 'Saved: applied at the next collection.', saved_ko: 'Could not save: ', opened_gh: 'Request prepared on GitHub: submit it in the tab that opened.',
      token_t: 'GitHub token', token_help: 'To edit sources directly from this site, paste a free GitHub “fine-grained” token restricted to this repository, with the permission Contents: Read and write. It is kept only in this browser. Leave empty and confirm to delete it.',
      token_saved: 'Token saved in this browser.', token_cleared: 'Token deleted.',
      pdf_all_title: 'Cyber Watch — full watch', pdf_toc: 'Contents', pdf_by_zone: 'By country / area',
      robust_err: 'Part of the page could not be displayed: ',

      stat_total: 'articles collected', stat_week: 'published in the last 7 days', stat_countries: 'countries & areas covered', stat_sources: 'sources reachable',
      tab_watch: 'Watch', tab_map: 'Map', tab_sources: 'Sources',
      filters: 'Filters', show_originals: 'Show original texts', expand_all: 'Expand all', collapse_all: 'Collapse all',
      search: 'Search', search_ph: 'Title, summary, source… (e.g. NIS2, IVDR, ANSSI)',
      f_period: 'Publication period', p7: '7 days', p30: '30 days', p90: '3 months', pall: 'All',
      f_nature: 'Type of source', n_officielle: 'Official source', n_cabinet: 'Law firm', n_presse: 'Press & other', n_synthese: 'Written analysis',
      f_section: 'Section', f_zone: 'Country / area', f_tag: 'Keyword', f_acro: 'Acronym', reset: 'Reset filters',
      hint: 'Within one filter, choices add up (“or”); different filters combine (“and”). Exception: with several keywords or acronyms selected, articles must carry all of them. An acronym groups its national variants (e.g. GDPR = RGPD, ΓΚΠΔ, DSGVO…).',
      acro_title: 'Detected acronyms', ac_all: 'All', ac_new: 'New (7 days)', ac_out: 'Kept as is', ac_search_ph: 'Filter acronyms…',
      acro_lead: 'Every acronym found in the collected articles, updated at each collection. Acronyms are never translated. “Harmonised”: a national variant mapped to a common acronym through the glossary (config/acronymes.json), such as ΓΚΠΔ → GDPR. “Kept as is”: shown unchanged; if it is in fact a national variant of an EU acronym, add it to the glossary.',
      ac_th_acro: 'Acronym', ac_th_var: 'Variants found', ac_th_n: 'Articles', ac_th_lang: 'Languages', ac_th_first: 'First seen', ac_th_glo: 'Glossary', ac_th_ex: 'Example',
      ac_empty: 'No acronym for this filter.', ac_in: '✓ Harmonised', ac_todo: 'Kept as is', ac_none: 'No list yet: it will appear after the next collection.',
      ac_summary: function (n, nv, h) { return n + ' acronyms · ' + nv + ' new this week · ' + (n - h) + ' harmonised via the glossary'; },
      ac_chip_title: 'Variants: ',
      empty: 'No article matches these filters.',
      no_data: 'No article collected yet. Run the first update: articles will appear here.',
      glossary: 'Glossary', glossary_lead: 'The texts and notions that come up most often in this watch.',
      map_title: 'Watch map', map_lead: 'Number of articles per country (colour) and latest known regulation. Click a country: its card shows its 5 latest regulations (status, fine, relevance), then all its articles.',
      map_hint: 'Select a country on the map.', map_none: 'No article for this area over the period.', map_close: 'Close',
      map_legend: 'Number of articles', map_eu: 'European Union', map_world: 'International',
      src_title: 'Watch sources',
      src_lead: 'Every source (spreadsheet and additions made from this site), and whether it could be read during the last collection. A “partial” source was read, but at least one of its pages or feeds failed: see the Details column. You can add or remove a source: it applies from the next collection.',
      s_all: 'All', s_ok: 'Reachable', s_partial: 'Partial', s_ko: 'Unreachable', s_other: 'Ignored / not configured',
      src_search_ph: 'Filter by name or country…', src_empty: 'No source matches this filter.',
      th_access: 'Access', th_source: 'Source', th_zone: 'Area', th_read: 'Read via', th_found: 'Found', th_new: 'New', th_detail: 'Details',
      method: 'Method', method_lead: 'How articles are collected, rated and translated — free of charge, with no paid AI and no API key.',
      footer: 'Cyber Watch — Wavestone · free automated collection, rating and translation.',
      footer_note: 'Static site. Data in the data/ folder, settings in config/.',
      last_update: 'Last update: ', new_one: ' new article', new_many: ' new articles', no_run: 'No collection yet.',
      at: ' at ', update_title: 'Opens GitHub: click “Run workflow”, then wait a few minutes',
      read_source: 'Read the article on the source website', translate_link: 'Translate the source page',
      published: 'published ', detected: 'detected ', no_pubdate: ' (publication date not found)', detected_short: ' (detected)',
      translated_from: 'Machine-translated from: ', show_original: 'Show original text', show_translation: 'Show translation',
      pending_translation: 'Translation pending (next collection)',
      copy: 'Copy for Teams', copied: 'Copied', copy_ok: 'Summary copied to clipboard', copy_ko: 'Copy failed — select the text manually',
      new_badge: 'New', sources: 'Sources', source: 'Source',
      shown_one: ' article shown', shown_many: ' articles shown', articles: ' articles', filters_on_one: ' active filter', filters_on_many: ' active filters',
      too_many: 'Too many articles shown: filter first (max. 300)', nothing_export: 'No article to export', exported: ' articles exported',
      csv_head: ['Date', 'Section', 'Relevance', 'Title', 'Original title', 'Language', 'Source', 'Country / area', 'Type', 'Status', 'Fine', 'Fine (€, estimate)', 'Why', 'Keywords', 'Link', 'Summary'],
      no_date: 'No date', syntheses: 'Written analyses', keywords: 'Keywords',
      pdf_title: 'Cyber Watch — selected articles', pdf_generated: 'Generated on ', pdf_count: ' articles',
      src_summary: function (q, n) { return (q ? 'Last collection: ' + q + ' · ' : 'No collection run yet · ') + n + ' sources'; },
      src_none: 'No list yet: it will appear after the first collection.',
      st_ok: 'reachable', st_partial: 'partial', st_ko: 'unreachable', st_other: 'ignored or not configured',
      a_ok: '✓ Reachable', a_partial: '◐ Partial', a_ko: '✗ Unreachable', a_nc: '○ Not configured', a_off: '— Ignored', a_wait: '… Not read yet',
      m_rss: 'RSS feed (spreadsheet)', m_rssauto: 'RSS feed (discovered)', m_rsspage: 'RSS feed + pages', m_page: 'Page monitoring', m_err: 'Unreachable', m_api: 'Official API',
      d_feed: 'Feed: ', d_pages: 'Pages: ',
      trad_ok: function (n, w) { return 'Machine translation active: ' + n + ' texts translated during the last collection' + (w ? ', ' + w + ' articles pending (translated at the next collection).' : '.'); },
      trad_off: 'Machine translation was unavailable during the last collection: texts are shown in their original language. ',
      method_html: [
        ['Collection', '<p>Every Monday at 7 am (and on demand with “Run an update”), a script reads every source: RSS feeds first, then dated news pages, otherwise the main page. Sources added from the Sources tab are read from the next collection onwards.</p><p>The database holds all news since 1 January 2026: a knowledge base built by desk research (verified sources, “2026 base” badge), plus a catch-up of each source’s archives. Each collection adds to this base; nothing is deleted before 2 years.</p>'],
        ['Nothing is discarded', '<p><strong>Every collected article is kept.</strong> Each one gets a <strong>relevance</strong> rating (high, medium, low) computed by a small, free, open-source AI model running on the GitHub server. It compares the <em>meaning</em> of the article with the themes the client cares about (NIS2, CRA, GDPR, health data, medical devices and IVD, AI Act, Data Act, standards, pharma…): it recognises synonyms, other languages and broad regulations that apply to all companies.</p><p>Spreadsheet keywords no longer decide: they <strong>justify</strong> why an article is here (“Why this article is here”) and add a small bonus. Articles with no obvious link are filed under “Other news to monitor” instead of being deleted.</p>'],
        ['Fines and status', '<p>Fine amounts quoted in an article are detected automatically in every language of the watch and converted into euros (estimate) for filtering and sorting. “Maximum fine provided” flags a cap set by a text (e.g. “up to €10M”), as opposed to a fine actually imposed.</p><p>The status (adopted, in force, draft, consultation…) is given for knowledge-base items.</p>'],
        ['Translation', '<p>Titles and summaries are machine-translated by a free, open-source engine (Argos Translate). The original text remains available on every article.</p><p>Acronyms (NIS2, CRA, ISO 27001…) are never translated; national equivalents of the same EU act are harmonised (ΓΚΠΔ, DSGVO, RODO → GDPR), with the original kept in brackets when it uses another alphabet.</p>'],
        ['Versions', '<p>Each collection creates a version. The “Watch version” selector shows the watch as it was on a given date, or only what that collection added. Each version is also kept on GitHub.</p>'],
        ['Source types and limits', '<p><span class="badge badge-confirme">Official source</span> authority, regulator, official journal · <span class="badge badge-nuance">Law firm</span> to be checked against the official text · <span class="badge badge-presse">Press &amp; other</span> specialised press, service providers.</p><p>Relevance and translation are automatic: when in doubt, read the article. Converted amounts are estimates. This site does not constitute legal advice.</p>']
      ]
    }
  };
  function t(k) { return (T[LANG] && T[LANG][k] !== undefined) ? T[LANG][k] : T.fr[k]; }

  var MOIS = {
    fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  };
  var LANGUES = {
    fr: { fr: 'français', en: 'anglais', de: 'allemand', es: 'espagnol', it: 'italien', pt: 'portugais', nl: 'néerlandais', pl: 'polonais', cs: 'tchèque', el: 'grec', hu: 'hongrois', da: 'danois', sv: 'suédois', nb: 'norvégien', fi: 'finnois', bg: 'bulgare' },
    en: { fr: 'French', en: 'English', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese', nl: 'Dutch', pl: 'Polish', cs: 'Czech', el: 'Greek', hu: 'Hungarian', da: 'Danish', sv: 'Swedish', nb: 'Norwegian', fi: 'Finnish', bg: 'Bulgarian' }
  };

  /* Pays / zones : nom dans l'Excel -> code, libellés FR / EN, position sur la carte (colonne, ligne) */
  var ZONES = {
    'Norvège':      { code: 'NO', fr: 'Norvège', en: 'Norway', x: 5, y: 1 },
    'Suède':        { code: 'SE', fr: 'Suède', en: 'Sweden', x: 6, y: 1 },
    'Finlande':     { code: 'FI', fr: 'Finlande', en: 'Finland', x: 7, y: 1 },
    'Royaume-Uni':  { code: 'UK', fr: 'Royaume-Uni', en: 'United Kingdom', x: 3, y: 2 },
    'Danemark':     { code: 'DK', fr: 'Danemark', en: 'Denmark', x: 5, y: 2 },
    'Pays-Bas':     { code: 'NL', fr: 'Pays-Bas', en: 'Netherlands', x: 4, y: 3 },
    'Allemagne':    { code: 'DE', fr: 'Allemagne', en: 'Germany', x: 5, y: 3 },
    'Pologne':      { code: 'PL', fr: 'Pologne', en: 'Poland', x: 6, y: 3 },
    'Belgique':     { code: 'BE', fr: 'Belgique', en: 'Belgium', x: 4, y: 4 },
    'Rép. Tchèque': { code: 'CZ', fr: 'Rép. tchèque', en: 'Czechia', x: 6, y: 4 },
    'France':       { code: 'FR', fr: 'France', en: 'France', x: 3, y: 5 },
    'Suisse':       { code: 'CH', fr: 'Suisse', en: 'Switzerland', x: 4, y: 5 },
    'Autriche':     { code: 'AT', fr: 'Autriche', en: 'Austria', x: 5, y: 5 },
    'Hongrie':      { code: 'HU', fr: 'Hongrie', en: 'Hungary', x: 6, y: 5 },
    'Portugal':     { code: 'PT', fr: 'Portugal', en: 'Portugal', x: 1, y: 6 },
    'Espagne':      { code: 'ES', fr: 'Espagne', en: 'Spain', x: 2, y: 6 },
    'Italie':       { code: 'IT', fr: 'Italie', en: 'Italy', x: 5, y: 6 },
    'Bulgarie':     { code: 'BG', fr: 'Bulgarie', en: 'Bulgaria', x: 7, y: 6 },
    'Grèce':        { code: 'GR', fr: 'Grèce', en: 'Greece', x: 7, y: 7 },
    'Europe':       { code: 'EU', fr: 'Union européenne', en: 'European Union', side: true },
    'Worldwide':    { code: 'INT', fr: 'International', en: 'International', side: true }
  };
  function nomZone(z) { var d = ZONES[z]; return d ? d[LANG] : (z || '—'); }

  /* ================================================================ utilitaires */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'text') node.textContent = v;
        else if (k === 'className') node.className = v;
        else if (k === 'html') node.innerHTML = v;
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
    if (!d) return '';
    return LANG === 'en' ? d.getDate() + ' ' + MOIS.en[d.getMonth()] + ' ' + d.getFullYear()
                         : d.getDate() + ' ' + MOIS.fr[d.getMonth()] + ' ' + d.getFullYear();
  }
  function moisAnnee(iso) {
    var d = isoToDate(iso);
    if (!d) return t('no_date');
    var m = MOIS[LANG][d.getMonth()];
    return m.charAt(0).toUpperCase() + m.slice(1) + ' ' + d.getFullYear();
  }
  function texteToIso(txt) {
    var m = /(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(\d{4})/i.exec(txt || '');
    if (!m) return '';
    var i = MOIS.fr.indexOf(m[2].toLowerCase());
    if (i < 0) return '';
    return m[3] + '-' + ('0' + (i + 1)).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  }
  function traduireDateTexte(txt) {   // « juillet 2026 » -> « July 2026 » en anglais
    if (LANG !== 'en' || !txt) return txt;
    var iso = texteToIso(txt);
    if (iso) return dateLongue(iso);
    return txt.replace(/[a-zéû]+/gi, function (w) { var i = MOIS.fr.indexOf(w.toLowerCase()); return i < 0 ? w : MOIS.en[i]; });
  }
  function normaliser(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  var aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0);
  function joursDepuis(iso) { var d = isoToDate(iso); return d ? Math.round((aujourdhui - d) / 86400000) : 99999; }
  function libelleTag(tag) { return LANG === 'en' ? ((META.libelles_en || {})[tag] || tag) : tag; }
  function horodatage(isoDateTime) {
    var d = new Date(isoDateTime);
    if (isNaN(d)) return isoDateTime || '';
    var loc = LANG === 'en' ? 'en-GB' : 'fr-FR';
    return d.toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' }) + t('at') +
      d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  }

  /* Acronymes : même règle que la collecte (collecte/traduction.py) */
  var RE_ACRO = /(?<![\p{L}\p{N}_-])(ISO(?:\/IEC)?\s?\d{4,5}(?:-\d+)?|[A-ZÀ-ÖØ-ÞΑ-ΩΆ-Ώ][A-ZÀ-ÖØ-ÞΑ-ΩΆ-Ώ0-9\/]{1,7}(?:\s?\d+)?(?:-[\p{L}\p{N}_]+)*)(?![\p{L}\p{N}_])/gu;
  var MOTS_MAJ = ['THE', 'AND', 'FOR', 'NEW', 'DE', 'LA', 'LE', 'LES', 'ET', 'DES', 'DU', 'EN', 'UN', 'UNE', 'DER', 'DIE', 'DAS', 'UND',
                  'EL', 'LOS', 'DEL', 'IL', 'DI', 'OF', 'TO', 'IN', 'ON', 'AT', 'ΚΑΙ', 'ΓΙΑ', 'ΤΗΝ', 'ΤΟΝ', 'ΤΗΣ', 'ΤΟΥ', 'ΣΤΗΝ', 'ΣΤΟ', 'UPDATE', 'NEWS', 'PDF'];
  function acronymesDe(texte) {
    if (!texte) return [];
    var lettres = texte.replace(/[^\p{L}]/gu, ''), maj = texte.replace(/[^\p{Lu}]/gu, '');
    var toutMaj = lettres.length > 12 && maj.length / lettres.length > 0.8;
    var out = [], m;
    RE_ACRO.lastIndex = 0;
    while ((m = RE_ACRO.exec(texte))) {
      var brut = /^ISO/i.test(m[1]) ? m[1].replace(/\s+/g, ' ') : m[1].replace(/^([^\d\s-]+)[\s-]+(\d{1,2})$/, '$1$2');
      if (brut.indexOf('-') !== -1 && brut.split('-')[0] !== brut.split('-')[0].toUpperCase()) continue;
      if (brut.indexOf('-') !== -1 && !GLOSSAIRE[brut] && /^\p{Lu}\p{Ll}+$/u.test(brut.slice(brut.indexOf('-') + 1))) brut = brut.split('-')[0];
      if (MOTS_MAJ.indexOf(brut.toUpperCase()) !== -1 || /^[IVXLC]+$/.test(brut)) continue;
      if (toutMaj && !GLOSSAIRE[brut] && !/\d/.test(brut)) continue;
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
  function variantesAcro(code) {
    var v = (ACRO_INFO[code] && ACRO_INFO[code].variantes) ? ACRO_INFO[code].variantes.slice() : [];
    Object.keys(GLOSSAIRE).forEach(function (k) { if (GLOSSAIRE[k].en === code && v.indexOf(k) === -1) v.push(k); });
    return v;
  }

  /* Texte d'un article dans la langue du site (traduction si disponible) */
  function textes(a) {
    var orig = { titre: a.titre, resume: a.resume || '' };
    if (!a.langue || a.langue === LANG) return { aff: orig, orig: orig, traduit: false };
    var tr = a.trad && a.trad[LANG];
    if (tr && tr.titre) return { aff: { titre: tr.titre, resume: tr.resume || '' }, orig: orig, traduit: true, de: a.langue };
    return { aff: orig, orig: orig, traduit: false, attente: true, de: a.langue };
  }

  /* ================================================================ textes statiques */

  function appliquerTextes() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (n) { n.textContent = t(n.getAttribute('data-i18n')); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-ph]'), function (n) { n.setAttribute('placeholder', t(n.getAttribute('data-i18n-ph'))); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-aria]'), function (n) { n.setAttribute('aria-label', t(n.getAttribute('data-i18n-aria'))); });
    Array.prototype.forEach.call(document.querySelectorAll('.lang-btn'), function (b) {
      var on = b.getAttribute('data-lang') === LANG;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.addEventListener('click', function () {
        if (on) return;
        try { localStorage.setItem('cw-lang', b.getAttribute('data-lang')); } catch (e) {}
        var q = location.search.replace(/[?&]lang=(fr|en)/, '');
        location.href = location.pathname + (q ? q + '&' : '?') .replace(/^&/, '?') + 'lang=' + b.getAttribute('data-lang') + location.hash;
      });
    });
    var mb = document.getElementById('method-blocks');
    t('method_html').forEach(function (b) {
      mb.appendChild(el('div', { className: 'method-block' }, [el('h3', { text: b[0] }), el('div', { html: b[1] })]));
    });
  }

  function renderHeader() {
    var titre = META.titre || 'Cyber Watch';
    document.getElementById('titre').textContent = titre;
    document.title = titre;
    var sur = LANG === 'en' ? (META.surtitre_en || 'Regulatory watch — Wavestone') : (META.surtitre || 'Veille réglementaire — Wavestone');
    var sous = LANG === 'en' ? (META.sous_titre_en || '') : (META.sous_titre || '');
    document.getElementById('surtitre').textContent = sur;
    document.getElementById('sous-titre').textContent = sous;
    var info = document.getElementById('update-info');
    info.textContent = META.mise_a_jour
      ? t('last_update') + horodatage(META.mise_a_jour) + ' · ' + (META.nb_nouveaux || 0) + (META.nb_nouveaux > 1 ? t('new_many') : t('new_one'))
      : t('no_run');
    var btn = document.getElementById('lancer-maj');
    if (META.url_lancer_maj) { btn.href = META.url_lancer_maj; btn.hidden = false; btn.title = t('update_title'); }
  }

  /* ================================================================ onglets */

  var ONGLETS = ['veille', 'carte', 'referentiel', 'sources'];
  function ongletDepuisHash() {
    var h = (location.hash || '').slice(1);
    if (ONGLETS.indexOf(h) !== -1) return h;
    var cible = h && document.getElementById(h);
    if (cible) { var p = cible.closest('.tab-panel'); if (p) return p.getAttribute('data-tab'); }
    return 'veille';
  }
  function afficherOnglet(nom) {
    Array.prototype.forEach.call(document.querySelectorAll('.tab-panel'), function (p) { p.hidden = p.getAttribute('data-tab') !== nom; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab-link]'), function (a) {
      var on = a.getAttribute('data-tab-link') === nom;
      a.setAttribute('aria-selected', on ? 'true' : 'false');
      a.classList.toggle('tab-on', on);
    });
    document.getElementById('nav').hidden = nom !== 'veille';
  }

  /* ================================================================ cartes d'articles */

  var NATURES = {
    officielle: { key: 'n_officielle', badge: 'badge-confirme' },
    cabinet:    { key: 'n_cabinet',    badge: 'badge-nuance' },
    presse:     { key: 'n_presse',     badge: 'badge-presse' },
    synthese:   { key: 'n_synthese',   badge: 'badge-confirme' }
  };
  var CONF = {
    confirme: { fr: 'Confirmé', en: 'Confirmed', badge: 'badge-confirme' },
    nuance:   { fr: 'Nuancé',   en: 'Qualified', badge: 'badge-nuance' },
    rapporte: { fr: 'Rapporté', en: 'Reported',  badge: 'badge-rapporte' }
  };

  var registre = {};  // id de carte -> { données, textes }
  var voirOriginaux = false;

  function cardHead(id, titre, accroche, dateTxt, badges) {
    var meta = el('span', { className: 'card-meta' }, [el('span', { className: 'card-date', text: dateTxt })]);
    badges.forEach(function (b) { meta.appendChild(b); });
    meta.appendChild(el('span', { className: 'chevron', 'aria-hidden': 'true' }));
    return el('button', { type: 'button', className: 'card-head', 'aria-expanded': 'false', 'aria-controls': id + '-body' }, [
      el('span', { className: 'card-headline' }, [
        el('span', { className: 'card-title', text: titre }),
        accroche ? el('span', { className: 'card-hook', text: accroche }) : el('span', { className: 'card-hook', hidden: true })
      ]),
      meta
    ]);
  }

  function tagList(tags) {
    var ul = el('ul', { className: 'tags' });
    tags.forEach(function (tg) {
      ul.appendChild(el('li', null, [el('button', { type: 'button', className: 'tag', 'data-tag': tg, text: libelleTag(tg) })]));
    });
    return ul;
  }

  /* Bascule texte traduit / texte d'origine d'une carte */
  function montrerTexte(card, original) {
    var r = registre[card.id];
    if (!r || !r.tx || !r.tx.traduit) return;
    var v = original ? r.tx.orig : r.tx.aff;
    card.querySelector('.card-title').textContent = v.titre;
    var hook = card.querySelector('.card-hook');
    hook.textContent = v.resume; hook.hidden = !v.resume;
    card.classList.toggle('is-original', original);
    var b = card.querySelector('[data-bascule]');
    if (b) b.textContent = original ? t('show_translation') : t('show_original');
    card._original = original;
  }

  function nomTheme(id) { var th = THEMES[id]; return th ? (th[LANG] || th.fr) : id; }
  function libStatut(st) { return (t('statuts') || {})[st] || st; }
  function badgeAmende(a) {
    if (!a.amende) return null;
    return el('span', { className: 'badge badge-fine' + (a.amende.plafond ? ' badge-fine-cap' : ''), title: a.amende.texte,
      text: (a.amende.plafond ? t('fine_cap') : t('fine_badge')) + montantCourt(a.amende.montant_eur) });
  }
  function montantCourt(v) {
    if (v === undefined || v === null) return '';
    var dec = LANG === 'en' ? '.' : ',';
    function f(x) { return (Math.round(x * 10) / 10).toString().replace('.', dec); }
    if (v >= 1e9) return (LANG === 'en' ? '€' + f(v / 1e9) + 'bn' : f(v / 1e9) + ' Md€');
    if (v >= 1e6) return (LANG === 'en' ? '€' + f(v / 1e6) + 'M' : f(v / 1e6) + ' M€');
    if (v >= 1e3) return (LANG === 'en' ? '€' + Math.round(v / 1e3) + 'k' : Math.round(v / 1e3) + ' k€');
    return (LANG === 'en' ? '€' + v : v + ' €');
  }
  function texteAmende(a) {
    if (!a.amende) return '';
    var lab = a.amende.plafond ? t('fine_cap') : t('fine_badge');
    // la base de connaissance donne le montant d'origine en français : en anglais, montant converti seulement
    if (LANG === 'en' && a.base) return lab + montantCourt(a.amende.montant_eur) + (/[£]|SEK|NOK|DKK|PLN|HUF|CZK|CHF|zł/.test(a.amende.texte || '') ? ' (approx., converted)' : '');
    return lab + a.amende.texte;
  }
  function pourquoiTexte(a) {
    if (a.base) {
      var p = (a.pourquoi || {})[LANG] || (a.pourquoi || {}).fr || '';
      return p;
    }
    var morceaux = [];
    if (a.themes && a.themes.length) morceaux.push(t('why_themes') + a.themes.map(nomTheme).join(', '));
    if (a.tags && a.tags.length) morceaux.push(t('why_kw') + a.tags.map(libelleTag).join(', '));
    if (!a.tags || !a.tags.length) morceaux.push(t('why_none'));
    return morceaux.join(' · ');
  }

  function carteArticle(a) {
    var id = 'a-' + a.id;
    var tx = textes(a);
    registre[id] = { d: a, tx: tx };
    var nat = NATURES[a.nature] || NATURES.presse;
    var badges = [el('span', { className: 'badge ' + nat.badge, text: t(nat.key) })];
    if (a.statut && a.statut !== 'autre') badges.unshift(el('span', { className: 'badge badge-statut', text: libStatut(a.statut) }));
    var ba = badgeAmende(a); if (ba) badges.unshift(ba);
    if (tx.traduit && !a.base) badges.unshift(el('span', { className: 'badge badge-lang', title: t('translated_from') + LANGUES[LANG][tx.de], text: (tx.de || '').toUpperCase() + '→' + LANG.toUpperCase() }));
    if (a.pertinence) badges.unshift(el('span', { className: 'badge badge-p badge-p-' + a.pertinence, title: t('pert_title'), text: t('pert_badge')[a.pertinence] }));
    if (a.base) badges.unshift(el('span', { className: 'badge badge-base', text: t('base_badge') }));
    if (META.version && a.version === META.version && VERSIONS.length > 1) badges.unshift(el('span', { className: 'badge badge-new', text: t('new_badge') }));
    var dateTxt = dateLongue(a.date) + (a.date_estimee ? t('detected_short') : '');
    var card = el('article', {
      className: 'card', id: id, 'data-section': a.rubrique, 'data-nature': a.nature, 'data-zone': a.zone || '—',
      'data-date': a.date, 'data-tags': (a.tags || []).join('|'), 'data-pert': a.pertinence || 'faible',
      'data-amende': a.amende ? (a.amende.plafond ? 'plafond' : 'prononcee') : '', 'data-statut': a.statut || '',
      'data-acro': (a.acronymes || acronymesDe(a.titre + ' ' + (a.resume || ''))).join('|')
    }, [cardHead(id, tx.aff.titre, tx.aff.resume, dateTxt, badges)]);
    card._rang = rangVersion(a); card._version = a.version || '';
    card._tri = { date: a.date || '', pert: ORDRE_PERT[a.pertinence] === undefined ? 3 : ORDRE_PERT[a.pertinence], score: a.score || 0,
                  montant: a.amende ? a.amende.montant_eur : -1 };
    card._build = function () {
      var lien = el('a', { href: a.lien, target: '_blank', rel: 'noopener noreferrer', text: t('read_source') });
      var parts = [];
      var pq = pourquoiTexte(a);
      parts.push(el('div', { className: 'why' }, [
        el('p', { className: 'why-title', text: t('why') + (a.pertinence ? ' — ' + t('pert_badge')[a.pertinence] : '') }),
        pq ? el('p', { className: 'why-text', text: pq }) : null,
        a.base ? el('p', { className: 'why-meta', text: t('why_base') + dateLongue(a.detecte_le) + ')' }) : null,
        a.amende ? el('p', { className: 'why-meta', text: texteAmende(a) }) : null
      ]));
      if (tx.traduit && !a.base) {
        parts.push(el('p', { className: 'trad-line' }, [
          t('translated_from') + LANGUES[LANG][tx.de] + ' · ',
          el('button', { type: 'button', className: 'linkbtn', 'data-bascule': true, text: card._original ? t('show_translation') : t('show_original') })
        ]));
      } else if (tx.attente && !a.base) {
        parts.push(el('p', { className: 'trad-line', text: t('pending_translation') + ' · ' + (LANGUES[LANG][tx.de] || tx.de) }));
      }
      var ligne2 = [lien];
      if (a.langue && a.langue !== LANG) {
        ligne2.push(' · ', el('a', {
          href: 'https://translate.google.com/translate?sl=auto&tl=' + LANG + '&u=' + encodeURIComponent(a.lien),
          target: '_blank', rel: 'noopener noreferrer', text: t('translate_link')
        }));
      }
      parts.push(el('div', { className: 'sources' }, [
        el('p', { className: 'sources-title', text: t('source') }),
        el('p', { className: 'src-line' }, [
          el('strong', { text: a.source }), ' · ' + nomZone(a.zone) + ' · ' +
          (a.date_estimee ? t('detected') + dateLongue(a.date) + t('no_pubdate') : t('published') + dateLongue(a.date))
        ]),
        el('p', { className: 'src-line' }, ligne2)
      ]));
      if (a.tags && a.tags.length) parts.push(tagList(a.tags));
      return parts;
    };
    return card;
  }

  function synthesesLangue() {
    // Anglais : fiches traduites si disponibles, sinon français
    return (LANG === 'en' && SYNTH_EN && SYNTH_EN.groupes && SYNTH_EN.groupes.length) ? SYNTH_EN : SYNTH_FR;
  }

  function carteSynthese(f, fFr) {
    var id = 's-' + f.id;
    var iso = texteToIso(fFr.date);
    registre[id] = {
      d: { titre: f.titre, resume: f.accroche, date: iso, source: t('n_synthese'), zone: '—', nature: 'synthese',
           rubrique: 'syntheses', tags: f.tags || [], lien: (f.sources && f.sources[0]) ? f.sources[0].url : '' },
      tx: { traduit: false }
    };
    var c = CONF[f.conf] || CONF.confirme;
    var card = el('article', {
      className: 'card', id: id, 'data-section': 'syntheses', 'data-nature': 'synthese',
      'data-zone': '—', 'data-date': iso, 'data-tags': (f.tags || []).join('|'),
      'data-acro': acronymesDe([fFr.titre, fFr.accroche].concat(fFr.paragraphes || []).join(' ')).join('|')
    }, [cardHead(id, f.titre, f.accroche, traduireDateTexte(fFr.date), [el('span', { className: 'badge ' + c.badge, text: c[LANG] })])]);
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
        parts.push(el('div', { className: 'sources' }, [el('p', { className: 'sources-title', text: t('sources') }), ol]));
      }
      return parts;
    };
    return card;
  }

  function construireCorps(card) {
    if (card.querySelector('.card-body')) return;
    card.appendChild(el('div', { className: 'card-body', id: card.id + '-body', hidden: true },
      (card._build ? card._build() : []).concat([
        el('div', { className: 'card-actions' }, [
          el('button', { type: 'button', className: 'btn btn-copy', 'data-copy': true, text: t('copy') })
        ])
      ])));
  }

  /* ================================================================ rubriques */

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
      el('h3', { className: 'sub-title' }, [titre + ' ', el('span', { className: 'badge-count', 'data-sub-count': true })]), box
    ]);
  }

  var navItems = [];
  function titreRubrique(r) { return LANG === 'en' ? (r.titre_en || r.titre) : r.titre; }
  function chapeauRubrique(r) { return LANG === 'en' ? (r.chapeau_en || r.chapeau) : r.chapeau; }

  function renderRubriques() {
    var root = document.getElementById('rubriques');
    (META.rubriques || []).forEach(function (r, i) {
      var num = ('0' + (i + 1)).slice(-2);
      var arts = ARTICLES.filter(function (a) { return a.rubrique === r.id; });
      if (!arts.length) return;
      var sec = section(r.id, num, titreRubrique(r), chapeauRubrique(r));
      var groupes = [], courant = null;
      arts.forEach(function (a) {
        var m = moisAnnee(a.date);
        if (!courant || courant.titre !== m) { courant = { titre: m, cartes: [] }; groupes.push(courant); }
        courant.cartes.push(carteArticle(a));
      });
      groupes.forEach(function (g) { sec.appendChild(sousSection(g.titre, g.cartes)); });
      root.appendChild(sec);
      navItems.push({ href: '#' + r.id, num: num, id: r.id, titre: titreRubrique(r) });
    });

    var S = synthesesLangue();
    if (SYNTH_FR.groupes && SYNTH_FR.groupes.length) {
      var num = ('0' + ((META.rubriques || []).length + 1)).slice(-2);
      var titreS = S.titre || t('syntheses');
      var sec = section('syntheses', num, titreS, S.chapeau);
      SYNTH_FR.groupes.forEach(function (gFr, gi) {
        var g = (S.groupes && S.groupes[gi]) || gFr;
        sec.appendChild(sousSection(g.titre, (gFr.fiches || []).map(function (fFr, fi) {
          return carteSynthese((g.fiches && g.fiches[fi]) || fFr, fFr);
        })));
      });
      root.appendChild(sec);
      navItems.push({ href: '#syntheses', num: num, id: 'syntheses', titre: titreS });
    }

    if (S.glossaire && S.glossaire.length) {
      var ol = document.getElementById('glossary');
      S.glossaire.forEach(function (g, i) {
        ol.appendChild(el('li', null, [
          el('span', { className: 'gloss-num', text: ('0' + (i + 1)).slice(-2) }),
          el('div', null, [el('p', { className: 'gloss-term', text: g.terme }), el('p', { className: 'gloss-def', text: g.definition })])
        ]));
      });
      document.getElementById('glossaire').hidden = false;
    }

    var nav = document.getElementById('nav');
    navItems.concat(S.glossaire && S.glossaire.length ? [{ href: '#glossaire', titre: t('glossary') }] : []).forEach(function (n) {
      nav.appendChild(el('a', { href: n.href }, [n.num ? el('span', { className: 'nav-num', text: n.num }) : null, ' ' + n.titre]));
    });
    document.getElementById('no-data').hidden = ARTICLES.length > 0;
  }

  /* ================================================================ onglet Sources */

  var ACCES = {
    ok:             { key: 'a_ok',      cls: 'mode-ok',   ordre: 3 },
    partielle:      { key: 'a_partial', cls: 'mode-page', ordre: 1 },
    ko:             { key: 'a_ko',      cls: 'mode-err',  ordre: 0 },
    non_configuree: { key: 'a_nc',      cls: 'mode-off',  ordre: 2 },
    inactive:       { key: 'a_off',     cls: 'mode-off',  ordre: 4 },
    retiree:        { key: 'a_removed', cls: 'mode-off',  ordre: 6 },
    attente:        { key: 'a_wait',    cls: 'mode-off',  ordre: 5 }
  };
  var MODES = { rss: 'm_rss', 'rss-auto': 'm_rssauto', 'rss+page': 'm_rsspage', page: 'm_page', erreur: 'm_err', api: 'm_api' };
  function accesDe(s) { return s.acces || (s.mode === 'erreur' ? 'ko' : (s.erreur ? 'partielle' : 'ok')); }

  /* Les messages d'erreur de la collecte sont écrits en français : traduction des cas courants */
  var ERREURS_EN = [
    [/Page (\S+) inaccessible : /g, 'Page $1 unreachable: '],
    [/Flux (\S+) illisible : /g, 'Feed $1 unreadable: '],
    [/Aucun lien d'article détecté sur (\S+) \(page probablement chargée en JavaScript\)/g, 'No article link found on $1 (page probably loaded with JavaScript)'],
    [/interdit aux robots par le robots\.txt du site/g, "disallowed for robots by the site's robots.txt"],
    [/Statut « ([^»]+) » dans l'Excel : source non interrogée\./g, 'Status “$1” in the spreadsheet: source not queried.'],
    [/API Légifrance non configurée[^.]*\./g, 'Légifrance API not configured: add the LEGIFRANCE_CLIENT_ID and LEGIFRANCE_CLIENT_SECRET secrets in GitHub (see README).'],
    [/Authentification PISTE refusée/g, 'PISTE authentication refused'],
    [/Recherche « ([^»]+) »/g, 'Search “$1”']
  ];
  function traduireErreur(txt) {
    if (LANG !== 'en') return txt;
    ERREURS_EN.forEach(function (r) { txt = txt.replace(r[0], r[1]); });
    return txt;
  }

  function renderEtat() {
    var tbody = document.getElementById('etat-lignes');
    var src = (ETAT.sources || []).slice().sort(function (a, b) {
      return ((ACCES[accesDe(a)] || {}).ordre - (ACCES[accesDe(b)] || {}).ordre) ||
             nomZone(a.zone).localeCompare(nomZone(b.zone), LANG) || (a.nom || '').localeCompare(b.nom || '', LANG);
    });
    var compte = { ok: 0, partielle: 0, ko: 0, autre: 0 };
    src.forEach(function (s) {
      var a = accesDe(s), info = ACCES[a] || ACCES.ko, groupe = a in compte ? a : 'autre';
      compte[groupe]++;
      var details = [s.flux ? t('d_feed') + s.flux : '', s.page ? t('d_pages') + s.page : '', s.erreur ? '⚠ ' + traduireErreur(s.erreur) : ''].filter(Boolean).join(' · ');
      var inactif = a === 'inactive' || a === 'attente' || a === 'retiree';
      var action = a === 'retiree'
        ? el('button', { type: 'button', className: 'btn btn-sm', 'data-src-action': 'retablir', 'data-url': s.url, 'data-nom': s.nom, text: t('src_restore') })
        : el('button', { type: 'button', className: 'btn btn-sm btn-danger', 'data-src-action': 'retrait', 'data-url': s.url, 'data-nom': s.nom, text: t('src_remove') });
      tbody.appendChild(el('tr', { 'data-acces': groupe, 'data-texte': normaliser((s.nom || '') + ' ' + (s.zone || '') + ' ' + nomZone(s.zone)) }, [
        el('td', null, [el('span', { className: 'mode ' + info.cls, text: t(info.key) })]),
        el('td', null, [el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.nom || s.url }),
                        s.origine === 'site' ? el('span', { className: 'badge badge-sm badge-site', text: LANG === 'en' ? 'added on site' : 'ajoutée sur le site' }) : null]),
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
      stats.appendChild(el('div', { className: 'src-stat ' + x[2] }, [
        el('span', { className: 'src-stat-num', text: String(compte[x[0]]) }), el('span', { className: 'src-stat-lab', text: t(x[1]) })
      ]));
    });
    var filtre = document.getElementById('etat-filtres'), recherche = document.getElementById('etat-recherche');
    function filtrer() {
      var choix = (filtre.querySelector('input:checked') || {}).value || '';
      var q = normaliser(recherche.value).trim(), n = 0;
      Array.prototype.forEach.call(tbody.children, function (tr) {
        var ok = (!choix || tr.getAttribute('data-acces') === choix) && (!q || tr.getAttribute('data-texte').indexOf(q) !== -1);
        tr.hidden = !ok; if (ok) n++;
      });
      document.getElementById('etat-vide').hidden = n !== 0 || !src.length;
    }
    filtre.addEventListener('change', filtrer);
    recherche.addEventListener('input', filtrer);

    var tr = META.traduction, st = document.getElementById('trad-status');
    if (tr && tr.active) st.textContent = tr.moteur ? t('trad_ok')(tr.faites || 0, tr.en_attente || 0) : t('trad_off') + (tr.erreur || '');
    return compte;
  }

  /* ================================================================ acronymes détectés */

  function renderAcronymes() {
    var tbody = document.getElementById('acro-lignes'), liste = ACRO.acronymes || [];
    var nouveaux = 0, hors = 0;
    liste.forEach(function (e) {
      var nouveau = joursDepuis(e.premier_vu) <= 7, dans = e.dans_glossaire;
      if (nouveau) nouveaux++;
      if (!dans) hors++;
      var langues = (e.langues || []).map(function (l) { return (l || '').toUpperCase(); }).join(', ');
      tbody.appendChild(el('tr', { 'data-nouveau': nouveau ? '1' : '', 'data-hors': dans ? '' : '1',
                                    'data-texte': normaliser([e.code].concat(e.variantes || []).join(' ')) }, [
        el('td', null, [el('strong', { text: libelleAcro(e.code) }), nouveau ? el('span', { className: 'badge badge-new badge-sm', text: t('new_badge') }) : null]),
        el('td', { text: (e.variantes || []).join(', ') }),
        el('td', { className: 'num', text: String(e.nb_articles || 0) }),
        el('td', { text: langues }),
        el('td', { text: dateLongue(e.premier_vu) }),
        el('td', null, [el('span', { className: 'mode ' + (dans ? 'mode-ok' : 'mode-off'), text: dans ? t('ac_in') : t('ac_todo') })]),
        el('td', { className: 'remarque' }, [e.lien_exemple ? el('a', { href: e.lien_exemple, target: '_blank', rel: 'noopener noreferrer', text: e.exemple }) : e.exemple])
      ]));
    });
    document.getElementById('acro-resume').textContent = liste.length ? t('ac_summary')(liste.length, nouveaux, hors) : t('ac_none');
    var f = document.getElementById('acro-filtres'), r = document.getElementById('acro-recherche');
    function filtrer() {
      var choix = (f.querySelector('input:checked') || {}).value || '', q = normaliser(r.value).trim(), n = 0;
      Array.prototype.forEach.call(tbody.children, function (tr) {
        var ok = (!choix || (choix === 'nouveau' ? tr.getAttribute('data-nouveau') : tr.getAttribute('data-hors'))) &&
                 (!q || tr.getAttribute('data-texte').indexOf(q) !== -1);
        tr.hidden = !ok; if (ok) n++;
      });
      document.getElementById('acro-vide').hidden = n !== 0 || !liste.length;
    }
    f.addEventListener('change', filtrer); r.addEventListener('input', filtrer);
  }

  /* ================================================================ textes applicables */

  function renderReferentiel() {
    var tbody = document.getElementById('ref-lignes');
    var zs = document.getElementById('ref-zone'), cs = document.getElementById('ref-cat'), q = document.getElementById('ref-recherche');
    if (!REF_TEXTES.length) { document.getElementById('ref-resume').textContent = t('ref_none'); return; }
    var zones = {}; REF_TEXTES.forEach(function (r) { zones[r.zone] = 1; });
    zs.appendChild(el('option', { value: '', text: t('ref_all_zones') }));
    Object.keys(zones).sort(function (a, b) { return nomZone(a).localeCompare(nomZone(b), LANG); })
      .forEach(function (z) { zs.appendChild(el('option', { value: z, text: nomZone(z) })); });
    cs.appendChild(el('option', { value: '', text: t('ref_all_cats') }));
    Object.keys(REF.categories || {}).forEach(function (c) { cs.appendChild(el('option', { value: c, text: c + '. ' + nomCategorie(c) })); });
    var lignes = REF_TEXTES.slice().sort(function (a, b) {
      return nomZone(a.zone).localeCompare(nomZone(b.zone), LANG) || (a.categorie - b.categorie);
    }).map(function (r) {
      var x = refTexte(r);
      var tr = el('tr', { 'data-zone': r.zone, 'data-cat': String(r.categorie),
        'data-texte': normaliser([x.nom, r.nom, r.acronyme, r.autorite, x.resume, nomZone(r.zone)].join(' ')) }, [
        el('td', { text: nomZone(r.zone) }),
        el('td', { className: 'ref-cat', text: nomCategorie(r.categorie) }),
        el('td', null, [
          el('a', { href: r.lien, target: '_blank', rel: 'noopener noreferrer', className: 'ref-nom', text: x.nom }),
          r.acronyme ? el('span', { className: 'badge badge-sm badge-statut', text: r.acronyme }) : null,
          x.resume ? el('span', { className: 'ref-resume', text: x.resume }) : null,
          x.pourquoi ? el('span', { className: 'ref-why', text: '→ ' + x.pourquoi }) : null
        ]),
        el('td', { text: r.autorite || '—' }),
        el('td', { text: refDepuis(r.applicable_depuis) }),
        el('td', { className: 'remarque', text: r.amende_max || '—' }),
        el('td', null, [r.pertinence ? el('span', { className: 'badge badge-sm badge-p badge-p-' + r.pertinence, text: t('pert_badge')[r.pertinence] }) : null])
      ]);
      tr._r = r; tbody.appendChild(tr); return tr;
    });
    function filtrer() {
      var z = zs.value, c = cs.value, s2 = normaliser(q.value).trim(), n = 0;
      lignes.forEach(function (tr) {
        var ok = (!z || tr.getAttribute('data-zone') === z) && (!c || tr.getAttribute('data-cat') === c) && (!s2 || tr.getAttribute('data-texte').indexOf(s2) !== -1);
        tr.hidden = !ok; if (ok) n++;
      });
      document.getElementById('ref-vide').hidden = n !== 0;
    }
    zs.addEventListener('change', filtrer); cs.addEventListener('change', filtrer); q.addEventListener('input', filtrer);
    document.getElementById('ref-resume').textContent = t('ref_summary')(REF_TEXTES.length, Object.keys(zones).length);
    document.getElementById('ref-export').addEventListener('click', function () {
      var sel = lignes.filter(function (tr) { return !tr.hidden; }).map(function (tr) {
        var r = tr._r, x = refTexte(r);
        return [nomZone(r.zone), nomCategorie(r.categorie), x.nom, r.acronyme || '', r.autorite || '', r.applicable_depuis || '', r.amende_max || '',
                r.pertinence ? t('pert_badge')[r.pertinence] : '', x.resume || '', x.pourquoi || '', r.lien];
      });
      telechargerCsv([t('ref_csv_head')].concat(sel), 'cyberwatch_textes_applicables_');
    });
  }
  function telechargerCsv(lignes, prefixe) {
    function cell(v) { v = String(v === undefined || v === null ? '' : v).replace(/\r?\n/g, ' '); return /[";]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var csv = '\ufeff' + lignes.map(function (l) { return l.map(cell).join(';'); }).join('\r\n');
    var a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })),
                      download: prefixe + LANG + '_' + new Date().toISOString().slice(0, 10) + '.csv' });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ================================================================ carte */

  var RAMPE = ['#eef1f5', '#d6e3f0', '#a9c4e0', '#6f9ccb', '#3a6fa8', '#1f4e79'];
  var SEUILS = [0, 1, 3, 6, 11, 21];   // 0 | 1-2 | 3-5 | 6-10 | 11-20 | 21+
  function classe(n) { var i = 0; while (i + 1 < SEUILS.length && n >= SEUILS[i + 1]) i++; return i; }

  function renderCarte() {
    var grille = document.getElementById('tile-map'), cote = document.getElementById('map-side');
    var legende = document.getElementById('map-legend'), liste = document.getElementById('map-list');
    var bulle = document.getElementById('map-tooltip'), fiche = document.getElementById('map-fiche');
    var periode = '', choisi = null;

    legende.appendChild(el('span', { className: 'legend-lab', text: t('map_legend') }));
    ['0', '1–2', '3–5', '6–10', '11–20', '21+'].forEach(function (lab, i) {
      legende.appendChild(el('span', { className: 'legend-item' }, [el('span', { className: 'legend-sw', style: 'background:' + RAMPE[i] }), lab]));
    });

    function articlesZone(z) {
      return ARTICLES.filter(function (a) { return a.zone === z && (!periode || joursDepuis(a.date) <= +periode); });
    }
    var tuiles = {};
    Object.keys(ZONES).forEach(function (z) {
      var d = ZONES[z];
      var b = el('button', { type: 'button', className: 'tile' + (d.side ? ' tile-side' : ''), 'data-zone': z,
        style: d.side ? null : 'grid-column:' + d.x + ';grid-row:' + d.y }, [
        el('span', { className: 'tile-code', text: d.code }),
        el('span', { className: 'tile-name', text: d[LANG] }),
        el('span', { className: 'tile-num' })
      ]);
      b.addEventListener('click', function () { choisir(z); });
      b.addEventListener('mouseenter', function () { montrerBulle(b, z); });
      b.addEventListener('focus', function () { montrerBulle(b, z); });
      b.addEventListener('mouseleave', function () { bulle.hidden = true; });
      b.addEventListener('blur', function () { bulle.hidden = true; });
      (d.side ? cote : grille).appendChild(b);
      tuiles[z] = b;
    });

    function reglementations(z) {
      // « dernières réglementations » : hors rubrique « autres » et hors pertinence faible, du plus récent au plus ancien
      var arts = articlesZone(z).filter(function (a) { return a.rubrique !== 'autres' && a.pertinence !== 'faible'; });
      return arts.sort(function (x, y) { return x.date < y.date ? 1 : x.date > y.date ? -1 : (ORDRE_PERT[x.pertinence] || 0) - (ORDRE_PERT[y.pertinence] || 0); });
    }
    function montrerBulle(b, z) {
      var n = articlesZone(z).length, der = reglementations(z)[0];
      bulle.textContent = '';
      bulle.appendChild(el('strong', { text: nomZone(z) + ' — ' + n + (n > 1 ? t('articles') : ' article') }));
      if (der) bulle.appendChild(el('span', { className: 'tip-latest', text: t('map_latest') + textes(der).aff.titre + ' (' + dateLongue(der.date) + ')' }));
      var r = b.getBoundingClientRect(), p = document.getElementById('carte-section').getBoundingClientRect();
      bulle.style.left = (r.left - p.left + r.width / 2) + 'px';
      bulle.style.top = (r.top - p.top - 8) + 'px';
      bulle.hidden = false;
    }

    function peindre() {
      Object.keys(tuiles).forEach(function (z) {
        var n = articlesZone(z).length, c = classe(n), b = tuiles[z];
        b.style.background = RAMPE[c];
        b.classList.toggle('tile-dark', c >= 4);
        b.classList.toggle('tile-empty', n === 0);
        b.querySelector('.tile-num').textContent = n;
        b.setAttribute('aria-label', nomZone(z) + ' : ' + n);
        b.setAttribute('aria-pressed', choisi === z ? 'true' : 'false');
      });
      if (choisi) lister(choisi);
    }

    function ligneArticle(a, riche) {
      var tx = textes(a);
      var rub = (META.rubriques || []).filter(function (r) { return r.id === a.rubrique; })[0];
      var meta = [a.source, rub ? titreRubrique(rub) : ''];
      if (tx.traduit && !a.base) meta.push((tx.de || '').toUpperCase() + '→' + LANG.toUpperCase());
      var badges = el('span', { className: 'map-badges' });
      if (a.pertinence) badges.appendChild(el('span', { className: 'badge badge-sm badge-p badge-p-' + a.pertinence, text: t('pert_badge')[a.pertinence] }));
      if (a.statut && a.statut !== 'autre') badges.appendChild(el('span', { className: 'badge badge-sm badge-statut', text: libStatut(a.statut) }));
      var ba = badgeAmende(a); if (ba) { ba.classList.add('badge-sm'); badges.appendChild(ba); }
      return el('li', { className: riche ? 'map-top-item' : null }, [
        el('span', { className: 'map-date', text: dateLongue(a.date) }),
        el('a', { href: a.lien, target: '_blank', rel: 'noopener noreferrer', text: tx.aff.titre }),
        badges,
        riche && tx.aff.resume ? el('span', { className: 'map-resume', text: tx.aff.resume }) : null,
        el('span', { className: 'map-meta', text: meta.filter(Boolean).join(' · ') })
      ]);
    }
    function lister(z) {
      liste.textContent = ''; fiche.textContent = '';
      var arts = articlesZone(z).sort(function (x, y) { return x.date < y.date ? 1 : x.date > y.date ? -1 : 0; });
      var top = reglementations(z).slice(0, 5);
      fiche.hidden = false;
      fiche.appendChild(el('div', { className: 'map-list-head' }, [
        el('h3', { text: nomZone(z) + ' — ' + t('map_top') }),
        el('button', { type: 'button', className: 'btn', text: t('map_close'), 'data-fermer': true })
      ]));
      if (!top.length) fiche.appendChild(el('p', { className: 'map-hint', text: t('map_none') }));
      else { var ol = el('ol', { className: 'map-items map-top' }); top.forEach(function (a) { ol.appendChild(ligneArticle(a, true)); }); fiche.appendChild(ol); }
      var refs = REF_TEXTES.filter(function (r) { return r.zone === z; }).sort(function (a, b) { return a.categorie - b.categorie; });
      if (refs.length) {
        fiche.appendChild(el('h4', { className: 'map-ref-title', text: t('map_ref') + ' (' + refs.length + ')' }));
        var ulr = el('ul', { className: 'map-ref' });
        refs.forEach(function (r) {
          var x = refTexte(r);
          ulr.appendChild(el('li', null, [el('span', { className: 'map-ref-cat', text: nomCategorie(r.categorie) }),
            el('a', { href: r.lien, target: '_blank', rel: 'noopener noreferrer', text: x.nom + (r.acronyme && x.nom.indexOf(r.acronyme) === -1 ? ' (' + r.acronyme + ')' : '') })]));
        });
        fiche.appendChild(ulr);
      }
      liste.appendChild(el('div', { className: 'map-list-head' }, [
        el('h3', { text: t('map_all') + ' — ' + arts.length + (arts.length > 1 ? t('articles') : ' article') })
      ]));
      if (!arts.length) { liste.appendChild(el('p', { className: 'map-hint', text: t('map_none') })); return; }
      var ul = el('ul', { className: 'map-items' });
      arts.forEach(function (a) { ul.appendChild(ligneArticle(a, false)); });
      liste.appendChild(ul);
    }

    function choisir(z) {
      choisi = (choisi === z) ? null : z;
      if (!choisi) { liste.textContent = ''; fiche.textContent = ''; fiche.hidden = true; liste.appendChild(el('p', { className: 'map-hint', text: t('map_hint') })); }
      peindre();
      if (choisi) fiche.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    fiche.addEventListener('click', function (e) { if (e.target.closest('[data-fermer]')) choisir(choisi); });
    document.getElementById('map-periode').addEventListener('change', function (e) { periode = e.target.value; peindre(); });
    peindre();
  }

  /* ================================================================ construction */

  /* Chaque bloc est isolé : une donnée inattendue dans un bloc ne doit jamais
     empêcher le reste de la page (filtres, boutons) de fonctionner. */
  function sur(nom, fn, defaut) {
    try { return fn(); } catch (e) {
      if (window.console) console.error('[Cyber Watch] ' + nom, e);
      var z = document.getElementById('toast');
      if (z) { z.textContent = t('robust_err') + nom; z.hidden = false; setTimeout(function () { z.hidden = true; }, 5000); }
      return defaut;
    }
  }
  sur('textes', appliquerTextes);
  sur('en-tête', renderHeader);
  sur('rubriques', renderRubriques);
  var compteSources = sur('sources', renderEtat, { ok: 0, partielle: 0, ko: 0, autre: 0 });
  sur('acronymes', renderAcronymes);
  sur('carte', renderCarte);
  sur('textes applicables', renderReferentiel);

  var cards       = Array.prototype.slice.call(document.querySelectorAll('#rubriques .card'));
  var sections    = Array.prototype.slice.call(document.querySelectorAll('#rubriques .section[data-section]'));
  function subsections() { return Array.prototype.slice.call(document.querySelectorAll('#rubriques .subsection')); }
  cards.forEach(function (c) { c._box = c.parentNode; });
  sections.forEach(function (sec) { sec._subsDate = Array.prototype.slice.call(sec.querySelectorAll('.subsection')); });

  /* Tri : par date (groupes par mois), par pertinence ou par montant d'amende (liste unique) */
  function reordonner(tri) {
    sections.forEach(function (sec) {
      var mesCartes = cards.filter(function (c) { return c.closest('.section') === sec || (c._box && c._box.closest('.section') === sec); });
      Array.prototype.forEach.call(sec.querySelectorAll('.subsection'), function (sub) { sub.remove(); });
      if (tri === 'date' || sec.getAttribute('data-section') === 'syntheses') {
        sec._subsDate.forEach(function (sub) { sec.appendChild(sub); });
        mesCartes.forEach(function (c) { c._box.appendChild(c); });
        return;
      }
      var tries = mesCartes.slice().sort(function (x, y) {
        if (tri === 'amende') return (y._tri.montant - x._tri.montant) || (y._tri.date > x._tri.date ? 1 : -1);
        return (x._tri.pert - y._tri.pert) || (y._tri.score - x._tri.score) || (y._tri.date > x._tri.date ? 1 : x._tri.date > y._tri.date ? -1 : 0);
      });
      var box = el('div', { className: 'cards' });
      tries.forEach(function (c) { box.appendChild(c); });
      sec.appendChild(el('div', { className: 'subsection' }, [
        el('h3', { className: 'sub-title' }, [(tri === 'amende' ? t('sorted_fine') : t('sorted_pert')) + ' ', el('span', { className: 'badge-count', 'data-sub-count': true })]), box
      ]));
    });
  }
  var emptyState  = document.getElementById('empty-state');

  function chip(facet, value, label) {
    return el('label', { className: 'chip' }, [el('input', { type: 'checkbox', 'data-facet': facet, value: value }), el('span', { text: label })]);
  }
  function valeursUniques(attr) {
    var seen = {};
    cards.forEach(function (c) { (c.getAttribute(attr) || '').split('|').forEach(function (v) { v = v.trim(); if (v) seen[v] = 1; }); });
    return Object.keys(seen);
  }
  sur('facettes', function renderFacettes() {
    var rb = document.getElementById('rubrique-chips');
    navItems.forEach(function (n) { if (n.id) rb.appendChild(chip('section', n.id, n.num + ' — ' + n.titre)); });
    var zb = document.getElementById('zone-chips');
    valeursUniques('data-zone').filter(function (z) { return z !== '—'; })
      .sort(function (a, b) { return nomZone(a).localeCompare(nomZone(b), LANG); })
      .forEach(function (z) { zb.appendChild(chip('zone', z, nomZone(z))); });
    // Acronymes : ceux présents dans les articles (triés par fréquence) + ceux du glossaire
    var nbAcro = {};
    cards.forEach(function (c) { (c.getAttribute('data-acro') || '').split('|').forEach(function (v) { if (v) nbAcro[v] = (nbAcro[v] || 0) + 1; }); });
    Object.keys(GLOSSAIRE).forEach(function (k) { var code = GLOSSAIRE[k].en || k; if (!(code in nbAcro)) nbAcro[code] = 0; });
    var ab = document.getElementById('acro-chips');
    Object.keys(nbAcro).sort(function (a, b) { return (nbAcro[b] - nbAcro[a]) || libelleAcro(a).localeCompare(libelleAcro(b)); })
      .forEach(function (code) {
        var c = chip('acro', code, libelleAcro(code) + ' (' + nbAcro[code] + ')');
        var v = variantesAcro(code).filter(function (x) { return x !== libelleAcro(code); });
        if (v.length) c.title = t('ac_chip_title') + v.join(', ');
        if (!nbAcro[code]) c.classList.add('chip-zero');
        ab.appendChild(c);
      });
    var sb = document.getElementById('statut-chips'), statuts = valeursUniques('data-statut');
    ['adopte', 'en_vigueur', 'projet', 'consultation', 'lignes_directrices', 'sanction', 'autre'].forEach(function (st) {
      if (statuts.indexOf(st) !== -1) sb.appendChild(chip('statut', st, libStatut(st)));
    });
    if (!sb.children.length) sb.closest('.facet').hidden = true;
    var tb = document.getElementById('tag-chips');
    valeursUniques('data-tags').sort(function (a, b) { return libelleTag(a).localeCompare(libelleTag(b), LANG, { sensitivity: 'base' }); })
      .forEach(function (tg) { tb.appendChild(chip('tag', tg, libelleTag(tg))); });
  });

  sur('statistiques', function renderStats() {
    var semaine = ARTICLES.filter(function (a) { return !a.date_estimee && joursDepuis(a.date) <= 7; }).length;
    var zones = {}; ARTICLES.forEach(function (a) { if (a.zone) zones[a.zone] = 1; });
    var v = { total: ARTICLES.length, semaine: semaine, pays: Object.keys(zones).length,
              sources: (compteSources.ok + compteSources.partielle) + ' / ' + (compteSources.ok + compteSources.partielle + compteSources.ko) };
    Object.keys(v).forEach(function (k) { var n = document.querySelector('[data-stat="' + k + '"]'); if (n) n.textContent = v[k]; });
  });

  var facetInputs = Array.prototype.slice.call(document.querySelectorAll('[data-facet]'));
  var searchInput = document.getElementById('recherche');
  var resultCount = document.getElementById('result-count');
  var toastEl = document.getElementById('toast'), toastTimer = null;

  function toast(message) {
    toastEl.textContent = message; toastEl.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2200);
  }

  /* ------------------------------------------------------- versions de la veille */

  var versionChoisie = null, versionId = '', seulementNouveautes = false;
  sur('versions', function renderVersions() {
    var select = document.getElementById('version-select'), only = document.getElementById('version-only');
    var lienV = document.getElementById('version-link'), banner = document.getElementById('version-banner');
    var bar = select.closest('.version-bar');
    if (!VERSIONS.length) { bar.hidden = true; return; }
    for (var i = VERSIONS.length - 1; i >= 0; i--) {
      var v = VERSIONS[i];
      select.appendChild(el('option', { value: String(i + 1),
        text: t('version_opt')(horodatage(v.date), v.nb_nouveaux || 0) + (v.rattrapage ? t('version_rattrapage') : '') + (i === VERSIONS.length - 1 ? t('version_current') : '') }));
    }
    if (ARTICLES.some(function (a) { return a.base; })) select.appendChild(el('option', { value: '0', text: t('version_base') }));
    function maj() {
      var r = +select.value, courante = r === VERSIONS.length;
      versionChoisie = courante && !only.checked ? null : r;
      var v = VERSIONS[r - 1];
      versionId = r === 0 ? 'base' : (v ? v.id : '');
      seulementNouveautes = only.checked;
      if (META.depot && v) {
        lienV.href = (META.serveur || 'https://github.com') + '/' + META.depot + '/tree/veille-' + v.id;
        lienV.hidden = courante;
      } else lienV.hidden = true;
      if (r === 0) {
        banner.textContent = t('version_base_banner')(cards.filter(function (c) { return c._rang === 0; }).length);
        banner.hidden = false;
      } else if (!courante && v) {
        var total = cards.filter(function (c) { return c._rang !== undefined && c._rang <= r; }).length;
        banner.textContent = t('version_banner')(horodatage(v.date), v.nb_nouveaux || 0, total);
        banner.hidden = false;
      } else banner.hidden = true;
      applyFilters();
    }
    select.addEventListener('change', maj);
    only.addEventListener('change', maj);
  });

  /* ---------------------------------------------------------- panneau de filtres */

  var toggleFilters = document.getElementById('toggle-filters'), facetsBox = document.getElementById('facets');
  var activeCount = document.getElementById('active-count');
  function setFiltersOpen(open) { toggleFilters.setAttribute('aria-expanded', open ? 'true' : 'false'); facetsBox.hidden = !open; }
  toggleFilters.addEventListener('click', function () { setFiltersOpen(toggleFilters.getAttribute('aria-expanded') !== 'true'); });
  if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) setFiltersOpen(false);

  /* ------------------------------------------------------------------ accordéons */

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
    var bascule = event.target.closest ? event.target.closest('[data-bascule]') : null;
    if (bascule) { var c = bascule.closest('.card'); montrerTexte(c, !c._original); return; }
    var head = event.target.closest ? event.target.closest('.card-head') : null;
    if (!head) return;
    setExpanded(head.closest('.card'), head.getAttribute('aria-expanded') !== 'true');
  });
  document.getElementById('expand-all').addEventListener('click', function () {
    var visibles = cards.filter(function (c) { return !c.hidden; });
    if (visibles.length > 300) { toast(t('too_many')); return; }
    visibles.forEach(function (c) { setExpanded(c, true); });
  });
  document.getElementById('collapse-all').addEventListener('click', function () { cards.forEach(function (c) { setExpanded(c, false); }); });

  document.getElementById('voir-originaux').addEventListener('change', function (e) {
    voirOriginaux = e.target.checked;
    cards.forEach(function (c) { montrerTexte(c, voirOriginaux); });
  });

  /* ---------------------------------------------------------------------- filtres */

  function selectedValues(facet) {
    return facetInputs.filter(function (i) { return i.dataset.facet === facet && i.checked && i.value; }).map(function (i) { return i.value; });
  }
  function tagsOf(card) { var raw = card.getAttribute('data-tags') || ''; return raw ? raw.split('|') : []; }
  function texteCarte(card) {
    if (card._texte === undefined) {
      var r = registre[card.id] || {}, d = r.d || {}, tx = r.tx || {};
      var morceaux = [d.titre, d.resume, d.source, d.zone, nomZone(d.zone), (d.tags || []).map(libelleTag).join(' '), (d.tags || []).join(' ')];
      if (d.trad) Object.keys(d.trad).forEach(function (k) { morceaux.push(d.trad[k].titre, d.trad[k].resume); });
      if (tx.aff) morceaux.push(tx.aff.titre, tx.aff.resume);
      card._texte = normaliser(morceaux.join(' '));
    }
    return card._texte;
  }
  function matches(card, sel) {
    if (versionChoisie !== null) {
      if (card._rang === undefined) { if (seulementNouveautes) return false; }
      else {
        if (card._rang > versionChoisie) return false;
        if (seulementNouveautes && card._version !== versionId) return false;
      }
    }
    if (sel.section.length && sel.section.indexOf(card.getAttribute('data-section')) === -1) return false;
    if (sel.pert.length && sel.pert.indexOf(card.getAttribute('data-pert')) === -1) return false;
    if (sel.amende.length && sel.amende.indexOf(card.getAttribute('data-amende')) === -1) return false;
    if (sel.statut.length && sel.statut.indexOf(card.getAttribute('data-statut')) === -1) return false;
    if (sel.nature.length && sel.nature.indexOf(card.getAttribute('data-nature')) === -1) return false;
    if (sel.zone.length && sel.zone.indexOf(card.getAttribute('data-zone')) === -1) return false;
    if (sel.periode.length && joursDepuis(card.getAttribute('data-date')) > +sel.periode[0]) return false;
    var tags = tagsOf(card);
    for (var i = 0; i < sel.tag.length; i++) if (tags.indexOf(sel.tag[i]) === -1) return false;
    var acros = (card.getAttribute('data-acro') || '').split('|');
    for (var k = 0; k < sel.acro.length; k++) if (acros.indexOf(sel.acro[k]) === -1) return false;
    var tx = texteCarte(card);
    for (var j = 0; j < sel.q.length; j++) if (tx.indexOf(sel.q[j]) === -1) return false;
    return true;
  }
  function syncTagButtons(selectedTags) {
    Array.prototype.forEach.call(document.querySelectorAll('.tag[data-tag]'), function (btn) {
      btn.setAttribute('aria-pressed', selectedTags.indexOf(btn.getAttribute('data-tag')) !== -1 ? 'true' : 'false');
    });
  }
  function selectionCourante() {
    return { section: selectedValues('section'), nature: selectedValues('nature'), zone: selectedValues('zone'),
             pert: selectedValues('pert'), amende: selectedValues('amende'), statut: selectedValues('statut'),
             periode: selectedValues('periode'), tag: selectedValues('tag'), acro: selectedValues('acro'), q: normaliser(searchInput.value).split(/\s+/).filter(Boolean) };
  }
  function applyFilters() {
    var sel = selectionCourante(), visible = 0;
    cards.forEach(function (card) {
      var ok = matches(card, sel);
      card.hidden = !ok;
      if (ok) visible++; else if (card.querySelector('.card-body')) setExpanded(card, false);
    });
    subsections().forEach(function (sub) {
      var n = sub.querySelectorAll('.card:not([hidden])').length;
      sub.querySelector('[data-sub-count]').textContent = n; sub.hidden = (n === 0);
    });
    sections.forEach(function (sec) {
      var n = sec.querySelectorAll('.card:not([hidden])').length;
      sec.querySelector('[data-section-count]').textContent = n + (n > 1 ? t('shown_many') : t('shown_one'));
      sec.hidden = (n === 0);
    });
    emptyState.hidden = (visible !== 0 || cards.length === 0);
    resultCount.textContent = visible === cards.length ? cards.length + t('articles') : visible + ' / ' + cards.length + t('articles');
    syncTagButtons(sel.tag);
    var active = sel.section.length + sel.nature.length + sel.zone.length + sel.periode.length + sel.tag.length + sel.acro.length +
                 sel.pert.length + sel.amende.length + sel.statut.length + (sel.q.length ? 1 : 0);
    activeCount.textContent = active + (active > 1 ? t('filters_on_many') : t('filters_on_one'));
    activeCount.hidden = (active === 0);
  }
  facetInputs.forEach(function (input) { input.addEventListener('change', applyFilters); });
  document.getElementById('tri').addEventListener('change', function (e) { reordonner(e.target.value); applyFilters(); });
  var searchTimer = null;
  searchInput.addEventListener('input', function () { clearTimeout(searchTimer); searchTimer = setTimeout(applyFilters, 150); });
  document.getElementById('reset-filters').addEventListener('click', function () {
    facetInputs.forEach(function (i) { i.checked = (i.type === 'radio' && i.value === ''); });
    searchInput.value = ''; applyFilters();
  });
  document.addEventListener('click', function (event) {
    var btn = event.target.closest ? event.target.closest('.tag[data-tag]') : null;
    if (!btn) return;
    var value = btn.getAttribute('data-tag');
    var input = facetInputs.filter(function (i) { return i.dataset.facet === 'tag' && i.value === value; })[0];
    if (!input) return;
    input.checked = !input.checked; applyFilters();
    if (input.checked) document.querySelector('.panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  /* ---------------------------------------------------------------- exports */

  function ligneExport(c) {
    var titres = {}; navItems.forEach(function (n) { if (n.id) titres[n.id] = n.titre; });
    var r = registre[c.id], d = r.d, tx = r.tx;
    var aff = (tx.traduit && !c._original) ? tx.aff : { titre: d.titre, resume: d.resume || '' };
    return { date: d.date, rubriqueId: d.rubrique, rubrique: titres[d.rubrique] || d.rubrique, titre: aff.titre, resume: aff.resume,
             titreOrig: (tx.traduit && !d.base) ? d.titre : '', langue: d.langue ? (LANGUES[LANG][d.langue] || d.langue) : '',
             source: d.source, zoneId: d.zone, zone: nomZone(d.zone), nature: t((NATURES[d.nature] || NATURES.presse).key),
             pert: d.pertinence ? t('pert_badge')[d.pertinence] : '', statut: d.statut ? libStatut(d.statut) : '',
             amende: d.amende ? (d.amende.plafond ? t('fine_cap') : '') + d.amende.texte : '', montant: d.amende ? d.amende.montant_eur : '',
             pourquoi: d.nature === 'synthese' ? '' : pourquoiTexte(d),
             tags: (d.tags || []).map(libelleTag).join(', '), lien: d.lien, traduit: tx.traduit && !d.base };
  }
  function selectionExport() { return cards.filter(function (c) { return !c.hidden; }).map(ligneExport); }

  function csvCell(v) {
    v = String(v === undefined || v === null ? '' : v).replace(/\r?\n/g, ' ');
    return /[";]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  document.getElementById('export-csv').addEventListener('click', function () {
    var sel = selectionExport();
    if (!sel.length) { toast(t('nothing_export')); return; }
    var lignes = [t('csv_head')].concat(sel.map(function (x) {
      return [x.date, x.rubrique, x.pert, x.titre, x.titreOrig, x.langue, x.source, x.zone, x.nature, x.statut, x.amende, x.montant, x.pourquoi, x.tags, x.lien, x.resume];
    }));
    var csv = '﻿' + lignes.map(function (l) { return l.map(csvCell).join(';'); }).join('\r\n');
    var a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })),
                      download: 'cyberwatch_' + LANG + '_' + new Date().toISOString().slice(0, 10) + '.csv' });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast(sel.length + t('exported'));
  });

  /* PDF : rapport imprimable (« Enregistrer en PDF » du navigateur).
     - « Exporter la sélection » : les articles affichés (filtres appliqués) ;
     - « Générer la veille complète » : tous les articles, par rubrique puis par pays. */
  function itemPdf(x) {
    return el('div', { className: 'pr-item' }, [
      el('h4', { text: x.titre }),
      el('p', { className: 'pr-line', text: [dateLongue(x.date), x.source, x.zone, x.nature, x.pert, x.statut].filter(Boolean).join(' · ') +
        (x.traduit ? ' · ' + t('translated_from') + x.langue : '') }),
      x.amende ? el('p', { className: 'pr-fine', text: x.amende }) : null,
      x.titreOrig ? el('p', { className: 'pr-orig', text: x.titreOrig }) : null,
      x.resume ? el('p', { text: x.resume }) : null,
      x.pourquoi ? el('p', { className: 'pr-why', text: t('why') + ' : ' + x.pourquoi }) : null,
      el('p', { className: 'pr-link', text: x.lien })
    ]);
  }
  function imprimer(sel, titre, parZone) {
    var rep = document.getElementById('print-report');
    rep.textContent = '';
    rep.appendChild(el('h1', { text: titre }));
    rep.appendChild(el('p', { className: 'pr-meta', text: t('pdf_generated') + horodatage(new Date().toISOString()) + ' · ' + sel.length + t('pdf_count') +
      (META.mise_a_jour ? ' · ' + t('last_update') + horodatage(META.mise_a_jour) : '') }));
    var ordreRub = navItems.map(function (n) { return n.id; });
    var groupes = {};
    sel.forEach(function (x) { (groupes[x.rubriqueId] = groupes[x.rubriqueId] || []).push(x); });
    var ids = Object.keys(groupes).sort(function (a, b) { return ordreRub.indexOf(a) - ordreRub.indexOf(b); });
    if (parZone) {
      var toc = el('ol', { className: 'pr-toc' });
      ids.forEach(function (id) { toc.appendChild(el('li', { text: groupes[id][0].rubrique + ' — ' + groupes[id].length + t('pdf_count') })); });
      rep.appendChild(el('h2', { text: t('pdf_toc') })); rep.appendChild(toc);
    }
    ids.forEach(function (id) {
      var items = groupes[id];
      rep.appendChild(el('h2', { className: parZone ? 'pr-break' : null, text: items[0].rubrique + ' (' + items.length + ')' }));
      if (!parZone) { items.forEach(function (x) { rep.appendChild(itemPdf(x)); }); return; }
      var parZ = {};
      items.forEach(function (x) { (parZ[x.zone] = parZ[x.zone] || []).push(x); });
      Object.keys(parZ).sort(function (a, b) { return a.localeCompare(b, LANG); }).forEach(function (z) {
        rep.appendChild(el('h3', { text: z + ' (' + parZ[z].length + ')' }));
        parZ[z].sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (x) { rep.appendChild(itemPdf(x)); });
      });
    });
    if (parZone && REF_TEXTES.length) {
      rep.appendChild(el('h2', { className: 'pr-break', text: t('ref_pdf') + ' (' + REF_TEXTES.length + ')' }));
      var parZ2 = {};
      REF_TEXTES.forEach(function (r) { (parZ2[r.zone] = parZ2[r.zone] || []).push(r); });
      Object.keys(parZ2).sort(function (a, b) { return nomZone(a).localeCompare(nomZone(b), LANG); }).forEach(function (z) {
        rep.appendChild(el('h3', { text: nomZone(z) + ' (' + parZ2[z].length + ')' }));
        parZ2[z].sort(function (a, b) { return a.categorie - b.categorie; }).forEach(function (r) {
          var x = refTexte(r);
          rep.appendChild(el('div', { className: 'pr-item' }, [
            el('h4', { text: x.nom + (r.acronyme ? ' — ' + r.acronyme : '') }),
            el('p', { className: 'pr-line', text: [nomCategorie(r.categorie), r.autorite, refDepuis(r.applicable_depuis), r.pertinence ? t('pert_badge')[r.pertinence] : ''].filter(Boolean).join(' · ') }),
            r.amende_max ? el('p', { className: 'pr-fine', text: t('fine_cap') + r.amende_max }) : null,
            x.resume ? el('p', { text: x.resume }) : null,
            x.pourquoi ? el('p', { className: 'pr-why', text: t('why') + ' : ' + x.pourquoi }) : null,
            el('p', { className: 'pr-link', text: r.lien })
          ]));
        });
      });
    }
    document.body.classList.add('printing-report');
    setTimeout(function () { window.print(); }, 80);
  }
  document.getElementById('export-pdf').addEventListener('click', function () {
    var sel = selectionExport();
    if (!sel.length) { toast(t('nothing_export')); return; }
    imprimer(sel, t('pdf_title'), false);
  });
  document.getElementById('export-pdf-complet').addEventListener('click', function () {
    var tous = cards.filter(function (c) { return c._rang !== undefined; }).map(ligneExport);
    if (!tous.length) { toast(t('nothing_export')); return; }
    imprimer(tous, t('pdf_all_title'), true);
  });
  window.addEventListener('afterprint', function () { document.body.classList.remove('printing-report'); });

  /* ----------------------------------------------------------- copier pour Teams */

  function buildTeamsSummary(card) {
    var r = registre[card.id] || {}, d = r.d || {}, tx = r.tx || {};
    var aff = (tx.traduit && !card._original) ? tx.aff : { titre: d.titre, resume: d.resume };
    var lines = [aff.titre || '', ''];
    var badge = card.querySelector('.card-meta .badge:last-of-type');
    lines.push((card.querySelector('.card-date') || {}).textContent + (badge ? ' · ' + badge.textContent : ''));
    if (aff.resume) { lines.push(''); lines.push(aff.resume); }
    if (tx.traduit && !card._original) { lines.push(''); lines.push(t('translated_from') + LANGUES[LANG][tx.de]); }
    var paragraphs = Array.prototype.slice.call(card.querySelectorAll('.card-body > p:not(.trad-line)'));
    if (paragraphs.length) { lines.push(''); paragraphs.forEach(function (p) { lines.push('• ' + p.textContent.trim()); }); }
    var items = Array.prototype.slice.call(card.querySelectorAll('.sources li'));
    lines.push('');
    if (items.length) {
      lines.push(t('sources') + ' :');
      items.forEach(function (li) { var a = li.querySelector('a'); lines.push('- ' + (a ? a.textContent.trim() + ' — ' + a.getAttribute('href') : li.textContent.trim())); });
    } else if (d.lien) lines.push(t('source') + ' : ' + d.source + ' — ' + d.lien);
    if (d.tags && d.tags.length) { lines.push(''); lines.push(t('keywords') + ' : ' + d.tags.map(libelleTag).join(', ')); }
    return lines.join('\n');
  }
  function legacyCopy(text) {
    var ta = el('textarea', { readonly: true }); ta.value = text; ta.style.position = 'fixed'; ta.style.top = '-1000px';
    document.body.appendChild(ta); ta.select();
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta); return ok;
  }
  document.addEventListener('click', function (event) {
    var btn = event.target.closest ? event.target.closest('[data-copy]') : null;
    if (!btn) return;
    var text = buildTeamsSummary(btn.closest('.card'));
    var ok = function () { var o = btn.textContent; btn.textContent = t('copied'); btn.classList.add('done');
      setTimeout(function () { btn.textContent = o; btn.classList.remove('done'); }, 1800); toast(t('copy_ok')); };
    var ko = function () { toast(t('copy_ko')); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok).catch(function () { if (legacyCopy(text)) ok(); else ko(); });
    else if (legacyCopy(text)) ok(); else ko();
  });

  /* ------------------------------------------- ajout / retrait de sources (onglet Sources) */

  var modal = document.getElementById('modal');
  function demander(titre, corps, libelleOk, surOk, avecChamp) {
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
  function afficherMode() {
    document.getElementById('src-mode').textContent = !META.depot ? t('mode_none') : (lireJeton() ? t('mode_token') : t('mode_issue'));
  }
  function b64enc(txt) { var b = new TextEncoder().encode(txt), s2 = ''; b.forEach(function (x) { s2 += String.fromCharCode(x); }); return btoa(s2); }
  function b64dec(b64) { var bin = atob(b64.replace(/\s/g, '')), arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new TextDecoder().decode(arr); }

  /* Applique la demande au fichier config/sources_manuelles.json (même logique que collecte/sources_issue.py) */
  function appliquerDemande(manu, d) {
    manu.ajouts = manu.ajouts || []; manu.retraits = manu.retraits || [];
    var urlDe = function (r) { return typeof r === 'string' ? r : r.url; };
    var jour = new Date().toISOString().slice(0, 10);
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
      var corps = (LANG === 'en' ? 'Request made from the Cyber Watch site. Do not edit the block below.' : 'Demande faite depuis le site Cyber Watch. Ne modifiez pas le bloc ci-dessous.') +
        '\n\n```json\n' + JSON.stringify(d, null, 1) + '\n```\n';
      var titre = '[Source] ' + ({ ajout: 'Ajout', retrait: 'Retrait', retablir: 'Rétablissement' }[d.action]) + ' : ' + d.nom;
      window.open((META.serveur || 'https://github.com') + '/' + depot + '/issues/new?title=' + encodeURIComponent(titre) + '&body=' + encodeURIComponent(corps), '_blank', 'noopener');
      toast(t('opened_gh'));
      return;
    }
    var api = 'https://api.github.com/repos/' + depot + '/contents/config/sources_manuelles.json';
    var entetes = { Authorization: 'Bearer ' + jeton, Accept: 'application/vnd.github+json' };
    fetch(api + '?ref=' + encodeURIComponent(branche), { headers: entetes })
      .then(function (r) { if (r.status === 404) return null; if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (f) {
        var manu = f ? JSON.parse(b64dec(f.content)) : { ajouts: [], retraits: [] };
        appliquerDemande(manu, d);
        var corps = { message: 'Sources : ' + d.action + ' ' + d.nom + ' (depuis le site)', branch: branche,
                      content: b64enc(JSON.stringify(manu, null, 2) + '\n') };
        if (f) corps.sha = f.sha;
        return fetch(api, { method: 'PUT', headers: entetes, body: JSON.stringify(corps) });
      })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + (r.status === 401 || r.status === 403 ? ' (jeton refusé ou sans droit Contents: write)' : '')); toast(t('saved_ok')); marquerLigne(d); })
      .catch(function (e) { toast(t('saved_ko') + e.message); });
  }
  function marquerLigne(d) {
    var b = document.querySelector('[data-src-action][data-url="' + (window.CSS && CSS.escape ? CSS.escape(d.url) : d.url) + '"]');
    if (b) { b.disabled = true; b.textContent = '✓'; }
  }

  sur('gestion des sources', function gestionSources() {
    var form = document.getElementById('src-form'), err = document.getElementById('src-form-err');
    var zoneSel = document.getElementById('sf-zone');
    Object.keys(ZONES).sort(function (a, b) { return nomZone(a).localeCompare(nomZone(b), LANG); })
      .forEach(function (z) { zoneSel.appendChild(el('option', { value: z, text: nomZone(z) })); });
    zoneSel.value = 'France';
    afficherMode();
    document.getElementById('src-ajouter').addEventListener('click', function () { form.hidden = !form.hidden; if (!form.hidden) form.querySelector('input').focus(); });
    document.getElementById('src-form-cancel').addEventListener('click', function () { form.hidden = true; err.hidden = true; });
    function lignes(v) { return (v || '').split(/[\s,;]+/).filter(function (u) { return /^https?:\/\//.test(u); }); }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = form.elements;
      var d = { action: 'ajout', nom: f.nom.value.trim(), zone: f.zone.value, type: f.type.value, url: f.url.value.trim(),
                flux: lignes(f.flux.value), pages: lignes(f.pages.value) };
      if (!d.nom || !/^https?:\/\/[^\s.]+\.[^\s]+/.test(d.url)) { err.textContent = t('sf_err'); err.hidden = false; return; }
      err.hidden = true;
      demander(t('confirm_add_t'), [t('confirm_add')(d.nom, d.url), lireJeton() ? t('via_token') : t('via_issue')], t('confirm'), function () {
        envoyerDemande(d); form.reset(); zoneSel.value = 'France'; form.hidden = true;
      });
    });
    document.getElementById('etat-lignes').addEventListener('click', function (e) {
      var b = e.target.closest('[data-src-action]');
      if (!b) return;
      var d = { action: b.getAttribute('data-src-action'), url: b.getAttribute('data-url'), nom: b.getAttribute('data-nom') };
      var retrait = d.action === 'retrait';
      demander(retrait ? t('confirm_rm_t') : t('confirm_rs_t'), [retrait ? t('confirm_rm')(d.nom) : t('confirm_rs')(d.nom), lireJeton() ? t('via_token') : t('via_issue')],
        t('confirm'), function () { envoyerDemande(d); });
    });
    document.getElementById('src-jeton').addEventListener('click', function () {
      var champ = el('input', { type: 'password', className: 'search', autocomplete: 'off', placeholder: 'github_pat_…' });
      champ.value = lireJeton();
      demander(t('token_t'), [t('token_help'), champ], t('confirm'), function () {
        var v = champ.value.trim();
        try { if (v) localStorage.setItem('cw-gh-token', v); else localStorage.removeItem('cw-gh-token'); } catch (x) {}
        toast(v ? t('token_saved') : t('token_cleared')); afficherMode();
      });
    });
  });

  /* ---------------------------------------------------------- navigation / ancres */

  function suivreHash() {
    var onglet = ongletDepuisHash();
    afficherOnglet(onglet);
    if ((location.hash || '').slice(1) === onglet) {
      var nav = document.querySelector('.site-nav');
      if (window.scrollY > nav.offsetTop) window.scrollTo(0, nav.offsetTop);
    }
    var h = (location.hash || '').slice(1);
    var cible = h && ONGLETS.indexOf(h) === -1 && document.getElementById(h);
    if (cible && cible.classList.contains('card')) setExpanded(cible, true);
  }
  window.addEventListener('hashchange', suivreHash);

  applyFilters();
  suivreHash();
})();
