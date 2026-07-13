ALTER TABLE "Message" ALTER COLUMN "sourceLanguage" TYPE TEXT USING LOWER("sourceLanguage"::TEXT);
