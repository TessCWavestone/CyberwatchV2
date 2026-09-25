# Cyber Watch : veille réglementaire automatique et gratuite

Chaque lundi à 7 h (et à la demande), GitHub lance un script qui lit toutes les
sources, **garde tous les articles**, leur donne une note de pertinence avec un
petit modèle d'IA open source et gratuit, détecte les montants d'amendes, traduit
en français et en anglais, puis met le site à jour. Pas de clé API, pas
d'abonnement, rien à payer.

## Contenu du dossier

| Fichier | Rôle | Qui le modifie |
|---|---|---|
| `index.html`, `style.css`, `script.js` | Le site (même design qu'avant) | Personne, sauf pour changer le design |
| `config/sources.xlsx` | Votre Excel. La collecte lit les onglets **« Sources Cyberwatch alimentées »** et **« Mots Clés »** | **Vous** |
| `config/veille.json` | Titre, rubriques, mots-clés multilingues, réglages | Vous, de temps en temps |
| `collecte/collecte.py` | Le script de collecte | Personne |
| `data/actualites.js` / `.json` | Les articles collectés | Le script, automatiquement |
| `data/etat_sources.js` / `.json` | Le diagnostic de chaque source | Le script, automatiquement |
| `data/vus.json` | La mémoire des liens déjà vus | Le script, automatiquement |
| `data/syntheses.js` | Les 32 analyses rédigées du site d'origine, plus le glossaire | Vous ou Claude, à la main. **Jamais écrasé** |
| `.github/workflows/veille.yml` | L'automatisation GitHub | Personne |
| `collecte/traduction.py` | La traduction automatique (FR / EN) | Personne |
| `config/acronymes.json` | Glossaire des acronymes pour la traduction (ΓΚΠΔ → GDPR…) | Vous, si besoin |
| `data/syntheses_en.js`, `data/traductions.json` | Traductions générées automatiquement | Le script |
| `requirements-traduction.txt` | Moteur de traduction installé par GitHub | Personne |
| `config/base_connaissance.json` | Base de connaissance initiale : 166 réglementations et actualités depuis le 1er janvier 2026, sources vérifiées | Vous, à la main si besoin. **Jamais écrasé** |
| `config/profil_pertinence.json` | Thèmes d'intérêt du client, utilisés pour noter la pertinence | Vous, pour élargir ou affiner |
| `config/sources_manuelles.json` | Sources ajoutées ou retirées depuis le site | Le site (ou vous) |
| `collecte/pertinence.py`, `collecte/amendes.py` | Note de pertinence, détection des amendes | Personne |
| `collecte/sources_issue.py`, `.github/workflows/sources.yml` | Applique les demandes d'ajout / retrait de source faites sans jeton | Personne |
| `requirements-pertinence.txt` | Modèle de pertinence installé par GitHub | Personne |
| `data/versions.js` / `.json` | Historique des collectes (une version par collecte) | Le script |
| `collecte/echeances.py` | Repère les dates clés citées dans les textes (onglet « L'essentiel ») | Personne |
| `collecte/rkc.py` | Lit les veilles RKC (mails et Word) déposées dans un dépôt privé | Personne |
| `data/debats.js` / `.json` | Avis d'experts (onglet « Débats et signaux », non certifié), stockés à part | Le script |
| `data/monde.js` | Fond de carte (contours des pays, données libres Natural Earth), téléchargé une fois | Le script |
| `config/referentiel.json` | Textes applicables par pays (grille de 10 catégories), affichés dans l'onglet « Textes applicables » | Vous, à la main si besoin. **Jamais écrasé** |

---

## Mise en route (environ 15 minutes, directement sur github.com)

> Prérequis. Si votre dépôt est **privé** avec un compte GitHub gratuit,
> GitHub Pages n'est pas disponible. Soit vous passez le dépôt en public (le
> contenu n'est que de la réglementation publique, et l'Excel fourni ne
> contient ni nom de personne ni nom de client), soit vous utilisez un compte
> ou une organisation payante. La collecte
> fonctionne dans tous les cas : voir « Sans GitHub Pages » plus bas.

### Étape 1 : créer le dépôt

Sur github.com : **+** (en haut à droite) → **New repository** → nom
(ex. `cyberwatch-v2`) → **Create repository**.

### Étape 2 : déposer tous les fichiers

1. Sur la page du dépôt vide, cliquez sur **uploading an existing file**.
2. Glissez-déposez **le contenu** du dossier `cyberwatch` : `index.html`,
   `style.css`, `script.js`, `requirements.txt`, `README.md` et les dossiers
   `config`, `collecte` et `data`, puis **Commit changes**.
3. Le dossier `.github` est caché sur Mac et Windows : créez ses deux fichiers
   à la main. **Add file → Create new file**, nom exact
   `.github/workflows/veille.yml`, collez le contenu du fichier fourni,
   **Commit changes**. Recommencez avec `.github/workflows/sources.yml`.

### Étape 3 : activer GitHub Pages

1. **Settings → Pages**.
2. Dans **Build and deployment → Source**, choisissez **GitHub Actions**.

> Si votre dépôt publiait déjà un site avec Pages, c'est Cyber Watch qui le
> remplacera : un dépôt n'a qu'un seul site Pages.

### Étape 4 : autoriser l'écriture (si nécessaire)

**Settings → Actions → General → Workflow permissions** : cochez
**Read and write permissions**, puis **Save**. Si la case est grisée, c'est une
politique de votre organisation GitHub : demandez-la à son administrateur.

### Étape 5 : lancer la première collecte

1. Onglet **Actions**, puis **Cyber Watch - collecte** dans la liste de gauche.
2. Cliquez sur **Run workflow**, puis sur **Run workflow**.
3. Attendez 3 à 8 minutes que la pastille passe au vert.
4. L'adresse du site s'affiche dans le récapitulatif du run, et dans
   **Settings → Pages**. Elle a la forme `https://<compte>.github.io/<depot>/`.

Ensuite, la collecte tourne **chaque lundi à 7 h, heure de Paris** (été comme
hiver). Le bouton **« Lancer une mise à jour »** du site ouvre
directement la page GitHub où cliquer sur **Run workflow**. Il faut un compte
GitHub avec accès au dépôt pour déclencher une mise à jour ; la simple
consultation du site n'en demande pas.

### Étape 6 : constituer la base depuis le 1er janvier 2026 (une seule fois)

1. **Actions → Cyber Watch - collecte → Run workflow**.
2. Dans le champ **« Rattrapage des archives depuis cette date »**, tapez
   `2026-01-01`, puis **Run workflow**. Comptez 20 à 60 minutes.

Le script parcourt alors les pages d'archives (page 2, 3…) et les flux de chaque
source jusqu'au 1er janvier 2026. La base de connaissance
(`config/base_connaissance.json`, 166 éléments vérifiés) est ajoutée
automatiquement à chaque collecte. Ensuite, laissez ce champ vide : chaque
collecte s'ajoute à la base existante.

### Étape 7 : brancher la veille RKC (facultatif, 10 minutes)

Le site est public : les fichiers RKC (articles payants, veille interne
Wavestone) ne doivent **jamais** être déposés dans ce dépôt. On les range dans
un second dépôt **privé**, que la collecte lit sans jamais publier son contenu.
Le site n'affiche que le titre, le lien, la date, la note et les thèmes.

1. **Créer le dépôt privé** : **+ → New repository**, nom `cyberwatch-rkc`,
   cochez **Private**, **Create repository**.
2. **Y déposer chaque semaine** (Add file → Upload files, sous-dossiers libres) :
   - le mail RKC : dans Outlook, ouvrez le mail → **Fichier → Enregistrer
     sous** → format **Message Outlook (.msg)** (ou glissez le mail sur le
     bureau : un .msg est créé) ;
   - le fichier Word « Veille AAAA-MM-JJ.docx » (texte des articles payants).
     Chaque article commence par son titre, en style **Titre** ou entièrement
     en **gras**, suivi de son texte. Mettez la date dans le nom du fichier.
3. **Créer un jeton de lecture** : photo de profil → **Settings → Developer
   settings → Personal access tokens → Fine-grained tokens → Generate new
   token**. *Repository access* : **Only select repositories** →
   `cyberwatch-rkc` ; *Permissions → Contents* : **Read-only**. Durée maximale
   1 an : notez la date pour le renouveler.
4. **Le donner au dépôt du site** : dépôt de la veille → **Settings → Secrets
   and variables → Actions** :
   - onglet *Secrets* → `RKC_TOKEN` = le jeton ;
   - onglet *Variables* → `RKC_DEPOT` = `votre-compte/cyberwatch-rkc`.
5. La prochaine collecte lit les fichiers. L'onglet **Sources** affiche une
   ligne « Veille RKC — dépôt privé » avec le nombre d'articles lus.

Les liens des articles gratuits cités dans les mails sont repris tels quels
(les liens Outlook « safelinks » sont nettoyés). Le script ne recherche pas
les articles sur internet : si un lien est protégé, un humain qui clique y
accède normalement.

### Étape 8 : ajout de sources depuis le site (facultatif)

Dans **Issues → Labels → New label**, créez l'étiquette `approuvé`. Elle sert à
valider les propositions de source faites par des personnes qui ne sont pas
collaboratrices du dépôt (voir « Ajouter ou retirer une source » plus bas).

---

## Le site : onglets, langues, exports

- **L'essentiel** (page d'accueil) : « À la une » (les 5 informations les plus
  importantes) et « Dates clés » (frise des échéances à venir). Tout est
  calculé par des règles fixes, sans IA payante : pertinence, échéance proche
  (dates repérées automatiquement dans les textes, dans toutes les langues),
  statut du texte, source officielle, amende, fraîcheur. Les dates « vers »
  sont approximatives (mois seulement).
- **Veille** : « Nouveautés » (30 derniers jours, 60 s'il y a peu d'articles)
  et « Archives » (tout le reste depuis le 1er janvier 2026). Un seul bouton
  « Affiner » ouvre les filtres ; le filtre « Thèmes » réunit acronymes et
  mots-clés sans doublon (RGPD = GDPR).
- **Débats et signaux (non certifié)** : avis d'experts, positions,
  analyses prospectives, uniquement issus des sources dont le type est
  « Avis d'experts (non certifié) » dans l'Excel. Stockés à part
  (`data/debats.js`), ils n'apparaissent **jamais** dans la veille, la carte,
  L'essentiel ou les textes applicables. Les « tendances » sont de simples
  comptages de sujets (60 jours précédents → 60 derniers jours), sans
  interprétation. Limites : pas de « ressenti » calculé ; les meilleures
  sources d'analyse (Politico Pro, MLex, Contexte, LinkedIn) sont payantes ou
  fermées aux robots.
- **Carte** : vraie carte de l'Europe (et vue Monde). Le fond de carte (données
  libres Natural Earth) est téléchargé lors de la première collecte sur GitHub
  puis gardé dans `data/monde.js` ; en attendant, une carte simplifiée
  s'affiche.
- **Onglets** : *Veille* (articles et filtres), *Carte* (couleur = nombre
  d'articles ; le survol affiche la dernière réglementation ; un clic ouvre la
  fiche du pays avec ses 5 dernières réglementations, leur statut, leur amende
  et leur pertinence, puis tous ses articles), *Sources* (accessibilité de
  chaque source, ajout / retrait de sources, acronymes, méthode).
- **Textes applicables** : onglet listant, pour chaque pays, le socle des
  textes et référentiels en vigueur (même sans actualité récente), classés en
  10 catégories, dont **les exigences des acheteurs de santé** (ex. référentiels
  du service national de santé) et **la sécurité exigée des fournisseurs du
  secteur public et du cloud**. Filtre par pays et catégorie, export Excel ;
  repris dans la fiche pays de la carte et en annexe du PDF complet.
- **Rien n'est écarté** : chaque article porte une pertinence (élevée,
  moyenne, faible) et un encadré « Pourquoi cet article est là » : thèmes
  proches (d'après le sens du texte) et mots-clés présents. Les mots-clés
  justifient la présence d'un article ; ils ne décident plus seuls. Filtre
  « Pertinence » et tri « Pertinence » dans l'onglet Veille.
- **Amendes** : les montants cités (5 M€, £14.47m, 6 MSEK, 50 millió Ft…)
  sont détectés dans toutes les langues et convertis en euros (estimation).
  « Amende maximale prévue » = plafond fixé par un texte (« jusqu'à 10 M€ »).
  Filtre « Amendes » et tri « Montant d'amende ».
- **Versions** : sous les boutons d'export, le sélecteur « Version de la
  veille » affiche la veille telle qu'elle était après une collecte donnée, ou
  seulement ce que cette collecte a ajouté. Chaque version est aussi marquée
  sur GitHub (étiquette `veille-AAAA-MM-JJ-HHMM`, lien « Voir cette version
  sur GitHub »).
- **FR / EN** : le bouton en haut à droite bascule tout le site. Le lien
  `…/?lang=en` ouvre directement la version anglaise.
- **Traduction des articles** : titres et résumés sont traduits automatiquement
  à chaque collecte par **Argos Translate**, un moteur libre et gratuit qui
  tourne sur GitHub (aucune clé API, aucun coût). Chaque article traduit porte
  un badge (ex. `EL→EN`) et un lien « Voir le texte d'origine » ; la case
  « Afficher les textes d'origine » bascule tous les articles d'un coup.
- **Acronymes** : ils ne sont jamais traduits. Les équivalents nationaux d'un
  même texte européen sont harmonisés selon `config/acronymes.json`
  (ΓΚΠΔ, DSGVO, RODO → GDPR en anglais, RGPD en français) ; l'original reste
  entre parenthèses s'il est dans un autre alphabet : « GDPR (ΓΚΠΔ) ».
- **Nouveaux acronymes** : ils sont repérés et protégés automatiquement, sans
  rien faire. L'onglet *Sources → Acronymes détectés* les liste tous, avec leur
  date de première apparition. Seules les **équivalences** (ex. ΓΚΠΔ = GDPR) se
  règlent à la main dans `config/acronymes.json` ; une machine ne peut pas les
  deviner de façon fiable.
- **Filtre Acronyme** : dans l'onglet Veille, chaque acronyme regroupe ses
  variantes nationales (cocher « RGPD » trouve aussi GDPR, ΓΚΠΔ, DSGVO, RODO).
- **Première collecte après la mise à jour** : GitHub télécharge une fois les
  modèles de langue (quelques minutes de plus), puis les garde en cache. Au
  plus 2 500 textes sont traduits par collecte : s'il y en a davantage (après
  le rattrapage, par exemple), la suite est traduite à la collecte suivante.
  Relancez « Run workflow » pour accélérer.
- **Exports** : *Exporter la sélection (Excel)* télécharge les articles
  filtrés en CSV (avec pertinence, statut, amende et justification) ;
  *Exporter la sélection (PDF)* imprime les articles filtrés ;
  *Générer la veille complète (PDF)* imprime **tous** les articles, avec un
  sommaire, par rubrique puis par pays. Dans la fenêtre d'impression, choisissez
  « Enregistrer au format PDF ».
- **Résumés** : aucun résumé n'est rédigé par une IA. Le texte affiché est
  celui publié par la source (chapeau du flux RSS ou de la page).

## Utilisation au quotidien

**Ajouter ou retirer une source depuis le site.** Onglet **Sources** :
« + Ajouter une source » (formulaire), ou « Retirer » / « Rétablir » sur une
ligne du tableau. Une fenêtre de confirmation s'affiche toujours. La
modification est enregistrée dans `config/sources_manuelles.json` et prise en
compte **à la collecte suivante**. Deux modes :

- **Avec jeton (direct)** : bouton « Jeton GitHub ». Créez un jeton gratuit sur
  github.com → photo de profil → **Settings → Developer settings → Personal
  access tokens → Fine-grained tokens → Generate new token** : *Repository
  access* = ce dépôt seulement ; *Permissions → Contents* = **Read and
  write**. Collez-le dans le site : il reste dans votre navigateur uniquement.
  Il faut être collaborateur du dépôt.
- **Sans jeton** : le site ouvre GitHub avec une demande pré-remplie (issue) ;
  cliquez sur « Submit new issue ». Si vous êtes collaborateur, elle est
  appliquée automatiquement en une minute. Sinon, un collaborateur la valide en
  lui ajoutant l'étiquette `approuvé`. Un compte GitHub suffit pour proposer.

Pour donner l'accès à un collègue : **Settings → Collaborators → Add people**
(gratuit).

**Ajouter ou corriger une source dans l'Excel.** Modifiez l'Excel, puis remplacez
`config/sources.xlsx` dans le dépôt (**Add file → Upload files**,
même nom de fichier). Pour chaque source, la collecte essaie dans cet ordre :

1. les flux de **« lien flux RSS »** et **« Lien XML »** (plusieurs flux
   possibles dans une cellule, un par ligne) ;
2. la page de la colonne **« URL page actualités »** (colonne R) ;
3. à défaut, la page de la colonne **URL**.

La colonne **« Vérification »** (S) indique comment chaque lien a été
trouvé. La colonne **« Filtrage »** (T) : laissez-la vide pour tout garder ;
mettez `pertinence` pour une source très volumineuse (journal officiel,
ministère généraliste) : seuls ses textes de pertinence moyenne ou élevée sont
gardés. Les sources au statut « Actif - à confirmer » sont bloquées pour
l'outil de vérification mais peuvent l'être ou non pour le serveur GitHub :
l'onglet Sources du site dit, après la collecte, si elles ont été lues. Les lignes dont le statut commence par « Inactif » sont ignorées.

**Voir ce qui ne marche pas.** L'onglet **« Sources »** indique pour chaque source (accessible, partielle, inaccessible, ignorée) :

- **Flux RSS (Excel)** ou **Flux RSS découvert** : c'est l'idéal.
- **Surveillance de page** : le script repère les nouveaux liens de la page.
  Ça fonctionne, mais les dates sont parfois manquantes.
- **Inaccessible**, ou « page chargée en JavaScript » : à corriger, en trouvant
  un flux RSS ou une autre page de la source.

**Ajuster la pertinence.** Aucun article n'est jamais supprimé ; seule sa
note change. Deux leviers :

- `config/profil_pertinence.json` : les **thèmes** qui intéressent le client,
  décrits en phrases simples (NIS2, CRA, RGPD, données de santé, DM et DIV,
  AI Act, Data Act, entités critiques, pharma, normes, réglementation large,
  menaces). Le modèle compare le **sens** de chaque article à ces phrases, dans
  toutes les langues. Ajoutez une phrase ou un thème pour élargir ; les
  `seuils` règlent la frontière élevée / moyenne / faible.
- L'onglet **« Mots Clés »** de l'Excel : un mot-clé présent donne un petit
  bonus et apparaît dans « Pourquoi cet article est là ». Les variantes en
  langues étrangères sont dans `config/veille.json`.

Autres réglages de `config/veille.json` : `rubriques`, `jours_premiere_collecte`
(antériorité reprise à la première visite d'une source, 60 jours),
`jours_conservation` (730 jours), `rattrapage_pages_max` (pages d'archives
lues par source lors d'un rattrapage).

Si le modèle de pertinence n'a pas pu s'installer, la note est calculée avec
les mots-clés (mode dégradé) ; l'onglet Sources le signale.

**Compléter la base de connaissance.** `config/base_connaissance.json` se
modifie à la main (ou avec l'aide de Claude) : un élément par réglementation,
avec titre et résumé en français et en anglais, date, pays, lien, statut,
amende et justification.

**Exporter.** Le bouton **« Exporter la sélection (Excel) »** télécharge un
fichier CSV des articles actuellement filtrés, qui s'ouvre directement dans
Excel.

**Ajouter des analyses rédigées.** Le fichier `data/syntheses.js` n'est jamais
modifié par la collecte. Vous pouvez y ajouter des fiches, à la main ou en
demandant à Claude de rédiger une synthèse à partir d'un export.

**Réutiliser l'outil pour une autre veille ou un autre client.** Changez
l'Excel (sources et mots-clés) et le titre et les rubriques dans
`config/veille.json`. Rien d'autre à modifier.

## Brancher l'API Légifrance (Journal officiel)

La ligne « Légifrance » de l'Excel est collectée par l'**API officielle** de
PISTE plutôt que par la page web. Vos identifiants ne sont **jamais** écrits
dans les fichiers ni envoyés dans une conversation : ils sont rangés dans les
secrets chiffrés de GitHub.

1. **Abonner l'application à l'API Légifrance** (étape manquante jusqu'ici).
   Sur piste.gouv.fr, ouvrez votre application, puis **Modifier l'application**
   → onglet des API / **Consentement CGU API** : cochez **Légifrance**, acceptez
   les CGU, enregistrez. La fiche doit afficher Légifrance dans « Subscribed APIs ».
   Si le catalogue d'API renvoie une erreur 403, essayez depuis un autre
   réseau (partage 4G par exemple) : certains réseaux d'entreprise le bloquent.
2. **Noter l'environnement** : une application « SANDBOX » ne fonctionne qu'en
   bac à sable (données de test) ; pour les vrais textes du JO, créez la même
   application en **Production** et abonnez-la aussi à Légifrance.
3. **Ranger les identifiants dans GitHub** : dépôt → **Settings → Secrets and
   variables → Actions** :
   - onglet *Secrets* → **New repository secret** : `LEGIFRANCE_CLIENT_ID`
     (le Client ID OAuth), puis `LEGIFRANCE_CLIENT_SECRET` (le secret OAuth) ;
   - onglet *Variables* → **New repository variable** : `LEGIFRANCE_ENV` =
     `sandbox` ou `production`.
4. **Relancer la collecte** (Actions → Run workflow). La ligne Légifrance de
   « Sources de la veille » indique « API officielle » si tout va bien, sinon le
   message d'erreur exact (authentification refusée, API non abonnée…).

Les mots-clés recherchés dans le JO se règlent dans `config/veille.json`,
rubrique `legifrance` (par défaut sur les 30 derniers jours).

## Règles de qualité des sources

- Les pages de la colonne R doivent être des **listes d'articles datés**
  (pas des pages thématiques).
- Chaque flux RSS a été vérifié le 23/09/2026 : lecture du flux, puis ouverture
  d'un article. Le détail figure en colonne S.
- La collecte **respecte le fichier robots.txt** des sites : une page ou un
  flux interdit aux robots est ignoré et signalé dans la section « Sources de la veille ».

## Sans GitHub Pages

Le site fonctionne aussi hors ligne. Téléchargez le dépôt
(**Code → Download ZIP**), décompressez-la, puis double-cliquez sur
`index.html`. Vous pouvez aussi déposer le dossier dans SharePoint ou Teams
pour que l'équipe le télécharge.

## Tester sur votre ordinateur (optionnel)

```bash
pip install -r requirements.txt
pip install -r requirements-pertinence.txt   # facultatif : note de pertinence
python collecte/collecte.py
# rattrapage : RATTRAPAGE_DEPUIS=2026-01-01 python collecte/collecte.py
```

Ouvrez ensuite `index.html` dans votre navigateur.

## Limites à connaître

- **Pas de résumé rédigé par une IA** pour les articles collectés : le résumé
  affiché est celui fourni par la source. La pertinence est une estimation
  automatique : un article « faible » peut malgré tout vous intéresser, d'où le
  choix de tout garder.
- **Amendes** : la détection repose sur des motifs de texte ; un montant peut
  manquer si l'article ne le cite pas dans son titre ou son résumé. Les
  conversions en euros sont approximatives.
- **Rattrapage** : il dépend des archives de chaque site. Certains n'affichent
  que leurs derniers articles ; la base de connaissance comble ces trous.
- **Sites en JavaScript** : certains sites chargent leurs listes en
  JavaScript. Sans flux RSS, le script ne les voit pas ; ils ont été retirés
  ou remplacés (ICO, Datatilsynet, pages NCSC-NL…).
- **Robots bloqués** : quelques sites refusent les robots ou les serveurs
  GitHub. Ils apparaîtront « Inaccessibles ».
- **Inactivité du dépôt** : GitHub suspend les tâches planifiées d'un dépôt
  public sans activité depuis 60 jours. Les enregistrements hebdomadaires du
  script comptent normalement comme activité. Si la collecte s'arrête, un clic
  sur **Run workflow** la relance.
