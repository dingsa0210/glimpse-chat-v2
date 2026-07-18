CREATE TABLE IF NOT EXISTS "MessageFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
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
    "snapshotCreatedAt" TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'MessageFavorite_pkey'
          AND conrelid = '"MessageFavorite"'::regclass
    ) THEN
        ALTER TABLE "MessageFavorite"
            ADD CONSTRAINT "MessageFavorite_pkey" PRIMARY KEY ("id");
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'SystemSetting_pkey'
          AND conrelid = '"SystemSetting"'::regclass
    ) THEN
        ALTER TABLE "SystemSetting"
            ADD CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key");
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'MessageFavorite_userId_fkey'
          AND conrelid = '"MessageFavorite"'::regclass
    ) THEN
        ALTER TABLE "MessageFavorite"
            ADD CONSTRAINT "MessageFavorite_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'MessageFavorite_messageId_fkey'
          AND conrelid = '"MessageFavorite"'::regclass
    ) THEN
        ALTER TABLE "MessageFavorite"
            ADD CONSTRAINT "MessageFavorite_messageId_fkey"
            FOREIGN KEY ("messageId") REFERENCES "Message"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "MessageFavorite_userId_messageId_key"
    ON "MessageFavorite"("userId", "messageId");

CREATE INDEX IF NOT EXISTS "MessageFavorite_messageId_idx"
    ON "MessageFavorite"("messageId");

CREATE INDEX IF NOT EXISTS "MessageFavorite_userId_createdAt_idx"
    ON "MessageFavorite"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "MessageFavorite_userId_idx"
    ON "MessageFavorite"("userId");
