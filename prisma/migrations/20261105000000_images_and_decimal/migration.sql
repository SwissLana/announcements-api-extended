ALTER TABLE "Announcement" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "Announcement" ALTER COLUMN "price" TYPE DECIMAL(12,2) USING ROUND("price"::numeric, 2);
