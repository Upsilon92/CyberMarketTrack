-- Event: split single `description` into bilingual FR/EN + add two source URLs.
-- Data-preserving: the old `description` is copied into `descriptionFr`
-- (existing narratives were written in French) before the column is dropped.
ALTER TABLE "Event" ADD COLUMN "descriptionFr" TEXT;
ALTER TABLE "Event" ADD COLUMN "descriptionEn" TEXT;
ALTER TABLE "Event" ADD COLUMN "url1" TEXT;
ALTER TABLE "Event" ADD COLUMN "url2" TEXT;

UPDATE "Event" SET "descriptionFr" = "description"
  WHERE "description" IS NOT NULL AND "description" != '';

ALTER TABLE "Event" DROP COLUMN "description";
