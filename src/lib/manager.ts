import { NextResponse } from 'next/server';
import { AuthUser, requireUserFromCookies } from '@/lib/auth';
import { executeSql } from '@/lib/sqlite';

let managerSchemaInitialized = false;

export function ensureManagerSchema() {
  if (managerSchemaInitialized) return;

  executeSql(`
    CREATE TABLE IF NOT EXISTS "Team" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "dailyCreditLimit" INTEGER NOT NULL DEFAULT 100000,
      "managerId" TEXT NOT NULL,
      "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Team_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
  executeSql('CREATE INDEX IF NOT EXISTS "Team_managerId_idx" ON "Team" ("managerId")');
  executeSql(`
    CREATE TABLE IF NOT EXISTS "TeamMember" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "teamId" TEXT NOT NULL,
      "userId" TEXT NOT NULL UNIQUE,
      "allocatedDailyLimit" INTEGER NOT NULL DEFAULT 100000,
      "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  executeSql('CREATE INDEX IF NOT EXISTS "TeamMember_teamId_idx" ON "TeamMember" ("teamId")');

  managerSchemaInitialized = true;
}

export async function requireManagerOrAdminFromCookies(): Promise<{ user: AuthUser } | { error: NextResponse }> {
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth;

  if (!['MANAGER', 'ADMIN'].includes(auth.user.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return auth;
}
