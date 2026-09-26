# Plateforme de signature

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

Ce socle ne contient pas encore de base de données, d'authentification ou de moteur de signature. Aucune connexion au projet Supabase d'Izovy n'est configurée.
