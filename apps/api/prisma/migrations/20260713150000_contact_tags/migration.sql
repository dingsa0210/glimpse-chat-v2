CREATE TABLE "ContactTag" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactTag_ownerId_contactId_label_key" ON "ContactTag"("ownerId", "contactId", "label");
CREATE INDEX "ContactTag_ownerId_contactId_idx" ON "ContactTag"("ownerId", "contactId");
CREATE INDEX "ContactTag_ownerId_label_idx" ON "ContactTag"("ownerId", "label");

ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
