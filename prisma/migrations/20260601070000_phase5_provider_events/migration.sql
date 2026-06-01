-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "provider" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "provider" TEXT;
ALTER TABLE "Event" ADD COLUMN "providerEventId" TEXT;
ALTER TABLE "Event" ADD COLUMN "providerMessageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Event_providerEventId_key" ON "Event"("providerEventId");

