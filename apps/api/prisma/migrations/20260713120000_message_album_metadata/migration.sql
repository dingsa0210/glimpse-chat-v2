ALTER TABLE "Message" ADD COLUMN "albumId" TEXT;
ALTER TABLE "Message" ADD COLUMN "albumIndex" INTEGER;
ALTER TABLE "Message" ADD COLUMN "albumSize" INTEGER;
CREATE INDEX "Message_albumId_idx" ON "Message"("albumId");
