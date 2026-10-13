# Marque et signatures électroniques

## Personnaliser la marque

Dans **Tableau de bord → Paramètres**, renseignez le nom, la couleur et l’URL HTTPS du logo. Ces informations sont enregistrées dans la colonne JSONB `users.branding` de PostgreSQL. À la création d’une enveloppe, Signeo copie les réglages dans `envelopes.brand_snapshot` : une invitation déjà envoyée conserve ainsi la même apparence.

La même page permet de définir une police, une taille et une couleur par défaut pour le texte et les signatures. Dans la préparation d’une enveloppe, sélectionnez un champ posé sur le PDF pour remplacer son style individuellement. Le signataire peut saisir son nom ou dessiner sa signature à la souris ou sur un écran tactile. L’aperçu des paramètres et l’accueil du signataire partagent le même composant ; les invitations et rappels HTML reprennent la marque enregistrée dans l’enveloppe.

## PDF avec signature cryptographique

La page de signature collecte l’accord et les champs remplis. Quand tous les destinataires ont terminé, l’API peut intégrer les valeurs dans chaque PDF et y ajouter une signature numérique détachée avec un certificat PKCS#12/P12. Le fichier original est conservé ; le PDF scellé est un fichier distinct, téléchargeable depuis le détail de l’enveloppe.

Pour activer ce scellement, obtenez un certificat adapté à votre organisation auprès d’un prestataire de confiance, placez le fichier P12 hors du dépôt, puis définissez dans le `.env` local de l’API :

```dotenv
SIGNING_P12_PATH=C:/chemin-prive/certificat-organisation.p12
SIGNING_P12_PASSWORD=mot-de-passe-du-certificat
SIGNING_CERT_NAME=Nom de l’organisation
```

Redémarrez ensuite l’API. Le `.env` et le fichier P12 sont des secrets : ne les envoyez pas dans une capture ou un message et ne les commitez jamais. Sans certificat correctement configuré, Signeo enregistre l’événement de signature mais ne produit pas de PDF certifié.

Ce certificat organisationnel crée une signature cryptographique de fichier ; il ne prouve pas à lui seul l’identité du signataire et ne transforme pas l’opération en signature avancée ou qualifiée eIDAS. Le niveau qualifié exige notamment un prestataire et un certificat qualifiés. La vérification par code e-mail est intégrée et nécessite un SMTP opérationnel. Les options avancée/qualifiée et la vérification SMS restent indisponibles.

## À comprendre

- Le certificat P12 contient une clé privée : c’est elle qui produit la signature vérifiable dans le PDF. Elle ne va jamais dans le navigateur.
- La couleur et le logo sont de la présentation ; ils ne renforcent pas la valeur cryptographique ou juridique d’une signature.
- Le scellement actuel concerne les fichiers PDF. Les DOCX doivent être convertis en PDF avant de pouvoir recevoir cette signature numérique.
- En développement, TypeORM met à jour le schéma PostgreSQL au redémarrage. En production, désactivez `synchronize` et appliquez une migration avant déploiement.
