# Plateforme de signature

## PostgreSQL

Copiez `.env.example` en `.env` et remplacez `DATABASE_PASSWORD` par un mot de passe local. Démarrez ensuite la base de données :

```powershell
docker compose up -d postgres
```

L’API NestJS utilise PostgreSQL avec TypeORM. En développement, les tables des entités seront créées automatiquement. Pour la production, utilisez des migrations et définissez `NODE_ENV=production`.

Socle indépendant de l'application Expo Izovy, avec deux applications TypeScript :

- `apps/web` : Next.js, App Router et Tailwind CSS, sur http://localhost:3000.
- `apps/api` : NestJS, sur http://localhost:3001.

## Démarrer

Node.js 22.20 ou supérieur. Depuis ce dossier :

```powershell
npm.cmd ci
npm.cmd run dev
```

Pour démarrer séparément : `npm.cmd run dev:web` et `npm.cmd run dev:api`.

## Vérifier

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd run test:api
npm.cmd run test:e2e
```

L'API utilise `PORT=3001`, `HOST=127.0.0.1` et `WEB_ORIGIN=http://localhost:3000` par défaut. Ces variables peuvent être définies dans le terminal ; aucun fichier `.env` n'est nécessaire au démarrage.

En production, démarrer les applications construites avec `npm.cmd run start --workspace web` et `npm.cmd run start:prod --workspace api`. Adapter HOST et WEB_ORIGIN à l'hébergement.

Les dépendances et le lockfile de ce workspace sont indépendants de ceux d'Izovy. Le CLI NestJS et ses schematics sont épinglés à des versions compatibles avec Node 22.20.

## Parcours de signature

Le tableau de bord permet de préparer des enveloppes avec plusieurs documents et destinataires, d'attribuer des champs au signataire, de prévisualiser le parcours, puis d'envoyer des invitations par e-mail. Les modes simultané, séquentiel et personnalisé, les rôles signataire/approbateur, les rappels automatiques et manuels, l'expiration et l'annulation sont pris en charge.

Les modèles enregistrés conservent une copie des documents, les champs placés, l'ordre et les paramètres de parcours. Ils peuvent être réutilisés avec de nouveaux destinataires depuis **Modèles**. La page publique du signataire propose la signature saisie ou dessinée.

La signature avancée et la signature qualifiée ne sont pas fournies par cette application : elles requièrent respectivement un prestataire de confiance approprié et un prestataire de services de confiance qualifié (QTSP). Le scellement cryptographique du PDF est une fonction distincte, activée en configurant `SIGNING_P12_PATH` et `SIGNING_P12_PASSWORD`. Ne pas assimiler ce scellement serveur à une signature qualifiée.

## Comptes, organisations et autorisations

Chaque compte possède une organisation à sa création. Une organisation peut contenir plusieurs espaces ; les enveloppes, modèles, clés API et webhooks restent isolés par espace, tandis que la facturation est portée par l’organisation.

Les rôles d’espace sont centralisés : `ADMIN` gère l’équipe, la facturation et tous les parcours ; `MANAGER` gère les enveloppes ; `SIGNER` peut préparer des enveloppes sans les envoyer ; `APPROVER` accède en lecture. Les anciennes valeurs `MEMBER` et `VIEWER` sont migrées vers `MANAGER` et `SIGNER`.

`GET /billing` expose le plan et l’usage mensuel de l’organisation active. Seul un administrateur peut modifier l’adresse de facturation avec `PATCH /billing`. Le changement de plan doit venir d’un prestataire de paiement via une intégration serveur : il n’existe volontairement pas d’API utilisateur qui permettrait d’auto-attribuer un abonnement.

Stripe Billing est disponible par organisation : un administrateur crée une session hébergée via `POST /billing/checkout` (`BUSINESS` ou `ENTERPRISE`) et ouvre le portail Stripe via `POST /billing/portal`. Configurez `STRIPE_SECRET_KEY`, `STRIPE_PRICE_BUSINESS`, `STRIPE_PRICE_ENTERPRISE` et l’endpoint signé `POST /stripe/webhook` avec `STRIPE_WEBHOOK_SECRET`. Sélectionnez les événements snapshot `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `checkout.session.completed`, `invoice.paid` et `invoice.payment_failed`. Activez aussi le portail client dans Stripe. En local : `stripe listen --forward-to localhost:3001/stripe/webhook`.

Le forfait est déterminé par le tarif Stripe réellement souscrit, à chaque notification et lecture de `/billing`, y compris au retour de Checkout. Les notifications de plus de cinq minutes sont rejetées ; l’état actuel est relu pour supporter les livraisons répétées ou désordonnées. Les quotas sont 5/50/250 enveloppes envoyées par mois civil UTC pour Gratuit/Business/Enterprise. Les brouillons ne comptent pas ; les enveloppes annulées après envoi comptent. Une organisation annulée ou en impayé revient au quota gratuit. Un verrou transactionnel commun à ses espaces protège les envois concurrents. Les quotas sont indépendants du montant des prix configurés dans Stripe.

`RUN_STRIPE_BILLING_TEST=1 node test/workflow.integration.mjs` depuis `apps/api` teste les deux offres Stripe avec une clé `sk_test_` exclusivement, une carte simulée et une base isolée. Les abonnements créés sont annulés et le client de test supprimé. Ce test API ne remplace pas un parcours navigateur Checkout.

La vérification d’identité expose son état dans `GET /auth/me` et démarre via `POST /auth/identity-verification`. Avec Stripe Identity, définissez `IDENTITY_VERIFICATION_PROVIDER=stripe`, `STRIPE_SECRET_KEY` et `STRIPE_IDENTITY_WEBHOOK_SECRET`, puis configurez l’endpoint `POST /auth/identity-verification/stripe-webhook` dans Stripe : l’application crée une VerificationSession par utilisateur et n’enregistre `VERIFIED` qu’après le webhook Stripe signé. Les fournisseurs génériques peuvent utiliser `POST /auth/identity-verification/callback` avec les variables `IDENTITY_VERIFICATION_*`. L’adresse e-mail ou le consentement ne sont jamais présentés comme une vérification d’identité.

En développement, TypeORM synchronise les entités sauf si `DATABASE_SYNCHRONIZE=false`. En production, la synchronisation reste désactivée. Les quatre migrations comprennent désormais le schéma initial complet, les modèles, les organisations et les ajouts de préparation à la production. Le test d’intégration vérifie une base neuve et une mise à niveau conservant les utilisateurs.

Avant de démarrer la nouvelle version en production, sauvegardez la base, configurez les variables `DATABASE_*` de l’environnement cible, puis exécutez :

```powershell
npm.cmd run build --workspace api
npm.cmd run migration:show --workspace api
npm.cmd run migration:run --workspace api
```

Le runner charge le `.env` du dépôt sans écraser les variables déjà définies. Les migrations exécutées sont enregistrées dans `schema_migrations`. Une table de modèles déjà créée en développement est conservée. Le retour arrière automatique est refusé afin de ne pas supprimer les modèles et leurs références documentaires.

## Tests du workflow sur PostgreSQL

```powershell
npm.cmd run test:integration --workspace api
```

Ce test utilise la connexion PostgreSQL configurée, crée un schéma aléatoire `workflow_test_*` et le supprime à la fin. Il ne modifie pas les comptes ni les enveloppes existants. Il vérifie la migration, le parcours HTTP authentifié, les rappels, les invitations séquentielles et les signatures concurrentes avec l’annulation. Les e-mails sont simulés par défaut.

Pour tester aussi l’envoi SMTP réel, définissez `SMTP_TEST_TO` avec une adresse de test que vous contrôlez. Deux messages seront envoyés (invitation et rappel), puis l’enveloppe de test sera annulée et supprimée avec son schéma. Les liens de ces messages sont temporaires et locaux. L’acceptation SMTP ne garantit pas la réception en boîte principale.

## Préparation à la production

Consultez [le guide de déploiement et restauration](docs/PRODUCTION.md) et [le bilan des vérifications et limites](docs/VERIFICATION.md). Les pages légales restent préparatoires et les prestataires doivent être testés dans l’environnement cible.

Les paramètres de marque sont copiés dans chaque nouvelle enveloppe et utilisés dans l’accueil du signataire et les e-mails. Les contacts, sessions révoquables et livraisons webhook persistantes disposent de leurs écrans de gestion.
