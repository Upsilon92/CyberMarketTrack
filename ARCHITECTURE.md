# CyberMarketTrack — Architecture

> Ce document décrit les principes de fonctionnement de l'application. **Il doit
> être mis à jour à chaque évolution significative du code.**

## 1. Vue d'ensemble

CyberMarketTrack est une base de connaissances du marché de la cybersécurité :
entreprises (éditeurs, sociétés de services, fonds), solutions, **historique
daté et complet de leurs évolutions** (rachats, fusions, renommages,
transferts), et comparateurs personnalisés.

Monolithe **Next.js 16** (App Router, TypeScript) — pas de backend séparé, pas
de microservices, pas de cache externe.

## 2. Stack

| Rôle              | Choix                                   | Pourquoi |
|-------------------|------------------------------------------|----------|
| Framework         | Next.js 16 (App Router, TypeScript)      | Un seul projet, un seul langage, Server Components par défaut |
| Base de données   | SQLite via Prisma 7                      | Un fichier unique `data/cybermarkettrack.db` → backup trivial |
| Accès BDD         | Prisma + adapter `better-sqlite3`        | Prisma 7 n'a plus de moteur Rust : le client utilise un driver adapter |
| UI                | Tailwind CSS 4 + shadcn/ui               | Composants accessibles, responsive, dark mode |
| i18n              | next-intl (mode « sans routing »)        | FR/EN par cookie `NEXT_LOCALE`, URLs propres |
| Thème             | next-themes                              | light/dark, préférence système par défaut |
| Validation        | Zod (formulaires ET API)                 | Jamais de confiance au client |
| Authentification  | Auth.js v5 (NextAuth), provider Credentials | Sessions JWT, CSRF natif, prêt pour SAML/RBAC |
| Tests             | Vitest                                   | Tests unitaires des fonctions pures (36 tests) |
| Déploiement       | Docker multi-stage + volume `data/`      | Voir README |

### Particularités Prisma 7 (≠ tutoriels antérieurs)

- La configuration CLI est dans **`prisma.config.ts`** (plus de bloc dans
  `package.json`, plus d'`url` dans le `datasource` du schéma).
- Le client est généré dans **`lib/generated/prisma/`** (gitignoré,
  régénéré par `npx prisma generate`).
- Le client runtime reçoit un **adapter** : `new PrismaClient({ adapter: new PrismaBetterSqlite3(...) })`
  (voir `lib/prisma.ts`).
- SQLite ne supporte pas les enums Prisma : toutes les valeurs énumérées sont
  des `String` validées par Zod, définies une seule fois dans
  **`lib/constants.ts`**. Une migration PostgreSQL pourra les convertir en
  enums natifs sans remodeler les données.

## 3. Le modèle temporel — cœur de l'application

### Règle non négociable

**Les événements (`Event`) sont l'unique source de vérité de tout ce qui évolue
dans le temps.** Il n'existe aucune table de périodes, et l'entité ne stocke
aucun champ « courant » :

- `Company` n'a **ni** `name`, **ni** `status`, **ni** `parentCompanyId` —
  seulement `initialName` (le nom à la création, point d'ancrage immuable) et
  les champs intrinsèques (année de création, pays…).
- `Solution` n'a ni `name` ni `companyId` courant — seulement `initialName` et
  `initialCompanyId` (l'éditeur d'origine).

### Dérivation (lecture)

Les **périodes sont calculées à la lecture** par des fonctions pures, sans
accès base, dans **`lib/timeline.ts`** :

```
buildCompanyTimeline(company, events) → {
  namePeriods:      [{ name, start, end|null }]     // end null = en cours
  ownershipPeriods: [{ ownerCompanyId, ownershipType, start, end|null }]
  statusPeriods:    [{ status, start, end|null }]
  currentName, currentOwner, currentStatus          // = les périodes ouvertes
  informationalEvents                               // FUNDING, OTHER
}
```

Algorithme : trier les événements par date (**la saisie dans le désordre est
donc gérée nativement**), initialiser l'état depuis l'entité, puis chaque
événement clôture la période en cours de la dimension qu'il modifie et en
ouvre une nouvelle. `periodAt(periods, date)` donne l'état « à telle date »
(la vue `?at=YYYY` des fiches).

Statuts dérivés : `INDEPENDENT` par défaut ; `INVESTOR_OWNED` / `SUBSIDIARY` /
`ABSORBED` selon l'`outcome` de la dernière acquisition non suivie d'un
`DIVESTMENT` ; `MERGED` après `MERGER` ; `DEFUNCT` après `SHUTDOWN`.
Un `DIVESTMENT` clôture la détention sans en ouvrir de nouvelle.

Les **trous d'information sont autorisés** : une période à `start = null`
s'affiche « période inconnue » sans bloquer.

### Types d'événements

| Type | Effet sur l'état | Champs spécifiques |
|---|---|---|
| `COMPANY_RENAME` | nom de la société | `newName` |
| `ACQUISITION` | propriétaire | `acquirerCompanyId`/`acquirerNameRaw`, `outcome` |
| `DIVESTMENT` | fin de détention → `INDEPENDENT` | `note` |
| `MERGER` | statut `MERGED` | `withCompanyId` |
| `SHUTDOWN` | statut `DEFUNCT` | — |
| `SOLUTION_RENAME` | nom de la solution | `newName` |
| `SOLUTION_TRANSFER` | éditeur de la solution | `newOwnerCompanyId` |
| `SOLUTION_LAUNCH` | solution active | — |
| `SOLUTION_DISCONTINUED` | solution arrêtée | — |
| `SOLUTION_INTEGRATED` | solution absorbée dans une autre (statut `INTEGRATED`) | `intoSolutionId` |
| `FUNDING`, `OTHER` | aucun (informatif) | `amount`, `round` |

**Intégration solution-dans-solution (`SOLUTION_INTEGRATED`).** Symétrique du
`MERGER` des sociétés : une solution cesse d'exister de façon autonome parce
qu'elle est absorbée dans une autre (ex : *ITDR Spotlight* et *ITDR Shadow*
intégrées dans *SIPM* chez Proofpoint). La solution absorbée passe au statut
dérivé `INTEGRATED` (distinct de `DISCONTINUED`) avec un lien vers la solution
hôte ; la fiche hôte affiche une section **« Intègre : … »** dérivée
(`solutionsIntegratedInto` dans `lib/queries.ts`). Un `SOLUTION_LAUNCH`
ultérieur ré-extrait la solution (retour à `ACTIVE`). À ne PAS utiliser quand
les modules restent vendables séparément : dans ce cas on garde deux solutions
actives.

### Validation à la saisie

Puisque l'état est calculé, la validation ne porte que sur la **cohérence de
la suite d'événements** (`validateCompanyEvents` / `validateSolutionEvents`) :

- événement antérieur à la création → **erreur** ;
- deux événements de même dimension à exactement la même date → **erreur**
  (ordre ambigu) ;
- `DIVESTMENT` sans détention en cours → **erreur** ;
- `SOLUTION_INTEGRATED` d'une solution dans elle-même → **erreur** ;
- événement postérieur à un `SHUTDOWN` → **avertissement** (non bloquant).

L'éditeur d'historique de l'admin appelle `/api/events/preview` à chaque
saisie : l'utilisateur voit la frise recalculée **avant** d'enregistrer.

### Ingérer un historique antérieur (ancre reculée)

Les champs « à la création » d'une entité (`initialName`, `initialCompanyId`,
date de lancement) sont l'**ancre** des chaînes dérivées. Découvrir un passé
plus ancien = reculer l'ancre + insérer les événements correspondants.
L'assistant **« Ajouter un historique antérieur »** (`PrependHistoryForm` +
`POST /api/solutions/[id]/prepend-history`) automatise ce geste pour les
solutions : il déplace l'ancre vers les anciennes valeurs et crée les
`SOLUTION_RENAME` / `SOLUTION_TRANSFER` datés, le tout dans une transaction.

### Dates à précision variable

Toutes les dates sont `year` (obligatoire) + `month` (1-12, optionnel) —
jamais un type `Date`. Helpers dans `lib/date.ts` (comparaison : un mois
absent = début d'année ; formatage `"2021"` / `"mars 2021"` / `"March 2021"` ;
plages `"2015 – 2019"` / `"depuis 2023"`).

### Performance

La dérivation se fait en mémoire à la lecture (`lib/queries.ts` :
`loadMarket()` charge entités **avec** leurs événements en une requête,
`React.cache` la partage dans la requête HTTP — pas de N+1). Si le volume
l'exigeait un jour : dénormaliser les champs dérivés dans des colonnes
recalculées à chaque écriture d'événement (jamais éditables). Non nécessaire
en v1.

## 4. Arborescence

```
CyberMarketTrack/
├── LISEZMOI.txt          # explique la séparation site/ / runtime/
├── runtime/node_modules  # dépendances installées (JAMAIS sur GitHub)
└── site/                 # LE CODE SOURCE (dépôt GitHub)
    ├── app/              # pages (App Router)
    │   ├── (public)     : /, /companies, /solutions, /tags, /news, /search,
    │   │                  /comparators
    │   ├── admin/       : CRUD, éditeur d'historique, import CSV, audit,
    │   │                  fiches à revoir, backup
    │   ├── api/         : routes de mutation (Zod + session + AuditLog)
    │   └── login/
    ├── components/       # composants React (ui/ = shadcn, admin/, comparator/)
    ├── lib/              # cœur : timeline.ts, date.ts, queries.ts, backup.ts,
    │   │                 # comparator.ts, validation.ts, auth.ts, csv.ts…
    │   └── generated/    # client Prisma généré (gitignoré)
    ├── prisma/           # schema.prisma, migrations/, seed.ts
    ├── messages/         # fr.json / en.json (toutes les chaînes UI)
    ├── i18n/             # config next-intl (locale par cookie)
    ├── scripts/          # backup.ts (npm run backup)
    ├── data/             # cybermarkettrack.db + backups/ (gitignoré)
    ├── proxy.ts          # middleware Next 16 : protection /admin + API
    └── auth.config.ts    # config Auth.js edge-safe (sans Prisma)
```

## 5. Sécurité

1. Zod sur **toutes** les entrées, côté serveur (les formulaires réutilisent
   les mêmes schémas — `lib/validation.ts`).
2. Markdown assaini par `rehype-sanitize` (aucun HTML brut ne passe).
3. Prisma uniquement, pas de SQL brut.
4. Auth : bcrypt (12 rounds), sessions JWT `HttpOnly`/`SameSite=Lax`, CSRF
   natif Auth.js, rate limiting login 5/min (`lib/rate-limit.ts`).
5. Headers (dans `next.config.ts`) : CSP stricte (`unsafe-eval` uniquement en
   dev), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS.
6. Défense en profondeur : le proxy filtre `/admin` et les mutations API, ET
   chaque route de mutation re-vérifie la session (`requireAdmin`).
7. Aucun secret en dur : `.env` (gitignoré) + `.env.example` documenté.
8. Imports (CSV, JSON) : validation stricte de schéma avant toute écriture,
   limites de taille (CSV 1 Mo, restauration 50 Mo, comparateur borné).
9. Erreurs génériques côté client, détail dans les logs serveur.

## 6. Formats d'échange

### Export JSON complet (backup)

`{ "version": 1, "exportedAt": "...", "tables": { users, tags, companies,
companyTypes, solutions, solutionTags, events, revenues, aliases, comparators,
auditLogs } }` — produit par `/api/backup/export` et `npm run backup`,
ré-importable via `/admin/backup` (validation stricte, transaction atomique).
Le many-to-many solution↔tag est aplati en paires `solutionTags`.

### Comparateurs

`Comparator.content` est un JSON versionné :

```json
{
  "version": 1,
  "orientation": "itemsAsRows | itemsAsColumns",
  "items": [{ "kind": "company|solution", "id": "…" }],
  "defaultAttributes": ["logo", "country", …],
  "categories": [{ "id", "name" }],
  "criteria": [{ "id", "name", "type": "boolean|text|rating|number|solution", "categoryId" }],
  "values": { "<kind>:<id>|<criterionId>": { "t": "…", … } }
}
```

Les valeurs des critères personnalisés sont **figées** ; les
`defaultAttributes` sont **recalculés** à l'affichage (noms dérivés compris).
Les cellules `solution` contiguës identiques d'une même ligne fusionnent en
barre de couverture au rendu. Export/import JSON = `{ "name": …, ...contenu }`.

### Modèles CSV (import en masse)

Un modèle téléchargeable par type dans `/admin/import` (`lib/csv.ts`) :

- `companies` : `initialName,types,foundedYear,foundedMonth,country,originCountry,description,website` (types séparés par `|`)
- `solutions` : `initialName,initialCompany,launchYear,launchMonth,description,website,tags` (tags = slugs séparés par `|`)
- `tags` : `slug,family,labelFr,labelEn,category`
- `events` : `type,subjectCompany,subjectSolution,year,month,newName,acquirer,outcome,withCompany,newOwner,intoSolution,amount,round,note,description` (`intoSolution` = solution hôte pour `SOLUTION_INTEGRATED`, référencée par son nom)

Les entités sont référencées **par nom** (nom courant, nom historique dérivé
ou alias). Les lignes peuvent être dans n'importe quel ordre. Délimiteur `,`
ou `;` (auto-détecté). Prévisualisation (dry-run) avant écriture.

## 7. Chemin d'évolution prévu

| Évolution | Préparé par |
|---|---|
| PostgreSQL | Schéma sans spécificité SQLite ; `String` → enums natifs ; changer l'adapter + `prisma.config.ts` |
| Multi-utilisateurs | Table `User` + champ `role` déjà en place ; `AuditLog.userId` trace déjà l'auteur |
| SAML / OIDC | Auth.js : ajouter un provider dans `lib/auth.ts` ; les callbacks JWT/session sont déjà factorisés |
| RBAC | Étendre `USER_ROLES` (`lib/constants.ts`) et les tests de rôle (`requireAdmin`) |
| Mode collaboratif | AuditLog par utilisateur = fondation de la traçabilité |
| Volumétrie | Dénormalisation des champs dérivés (voir §3 Performance) |

## 8. Maintenance

- `npm test` : 36 tests unitaires du cœur temporel (à faire tourner avant
  toute modification de `lib/timeline.ts` ou `lib/date.ts`).
- `npm run build` : doit passer avant tout déploiement.
- `npm audit` : vérifier régulièrement les vulnérabilités des dépendances
  (voir README §Mise à jour).
- Le badge « à revérifier » et la page admin « Fiches à revoir » servent de
  liste de travail pour la fraîcheur des données (seuil `FRESHNESS_MONTHS`).
