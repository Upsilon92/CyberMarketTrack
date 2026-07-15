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
(ou, sur ce poste, la distribution portable est déjà dans
`D:\Users\Louis\Tools\nodejs`, ajoutée au PATH utilisateur).

### Étapes

1. Ouvrir un terminal **dans le dossier `site/`** du projet.
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

1. Copier le dossier `site/` sur le serveur.
2. Dans `site/` : `cp .env.example .env` puis éditer les secrets.
3. Construire et démarrer :
   ```
   docker compose up -d --build
   ```
4. Ouvrir http://serveur:3000/login et se connecter avec
   `ADMIN_USERNAME` / `ADMIN_PASSWORD` : sur une base vierge, le compte
   admin est créé automatiquement au premier login.
5. Importer les données : soit l'import CSV (`/admin/import`), soit la
   restauration d'un export JSON (`/admin/backup`).

La base vit dans `site/data/` **sur le serveur hôte** (volume Docker) : elle
survit aux reconstructions du conteneur.

---

## 3. Sauvegarde et restauration

Trois moyens complémentaires :

1. **Page `/admin/backup`** : export JSON complet (ré-importable) et
   téléchargement du fichier SQLite en un clic. La restauration depuis un
   export JSON remplace toute la base (confirmation demandée, opération
   atomique).
2. **Script** : dans `site/`,
   ```
   npm run backup
   ```
   crée `data/backups/cybermarkettrack-<horodatage>.db` + `.json`.
3. **Copie de fichier** : la base est UN fichier — copier
   `data/cybermarkettrack.db` suffit (de préférence quand le site est arrêté).

### Stratégie recommandée (serveur Linux + Docker)

Une sauvegarde par nuit + rétention : sur l'hôte, `crontab -e` puis :

```
0 3 * * * cp /chemin/site/data/cybermarkettrack.db /chemin/backups/cmt-$(date +\%F).db && find /chemin/backups -name "cmt-*.db" -mtime +30 -delete
```

(copie quotidienne à 3 h, suppression des copies de plus de 30 jours).
Penser à copier régulièrement ces sauvegardes **hors du serveur**.

Sous Windows : Planificateur de tâches → exécuter `npm run backup` dans
`site/` chaque nuit.

---

## 4. Mise à jour des dépendances

Tous les 1 à 3 mois, dans `site/` :

```
npm audit             # liste les vulnérabilités connues
npm update            # met à jour dans les bornes autorisées
npm test              # les 36 tests doivent rester verts
npm run build         # le build doit passer
```

Si `npm audit` signale une faille sans correctif compatible, noter le paquet
et surveiller ; ne lancer `npm audit fix --force` qu'en dernier recours (peut
casser des versions majeures — faire un backup et un test complet après).

---

## 5. Organisation des dossiers (rappel)

- `site/` = le code source → **c'est ce dossier qu'on versionne sur GitHub**.
  Son `.gitignore` exclut déjà : `.env` (secrets), `data/` (base + backups),
  `node_modules`, `lib/generated/` (code généré), `.next/` (cache de build).
- `runtime/` = les modules installés (`node_modules`) → **jamais sur GitHub** ;
  reconstructible à tout moment avec `npm install`.
- Voir `../LISEZMOI.txt` pour le détail (jonction Windows).

## 6. Commandes utiles (dans `site/`)

| Commande | Effet |
|---|---|
| `npm run dev` | Site en mode développement (http://localhost:3000) |
| `npm run build` puis `npm start` | Build + serveur de production local |
| `npm test` | Tests unitaires du cœur temporel |
| `npm run backup` | Sauvegarde horodatée (SQLite + JSON) dans `data/backups/` |
| `npx prisma migrate dev` | Applique le schéma de base de données |
| `npx prisma db seed` | (Re)charge les données d'exemple — **écrase les données** |
| `npx prisma studio` | Explorateur graphique de la base (dev uniquement) |
