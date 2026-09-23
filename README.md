# Cyber Watch : veille automatique, gratuite, sans IA

Chaque matin, GitHub lance un script qui lit les sources de l'Excel, garde les
articles qui contiennent vos mots-clés, puis met le site à jour. Pas de clé API,
pas d'abonnement.

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
3. Le dossier `.github` est caché sur Mac et Windows : créez son fichier à la
   main. **Add file → Create new file**, nom exact
   `.github/workflows/veille.yml`, collez le contenu du fichier fourni,
   **Commit changes**.

### Étape 4 : activer GitHub Pages

1. **Settings → Pages**.
2. Dans **Build and deployment → Source**, choisissez **GitHub Actions**.

> Si votre dépôt publiait déjà un site avec Pages, c'est Cyber Watch qui le
> remplacera : un dépôt n'a qu'un seul site Pages.

### Étape 5 : autoriser l'écriture (si nécessaire)

**Settings → Actions → General → Workflow permissions** : cochez
**Read and write permissions**, puis **Save**. Si la case est grisée, c'est une
politique de votre organisation GitHub : demandez-la à son administrateur.

### Étape 6 : lancer la première collecte

1. Onglet **Actions**, puis **Cyber Watch - collecte** dans la liste de gauche.
2. Cliquez sur **Run workflow**, puis sur **Run workflow**.
3. Attendez 3 à 8 minutes que la pastille passe au vert.
4. L'adresse du site s'affiche dans le récapitulatif du run, et dans
   **Settings → Pages**. Elle a la forme `https://<compte>.github.io/<depot>/`.

Ensuite, la collecte tourne **tous les jours à 7 h** (heure de Paris en été,
6 h en hiver). Le bouton **« Lancer une mise à jour »** du site ouvre
directement la page GitHub où cliquer sur **Run workflow**. Il faut un compte
GitHub avec accès au dépôt pour déclencher une mise à jour ; la simple
consultation du site n'en demande pas.

---

## Utilisation au quotidien

**Ajouter ou corriger une source.** Modifiez l'Excel, puis remplacez
`config/sources.xlsx` dans le dépôt (**Add file → Upload files**,
même nom de fichier). Pour chaque source, la collecte essaie dans cet ordre :

1. les flux de **« lien flux RSS »** et **« Lien XML »** (plusieurs flux
   possibles dans une cellule, un par ligne) ;
2. la page de la colonne **« URL page actualités »** (colonne R) ;
3. à défaut, la page de la colonne **URL**.

La colonne **« Vérification »** (S) indique comment chaque lien a été
trouvé. Les lignes dont le statut commence par « Inactif » sont ignorées.

**Voir ce qui ne marche pas.** Tout en bas du site, la section **« Sources de
la veille »** indique pour chaque source (accessible, partielle, inaccessible, ignorée) :

- **Flux RSS (Excel)** ou **Flux RSS découvert** : c'est l'idéal.
- **Surveillance de page** : le script repère les nouveaux liens de la page.
  Ça fonctionne, mais les dates sont parfois manquantes.
- **Inaccessible**, ou « page chargée en JavaScript » : à corriger, en trouvant
  un flux RSS ou une autre page de la source.

**Ajuster le tri.** Ajoutez ou retirez des mots-clés dans l'onglet
**« Mots Clés »** de l'Excel. Les variantes en langues étrangères et les
réglages fins se trouvent dans `config/veille.json` :

- `groupes_non_suffisants` : les groupes trop génériques, qui ne suffisent pas
  seuls à retenir un article ;
- `rubriques` : les rubriques et les groupes de mots-clés qui les alimentent ;
- `jours_premiere_collecte` : l'antériorité reprise lors de la première visite
  d'une source (60 jours par défaut).

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
python collecte/collecte.py
```

Ouvrez ensuite `index.html` dans votre navigateur.

## Limites à connaître

- **Pas de résumé rédigé ni de niveau de confiance** : c'est le prix de la
  gratuité. Le résumé affiché est celui fourni par la source. Le badge indique
  la **nature** de la source (officielle, cabinet, presse), pas un niveau de
  confiance.
- **Sites en JavaScript** : certains sites chargent leurs listes en
  JavaScript. Sans flux RSS, le script ne les voit pas ; ils ont été retirés
  ou remplacés (ICO, Datatilsynet, pages NCSC-NL…).
- **Sources non anglophones** : le tri repose sur les mots-clés. Les sigles
  (NIS2, CRA, DORA, GDPR…) marchent dans toutes les langues ; les termes
  courants ont des variantes dans `config/veille.json`, à enrichir si besoin.
- **Robots bloqués** : quelques sites refusent les robots ou les serveurs
  GitHub. Ils apparaîtront « Inaccessibles ».
- **Inactivité du dépôt** : GitHub suspend les tâches planifiées d'un dépôt
  public sans activité depuis 60 jours. Les enregistrements quotidiens du
  script comptent normalement comme activité. Si la collecte s'arrête, un clic
  sur **Run workflow** la relance.
