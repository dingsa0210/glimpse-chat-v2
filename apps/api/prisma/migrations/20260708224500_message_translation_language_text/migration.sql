ALTER TABLE "MessageTranslation" ALTER COLUMN "language" TYPE TEXT USING LOWER("language"::TEXT);
