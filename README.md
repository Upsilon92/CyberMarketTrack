# CyberMarketTrack

Base de connaissances du marché de la cybersécurité : entreprises, solutions,
historique complet des rachats/fusions/renommages, et comparateurs
personnalisés. Voir [ARCHITECTURE.md](./ARCHITECTURE.md) pour les principes
techniques (notamment le modèle à événements).

Ce guide est écrit **pas à pas pour un non-développeur**.

---

## 1. Installation locale (Windows, macOS ou Linux)

### Prérequis : Node.js 22

Vérifier dans un terminal :

```
node --version
```

Si la commande échoue, installer Node.js LTS depuis https://nodejs.org

### Étapes

1. Ouvrir un terminal **à la racine du projet** (là où se trouve `package.json`).
2. Installer les dépendances (une seule fois, ~2 minutes) :
   ```
   npm install
   ```
3. Créer le fichier de configuration :
   ```
   copier .env.example vers .env    (copy .env.example .env)
   ```
   puis **ouvrir `.env` et changer `ADMIN_PASSWORD` et `AUTH_SECRET`**
   (n'importe quelle longue chaîne aléatoire pour le secret).
4. Créer la base de données et la remplir avec les données d'exemple :
   ```
   npx prisma migrate dev
   npx prisma db seed
   ```
5. Lancer le site :
   ```
   npm run dev
   ```
   → http://localhost:3000 (admin : http://localhost:3000/admin, identifiants
   du `.env`).

> Note : `npm run dev` recompile chaque page à la demande et peut être lent au
> premier chargement. Pour évaluer rapidement le rendu, préférez un build de
> production : `npm run build` puis `npm start`.

### Variables d'environnement (`.env`)

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Emplacement du fichier SQLite (laisser `file:./data/cybermarkettrack.db`) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Compte administrateur (créé par le seed, ou automatiquement au premier login si la base est vide) |
| `AUTH_SECRET` | Secret de chiffrement des sessions — **longue chaîne aléatoire, unique par instance** |
| `AUTH_TRUST_HOST` | Laisser `"true"` en auto-hébergement |
| `FRESHNESS_MONTHS` | Seuil (mois) du badge « à revérifier » (défaut 12) |

---

## 2. Lancement avec Docker (serveur)

Prérequis : Docker + Docker Compose installés.

**Aucun `.env` à préparer.** Le seul secret réellement sensible (`AUTH_SECRET`,
chiffrement des sessions) est généré automatiquement au premier démarrage et
persisté dans `./data/.auth_secret` ; les autres valeurs ont des défauts dans
le `docker-compose.yml`.

1. Copier le projet sur le serveur.
2. Construire et démarrer :
   ```
   docker compose up -d --build
   ```
3. Ouvrir http://serveur:3000/login et se connecter avec
   `ADMIN_USERNAME` / `ADMIN_PASSWORD` (défaut `admin` / `ChangeMe!2026`) :
   sur une base vierge, le compte admin est créé automatiquement au premier
   login.
4. Importer les données : soit l'import CSV (`/admin/import`), soit la
   restauration d'un export JSON (`/admin/backup`).

La base vit dans `./data` **sur le serveur hôte** (volume Docker) : elle
survit aux reconstructions du conteneur.

> **Personnalisation (facultatif).** Pour changer le mot de passe admin ou
> fixer un `AUTH_SECRET` précis, exportez la variable dans le shell
> (`export ADMIN_PASSWORD=…`) ou créez un fichier `.env` à côté du
> `docker-compose.yml` (voir [`.env.example`](./.env.example)) : ces valeurs
> sont prises en priorité sur les défauts. **Changez `ADMIN_PASSWORD`** sur
> une instance exposée sur Internet.

### 2 bis. Construire directement depuis GitHub (sans cloner)

Le fichier [`docker-compose.github.yml`](./docker-compose.github.yml) construit
l'image **directement depuis le dépôt GitHub** — inutile de cloner. Copier ce
**seul fichier** sur le serveur puis :

```
docker compose -f docker-compose.github.yml up -d --build
```

Là aussi, aucun `.env` : mêmes défauts + `AUTH_SECRET` auto-généré. Pour
**mettre à jour** après un push sur GitHub, relancer la même commande (ajouter
`--pull` / `--no-cache` pour forcer la reconstruction). Les données sont
préservées (volume `./data`).

---

## 3. Sauvegarde et restauration

Trois moyens complémentaires :

1. **Page `/admin/backup`** : export JSON complet (ré-importable), export des
   logos en ZIP, et téléchargement du fichier SQLite en un clic. La
   restauration depuis un export JSON remplace toute la base (confirmation
   demandée, opération atomique).
2. **Script** :
   ```
   npm run backup
   ```
   crée `data/backups/cybermarkettrack-<horodatage>.db` + `.json`.
3. **Copie de fichier** : la base est UN fichier — copier
   `data/cybermarkettrack.db` suffit (de préférence quand le site est arrêté).

### Stratégie recommandée (serveur Linux + Docker)

Une sauvegarde par nuit + rétention : sur l'hôte, `crontab -e` puis :

```
0 3 * * * cp /chemin/projet/data/cybermarkettrack.db /chemin/backups/cmt-$(date +\%F).db && find /chemin/backups -name "cmt-*.db" -mtime +30 -delete
```

(copie quotidienne à 3 h, suppression des copies de plus de 30 jours).
Penser à copier régulièrement ces sauvegardes **hors du serveur**.

Sous Windows : Planificateur de tâches → exécuter `npm run backup` chaque nuit.

---

## 4. Mise à jour des dépendances

Tous les 1 à 3 mois :

```
npm audit             # liste les vulnérabilités connues
npm update            # met à jour dans les bornes autorisées
npm test              # les tests unitaires doivent rester verts
npm run build         # le build doit passer
```

Si `npm audit` signale une faille sans correctif compatible, noter le paquet
et surveiller ; ne lancer `npm audit fix --force` qu'en dernier recours (peut
casser des versions majeures — faire un backup et un test complet après).

---

## 5. Ce que le dépôt ne contient pas

Le `.gitignore` exclut : `.env` (secrets), `data/` (base + backups),
`node_modules` (réinstallé par `npm install`), `lib/generated/` (client Prisma
régénéré par `npx prisma generate`) et `.next/` (cache de build). Ces éléments
sont recréés localement par les commandes d'installation.

## 6. Commandes utiles

| Commande | Effet |
|---|---|
| `npm run dev` | Site en mode développement (http://localhost:3000) |
| `npm run build` puis `npm start` | Build + serveur de production local |
| `npm test` | Tests unitaires du cœur temporel |
| `npm run backup` | Sauvegarde horodatée (SQLite + JSON) dans `data/backups/` |
| `npx prisma migrate dev` | Applique le schéma de base de données |
| `npx prisma db seed` | (Re)charge les données d'exemple — **écrase les données** |
| `npx prisma studio` | Explorateur graphique de la base (dev uniquement) |
