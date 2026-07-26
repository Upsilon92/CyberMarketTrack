-- CreateTable
CREATE TABLE "FeedItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "relevant" BOOLEAN,
    "proposalId" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "FeedItem_url_key" ON "FeedItem"("url");

-- CreateIndex
CREATE INDEX "FeedItem_status_createdAt_idx" ON "FeedItem"("status", "createdAt");
