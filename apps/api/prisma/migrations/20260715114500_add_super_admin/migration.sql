-- These runtime fields predated their checked-in migration. Keep the repair
-- idempotent so this migration works for both existing and clean databases.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
  END IF;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "disabledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'USER',
  ADD COLUMN IF NOT EXISTS "profileBio" TEXT,
  ADD COLUMN IF NOT EXISTS "profileCompany" TEXT,
  ADD COLUMN IF NOT EXISTS "profileLocation" TEXT,
  ADD COLUMN IF NOT EXISTS "profileTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "adminPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User"
SET "isSuperAdmin" = true
WHERE id = (
  SELECT id
  FROM "User"
  WHERE role = 'ADMIN' AND "disabledAt" IS NULL
  ORDER BY "createdAt" ASC, id ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM "User" WHERE "isSuperAdmin" = true
);
