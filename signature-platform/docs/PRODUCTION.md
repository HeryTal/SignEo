# Mise en production et exploitation

Cette procédure ne publie rien automatiquement. Le code fournit une installation reproductible et les contrôles ci-dessous ; le domaine, l'hébergement et les prestataires doivent être choisis et configurés par l'exploitant.

## Préparation

- Node 22.20+ ou Docker avec Compose.
- Sauvegarder la base et les documents existants avant toute migration.
- Copier les variables utiles de `.env.example` dans un fichier privé `.env.production`, ignoré par Git. Ne jamais mettre de secrets dans des arguments de commande.
- Définir des secrets indépendants d'au moins 32 caractères pour `JWT_SECRET` et `WEBHOOK_ENCRYPTION_SECRET`. Conserver le second : sa perte empêche de déchiffrer les secrets des webhooks déjà créés.
- Définir `DATABASE_PASSWORD`, `WEB_ORIGIN=https://app.votre-domaine`, `PUBLIC_API_URL=https://api.votre-domaine`, SMTP et les prestataires réellement utilisés. Le front compile l'URL publique de l'API dans son bundle : toute modification nécessite un rebuild.
- Le Compose de production monte les documents sur un volume persistant. Il n'expose ni PostgreSQL ni Redis. Les ports web/API sont liés à la boucle locale.
- Placer un reverse proxy HTTPS devant les ports 3000/3001. Définir `TRUST_PROXY_HOPS=1` seulement si exactement un proxy de confiance est devant l'API et si l'accès direct est bloqué. Sans cette option, la limite d'authentification s'applique à l'adresse du proxy.
- Les connexions PostgreSQL TLS vérifient maintenant les certificats. Pour une autorité privée, fournir sa CA via `NODE_EXTRA_CA_CERTS` et monter le fichier ; ne pas désactiver la vérification.

## Installation sur une base neuve

Depuis la racine du dépôt :

```sh
docker compose --env-file .env.production -f compose.production.yml build
docker compose --env-file .env.production -f compose.production.yml up -d postgres redis
docker compose --env-file .env.production -f compose.production.yml run --rm --no-deps api npm run migration:run --workspace api
docker compose --env-file .env.production -f compose.production.yml up -d api web
```

Les migrations construisent désormais le schéma initial complet. `synchronize` est toujours désactivé en production. Ne jamais lancer le générateur de baseline pour remplacer une migration déjà publiée.

Pour une base existante, les migrations initiales conservent les tables existantes ; la migration ProductionReadiness ajoute les sessions, les contacts, la file des webhooks et la version d'authentification. Les anciens jetons sans session persistée sont rejetés : une reconnexion est attendue après cette mise à jour.

## Vérifications et surveillance

- `GET /health/live` : processus disponible.
- `GET /health/ready` : PostgreSQL accessible et volume documentaire lisible/inscriptible en production.
- Le contrôle de santé ne prouve pas la réception des e-mails ni le fonctionnement des prestataires. Vérifier séparément SMTP, Stripe Billing/Identity et le certificat P12 avec des comptes de test.
- Superviser les réponses 5xx, la latence, l'espace disque, les erreurs de génération PDF et l'âge des livraisons webhook en attente. Configurer des alertes dans l'hébergeur choisi.
- Chaque webhook conserve son identifiant d'événement et son contenu entre les tentatives. Livraison au moins une fois : le destinataire doit dédupliquer `payload.id`. Huit tentatives, délai croissant de 30 secondes à une heure ; reprise manuelle depuis Développeurs → Webhooks.
- Les URL de webhooks doivent être HTTPS sur le port 443. Les destinations privées/réservées et les redirections sont refusées. L'adresse DNS validée est utilisée pour la connexion.
- Les sessions expirent après sept jours et sont révocables. Le changement/rétablissement du mot de passe révoque toutes les sessions ; le bouton de déconnexion révoque la session courante lorsque le serveur est accessible.

## Sauvegarde cohérente

```sh
python scripts/backup-production.py --destination /chemin/protege/signeo-backups
python scripts/verify-backup.py /chemin/protege/signeo-backups/DATE_UTC
```

Le script arrête brièvement les writers API/web, exporte PostgreSQL et le volume documentaire, calcule les empreintes SHA-256, puis redémarre les services même en cas d'erreur. Le manifeste est écrit seulement après succès. Prévoir cette interruption, planifier la commande avec l'outil de l'hébergeur et transférer les sauvegardes vers un stockage distinct chiffré et à accès restreint. Elles ne sont pas chiffrées par ce script. Conserver également les secrets de chiffrement et certificats dans un coffre indépendant.

## Restauration : toujours dans un nouvel environnement

La commande préparée refuse toute cible contenant déjà des conteneurs ou volumes :

```sh
python scripts/restore-production.py --backup /chemin/sauvegarde/DATE_UTC --project signeo-restore-exercice --env-file .env.restore
```

Elle restaure et migre la base et les fichiers dans un nouveau projet, puis laisse API/web arrêtés. Aucun trafic n’est basculé.

Ne pas écraser la base en service. Préparer un nouveau projet Compose (`--project-name signeo-restore`) avec une base et des volumes vides, sur un hôte ou des ports différents. Vérifier d'abord le manifeste avec `verify-backup.py`.

1. Démarrer seulement PostgreSQL et Redis dans ce nouveau projet.
2. Restaurer `database.dump` avec `pg_restore --exit-on-error --no-owner` dans la base vide. Utiliser le mot de passe via l'environnement du conteneur, pas via la ligne de commande.
3. Restaurer `documents.tar.gz` dans le nouveau volume documentaire : la racine de l'archive est `uploads/`. Utiliser un conteneur temporaire monté sur `/data/uploads`, avec extraction à partir de `/data`.
4. Configurer les mêmes clés de chiffrement des webhooks et le certificat de scellement, puis exécuter les migrations restantes.
5. Démarrer API/web et vérifier santé, connexion, téléchargement d'un ancien document et dossier de preuve.
6. Ne basculer le reverse proxy qu'après vérification de la restauration. Conserver l'ancien environnement intact jusqu'à validation.

Effectuer un exercice de restauration avant le premier lancement public, puis régulièrement. La vérification des empreintes seule ne remplace pas cet exercice.

## Tests

```sh
npm run test:api
npm run test:e2e
npm run test:integration --workspace api
npm run build
```

L'intégration crée un schéma PostgreSQL aléatoire et un répertoire temporaire, puis les détruit. Elle utilise les migrations sans synchronisation automatique et simule les e-mails. Ne pas définir `SMTP_TEST_TO` ou `RUN_STRIPE_BILLING_TEST` pour une exécution sans interactions externes.

## Éléments externes restant à finaliser

- Domaine, DNS, HTTPS, hébergement et supervision.
- SMTP réel et configuration DNS de l'expéditeur.
- Tarifs Stripe, portail et endpoints de webhook ; vérification d'identité si souhaitée.
- Certificat P12 si le scellement cryptographique est souhaité.
- Informations d'entreprise, prestataires, durées de conservation et textes contractuels dans `apps/web/src/app/legal-content.ts` et les pages publiques. Elles sont volontairement identifiées comme préparatoires. Ne pas retirer ce statut sans compléter et valider le contenu.
- Les niveaux de signature avancé/qualifié et le SMS ne sont pas activés sans fournisseur approprié.

Les points d'information publique à compléter sont fondés sur les guides [CNIL](https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence) et [Service Public Entreprendre](https://entreprendre.service-public.gouv.fr/vosdroits/F31228). Le code ne constitue pas une validation juridique des textes.
