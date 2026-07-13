-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adminPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "MessageFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "snapshotMessageId" TEXT,
    "snapshotConversationId" TEXT,
    "snapshotConversationTitle" TEXT,
    "snapshotConversationType" TEXT,
    "snapshotSenderId" TEXT,
    "snapshotSenderName" TEXT,
    "snapshotType" TEXT,
    "snapshotBody" TEXT,
    "snapshotMediaUrl" TEXT,
    "snapshotThumbnailUrl" TEXT,
    "snapshotTranscript" TEXT,
    "snapshotSourceLanguage" TEXT,
    "snapshotTranslations" JSONB,
    "snapshotCreatedAt" TIMESTAMP(3),

    CONSTRAINT "MessageFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "MessageFavorite_messageId_idx" ON "MessageFavorite"("messageId");

-- CreateIndex
CREATE INDEX "MessageFavorite_userId_createdAt_idx" ON "MessageFavorite"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageFavorite_userId_idx" ON "MessageFavorite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageFavorite_userId_messageId_key" ON "MessageFavorite"("userId", "messageId");

-- AddForeignKey
ALTER TABLE "MessageFavorite" ADD CONSTRAINT "MessageFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageFavorite" ADD CONSTRAINT "MessageFavorite_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

