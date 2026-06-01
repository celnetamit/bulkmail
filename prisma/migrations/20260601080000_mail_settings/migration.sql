-- CreateTable
CREATE TABLE "MailSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "awsRegion" TEXT,
    "awsFromEmail" TEXT,
    "awsAccessKeyIdEncrypted" TEXT,
    "awsSecretAccessKeyEncrypted" TEXT,
    "awsSessionTokenEncrypted" TEXT,
    "resendApiKeyEncrypted" TEXT,
    "resendFromEmail" TEXT,
    "webhookSharedSecretEncrypted" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MailSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MailSettings_userId_key" ON "MailSettings"("userId");
