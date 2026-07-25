-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "initialName" TEXT NOT NULL,
    "foundedYear" INTEGER,
    "foundedMonth" INTEGER,
    "country" TEXT NOT NULL,
    "originCountry" TEXT,
    "description" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Company" ("country", "createdAt", "description", "foundedMonth", "foundedYear", "id", "initialName", "logoUrl", "originCountry", "updatedAt", "website") SELECT "country", "createdAt", "description", "foundedMonth", "foundedYear", "id", "initialName", "logoUrl", "originCountry", "updatedAt", "website" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
