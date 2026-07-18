CREATE TABLE "ContactMemo" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "images" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactMemo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactMemo_ownerId_contactId_key" ON "ContactMemo"("ownerId", "contactId");
CREATE INDEX "ContactMemo_ownerId_updatedAt_idx" ON "ContactMemo"("ownerId", "updatedAt");

ALTER TABLE "ContactMemo" ADD CONSTRAINT "ContactMemo_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactMemo" ADD CONSTRAINT "ContactMemo_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
