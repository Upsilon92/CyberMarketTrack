-- Company: split `description` into descriptionFr / descriptionEn (preserve data)
ALTER TABLE "Company" ADD COLUMN "descriptionFr" TEXT;
ALTER TABLE "Company" ADD COLUMN "descriptionEn" TEXT;
UPDATE "Company" SET "descriptionFr" = "description";
ALTER TABLE "Company" DROP COLUMN "description";

-- Solution: same split
ALTER TABLE "Solution" ADD COLUMN "descriptionFr" TEXT;
ALTER TABLE "Solution" ADD COLUMN "descriptionEn" TEXT;
UPDATE "Solution" SET "descriptionFr" = "description";
ALTER TABLE "Solution" DROP COLUMN "description";
