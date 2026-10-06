# Relais « Lancer une mise à jour » (facultatif)

**À configurer une fois le dépôt installé à son emplacement définitif.** Sans relais, le
site fonctionne normalement : le bouton « Lancer une mise à jour » ouvre GitHub (compte
GitHub avec droits sur le dépôt nécessaire) et le bandeau « Collecte en cours » s'affiche
quand même.

Avec le relais, **n'importe quel utilisateur du site** peut lancer une collecte, sans compte
GitHub. Le relais garde le jeton GitHub secret, refuse de lancer une collecte si une autre
est en cours, et limite les lancements (1 par heure, 3 par jour par défaut).

Coût : gratuit (offre gratuite Cloudflare Workers : 100 000 appels par jour).

## Mise en place (environ 30 minutes)

1. **Jeton GitHub** — GitHub › Settings › Developer settings › Personal access tokens ›
   *Fine-grained tokens* › *Generate new token* :
   - *Repository access* : uniquement le dépôt de la veille ;
   - *Permissions* › *Actions* : **Read and write** (rien d'autre) ;
   - une date d'expiration (12 mois maximum, à renouveler).
   Ne collez jamais ce jeton ailleurs que dans Cloudflare (étape 3).
2. **Cloudflare** — créer un compte gratuit, puis *Workers & Pages* › *Create* ›
   *Create Worker* › nom `cyberwatch-relais` › *Deploy*, puis *Edit code* : remplacer
   le code par le contenu de `relais/worker.js` › *Deploy*.
3. **Réglages du worker** — *Settings* › *Variables and Secrets* :
   | Nom | Type | Valeur |
   |---|---|---|
   | `GITHUB_TOKEN` | **Secret** | le jeton de l'étape 1 |
   | `DEPOT` | Texte | `organisation/depot` (ex. `mon-organisation/cyberwatch`) |
   | `WORKFLOW` | Texte | `veille.yml` |
   | `BRANCHE` | Texte | `main` |
   | `SITE_ORIGINE` | Texte | adresse du site sans le chemin, ex. `https://organisation.github.io` |
   | `MAX_PAR_JOUR` | Texte | `3` (facultatif) |
   | `CODE_ACCES` | Secret | (facultatif) un code partagé avec les utilisateurs |
4. **Brancher le site** — dans `config/veille.json`, renseigner
   `"url_relais": "https://cyberwatch-relais.<votre-sous-domaine>.workers.dev"`.
   À la collecte suivante, le bouton du site passe par le relais.
5. **Tester** — ouvrir `https://…workers.dev/etat` dans le navigateur : une réponse
   `{"en_cours":false,…}` confirme que le relais lit bien GitHub.

## Après un déplacement du dépôt

Créer un nouveau jeton limité au nouveau dépôt (étape 1), puis dans Cloudflare mettre à jour
`GITHUB_TOKEN`, `DEPOT` et `SITE_ORIGINE`. L'adresse du relais ne change pas : rien à modifier
dans le site.
