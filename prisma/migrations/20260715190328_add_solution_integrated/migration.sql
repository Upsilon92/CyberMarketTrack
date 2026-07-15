-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "description" TEXT,
    "subjectCompanyId" TEXT,
    "subjectSolutionId" TEXT,
    "newName" TEXT,
    "acquirerCompanyId" TEXT,
    "acquirerNameRaw" TEXT,
    "outcome" TEXT,
    "withCompanyId" TEXT,
    "newOwnerCompanyId" TEXT,
    "intoSolutionId" TEXT,
    "amount" REAL,
    "round" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Event_subjectCompanyId_fkey" FOREIGN KEY ("subjectCompanyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_subjectSolutionId_fkey" FOREIGN KEY ("subjectSolutionId") REFERENCES "Solution" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_acquirerCompanyId_fkey" FOREIGN KEY ("acquirerCompanyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Event_withCompanyId_fkey" FOREIGN KEY ("withCompanyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Event_newOwnerCompanyId_fkey" FOREIGN KEY ("newOwnerCompanyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Event_intoSolutionId_fkey" FOREIGN KEY ("intoSolutionId") REFERENCES "Solution" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Event" ("acquirerCompanyId", "acquirerNameRaw", "amount", "createdAt", "description", "id", "month", "newName", "newOwnerCompanyId", "note", "outcome", "round", "subjectCompanyId", "subjectSolutionId", "type", "updatedAt", "withCompanyId", "year") SELECT "acquirerCompanyId", "acquirerNameRaw", "amount", "createdAt", "description", "id", "month", "newName", "newOwnerCompanyId", "note", "outcome", "round", "subjectCompanyId", "subjectSolutionId", "type", "updatedAt", "withCompanyId", "year" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE INDEX "Event_subjectCompanyId_idx" ON "Event"("subjectCompanyId");
CREATE INDEX "Event_subjectSolutionId_idx" ON "Event"("subjectSolutionId");
CREATE INDEX "Event_intoSolutionId_idx" ON "Event"("intoSolutionId");
CREATE INDEX "Event_type_idx" ON "Event"("type");
CREATE INDEX "Event_year_month_idx" ON "Event"("year", "month");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
