# Vérification de la préparation à la production

Ce document distingue les fonctionnalités implémentées des dépendances externes.

## Implémenté

- Sessions PostgreSQL, révocation unitaire et des autres sessions, invalidation après changement ou réinitialisation du mot de passe.
- Limites par IP et empreinte d'e-mail sur l'authentification ; Redis obligatoire en production et refus temporaire si indisponible.
- Validation des secrets et de la configuration au démarrage de production.
- Schéma initial figé, migrations additives et contrôle de cohérence avec les entités.
- Carnet de contacts partagé et isolé par espace, CRUD, recherche et import depuis les destinataires.
- Page de suivi des signatures, rubrique Compte & sécurité, historique et relances de webhooks.
- File de webhooks persistée dans la transaction des événements métier, protection des destinations réseau et reprise des leases expirées.
- Composant d'invitation partagé entre aperçu et signataire ; couleurs et typographies reprises dans les e-mails HTML et snapshot des nouvelles enveloppes.
- Sélection d’un contact du carnet directement dans la préparation d’une enveloppe.
- Pages publiques reliées au formulaire d'inscription ; contenu d'entreprise encore préparatoire.
- Compose de production, contrôles de santé, sauvegarde cohérente et vérification des archives, CI.

## Limites à conserver visibles

La configuration de prestataires n'est pas une preuve de fonctionnement : la livraison SMTP, les paiements Stripe, les vérifications d'identité et le scellement P12 nécessitent leurs propres essais en environnement cible. Les signatures avancées/qualifiées et SMS sont indisponibles.

Les jetons de connexion sont encore stockés dans le navigateur par le client existant. Leur révocation serveur est maintenant effective ; cela ne remplace pas un audit complet XSS/session ni un audit de sécurité indépendant.

Le stockage documentaire est un volume persistant local à l'hôte. Pour plusieurs hôtes API, un stockage partagé ou objet avec la même sémantique reste nécessaire. La présente configuration de production vise un hôte unique, avec plusieurs services conteneurisés.

Les pages légales ne sont pas prêtes à publication tant que l'entreprise, le contact, l'hébergeur, les prestataires, la conservation et les modalités commerciales ne sont pas renseignés.

Les scripts de sauvegarde ne publient rien et ne restaurent jamais automatiquement par-dessus les données en service.

## Contrôles exécutés le 13 octobre 2026

- Build NestJS et Next.js 16.3.8 : réussi, TypeScript compris.
- Tests unitaires API : 104 réussis ; smoke HTTP : 1 réussi.
- Intégration PostgreSQL : migrations initiales et additives, absence de dérive, contacts isolés, PDF final, dossier de preuve, événements webhook persistants, concurrence, sessions, réinitialisation à usage unique et limitation HTTP validés.
- Vérificateur de sauvegarde : archive synthétique valide acceptée, corruption et traversée de chemins rejetées. La restauration Docker complète reste à exercer en environnement cible.
- Playwright : 8 scénarios recensés (bureau/mobile), pas exécutés localement faute de navigateur disponible. Les API y sont simulées ; ils complètent les tests PostgreSQL.
- Workflow GitHub préparé à la racine réelle du dépôt : `../.github/workflows/signature-platform.yml`, avec chemins du sous-projet. Son exécution distante reste à vérifier après publication Git.

## Dépendances à suivre

L’audit npm de production conserve deux alertes élevées : `node-forge` et son consommateur `@signpdf/signer-p12`. L’[avis GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) concerne la vérification RSA PKCS#1 v1.5 et ne propose pas de version corrigée lors du contrôle. Le code inspecté utilise cette chaîne pour signer avec le P12 serveur ; cette observation ne prouve pas l’absence de risque. Suivre le correctif avant de déclarer la sécurité validée.

L’audit incluant le développement signalait aussi cinq alertes propagées par `braces` et la chaîne ESLint. Le correctif automatique proposé rétrogradait la configuration Next à une version majeure incompatible ; il n’a pas été appliqué. Les corrections compatibles, dont Next 16.3.8, ont été appliquées.

Le lint API/web et le dernier contrôle TypeScript passent sans erreur. Des avertissements subsistent (logos distants, navigation d’authentification, échappements SQL et helpers de tests) ; ils ne sont pas présentés comme un audit de qualité entièrement vierge.
