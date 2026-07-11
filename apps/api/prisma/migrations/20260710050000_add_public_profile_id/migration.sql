ALTER TABLE "User" ADD COLUMN "publicId" TEXT;
ALTER TABLE "User" ADD COLUMN "publicIdUpdatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "profilePublic" BOOLEAN NOT NULL DEFAULT true;
UPDATE "User" SET "publicId" = 'u_' || lower(substr("id", 1, 18)) WHERE "publicId" IS NULL;
CREATE UNIQUE INDEX "User_publicId_key" ON "User"("publicId");
