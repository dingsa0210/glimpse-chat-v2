CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'FILE';

ALTER TABLE "Message"
ADD COLUMN "mediaThumbnailUrl" TEXT,
ADD COLUMN "revokedAt" TIMESTAMP(3),
ADD COLUMN "transcript" TEXT;

ALTER TABLE "User"
ADD COLUMN "disabledAt" TIMESTAMP(3),
ADD COLUMN "profileBio" TEXT,
ADD COLUMN "profileCompany" TEXT,
ADD COLUMN "profileLocation" TEXT,
ADD COLUMN "profileTitle" TEXT,
ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';

CREATE TABLE "UserBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "message" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");
CREATE INDEX "Feedback_userId_createdAt_idx" ON "Feedback"("userId", "createdAt");
CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");

ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey"
FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey"
FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
