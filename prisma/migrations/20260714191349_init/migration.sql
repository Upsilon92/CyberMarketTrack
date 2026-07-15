-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "initialName" TEXT NOT NULL,
    "foundedYear" INTEGER NOT NULL,
    "foundedMonth" INTEGER,
    "country" TEXT NOT NULL,
    "originCountry" TEXT,
    "description" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CompanyTypeAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    CONSTRAINT "CompanyTypeAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Solution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "initialName" TEXT NOT NULL,
    "initialCompanyId" TEXT NOT NULL,
    "description" TEXT,
    "features" TEXT,
    "launchYear" INTEGER,
    "launchMonth" INTEGER,
    "website" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Solution_initialCompanyId_fkey" FOREIGN KEY ("initialCompanyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "labelFr" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "category" TEXT
);

-- CreateTable
CREATE TABLE "Event" (
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
    "amount" REAL,
    "round" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Event_subjectCompanyId_fkey" FOREIGN KEY ("subjectCompanyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_subjectSolutionId_fkey" FOREIGN KEY ("subjectSolutionId") REFERENCES "Solution" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_acquirerCompanyId_fkey" FOREIGN KEY ("acquirerCompanyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Event_withCompanyId_fkey" FOREIGN KEY ("withCompanyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Event_newOwnerCompanyId_fkey" FOREIGN KEY ("newOwnerCompanyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Revenue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "source" TEXT,
    CONSTRAINT "Revenue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "companyId" TEXT,
    "solutionId" TEXT,
    CONSTRAINT "Alias_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Alias_solutionId_fkey" FOREIGN KEY ("solutionId") REFERENCES "Solution" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Comparator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_SolutionToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_SolutionToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Solution" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_SolutionToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CompanyTypeAssignment_type_idx" ON "CompanyTypeAssignment"("type");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyTypeAssignment_companyId_type_key" ON "CompanyTypeAssignment"("companyId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "Tag_family_idx" ON "Tag"("family");

-- CreateIndex
CREATE INDEX "Event_subjectCompanyId_idx" ON "Event"("subjectCompanyId");

-- CreateIndex
CREATE INDEX "Event_subjectSolutionId_idx" ON "Event"("subjectSolutionId");

-- CreateIndex
CREATE INDEX "Event_type_idx" ON "Event"("type");

-- CreateIndex
CREATE INDEX "Event_year_month_idx" ON "Event"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Revenue_companyId_year_key" ON "Revenue"("companyId", "year");

-- CreateIndex
CREATE INDEX "Alias_name_idx" ON "Alias"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "_SolutionToTag_AB_unique" ON "_SolutionToTag"("A", "B");

-- CreateIndex
CREATE INDEX "_SolutionToTag_B_index" ON "_SolutionToTag"("B");
