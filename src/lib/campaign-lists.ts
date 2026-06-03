import { executeSql, queryRow, queryRows } from '@/lib/sqlite';

export type CampaignListSelection = {
  id: string;
  name: string;
  isDefaultTestList: number | boolean;
};

function uniqueListIds(listIds: string[]) {
  return Array.from(new Set(listIds.map((listId) => listId.trim()).filter(Boolean)));
}

function buildPlaceholders(count: number) {
  return Array.from({ length: count }, () => '?').join(', ');
}

export function getCampaignLists(campaignId: string, userId: string) {
  return queryRows<CampaignListSelection>(
    `
      SELECT
        l.id,
        l.name,
        CASE WHEN COALESCE(l."isDefaultTestList", FALSE) THEN 1 ELSE 0 END as "isDefaultTestList"
      FROM "CampaignList" cl
      INNER JOIN "Campaign" c ON c.id = cl."campaignId"
      INNER JOIN "List" l ON l.id = cl."listId"
      WHERE cl."campaignId" = ? AND c."userId" = ?
      ORDER BY cl."createdAt" ASC
    `,
    [campaignId, userId],
  );
}

export function getCampaignListIds(campaignId: string, userId: string) {
  return getCampaignLists(campaignId, userId).map((list) => list.id);
}

export function replaceCampaignLists(campaignId: string, userId: string, listIds: string[]) {
  const selectedListIds = uniqueListIds(listIds);

  if (selectedListIds.length === 0) {
    throw new Error('At least one list is required.');
  }

  const placeholders = buildPlaceholders(selectedListIds.length);
  const ownedLists = queryRows<{ id: string }>(
    `
      SELECT id
      FROM "List"
      WHERE "userId" = ? AND id IN (${placeholders})
    `,
    [userId, ...selectedListIds],
  );

  if (ownedLists.length !== selectedListIds.length) {
    throw new Error('One or more lists were not found.');
  }

  executeSql('DELETE FROM "CampaignList" WHERE "campaignId" = ?', [campaignId]);

  const timestamp = new Date().toISOString();
  for (const listId of selectedListIds) {
    executeSql(
      `
        INSERT INTO "CampaignList" (
              id, "campaignId", "listId", "createdAt", "updatedAt"
            ) VALUES (?, ?, ?, ?, ?)
      `,
      [crypto.randomUUID().replace(/-/g, ''), campaignId, listId, timestamp, timestamp],
    );
  }

  return selectedListIds;
}

export function getDefaultTestList(userId: string) {
  return queryRow<CampaignListSelection>(
    `
      SELECT
        id,
        name,
        CASE WHEN COALESCE("isDefaultTestList", FALSE) THEN 1 ELSE 0 END as "isDefaultTestList"
      FROM "List"
      WHERE "userId" = ? AND COALESCE("isDefaultTestList", FALSE) = TRUE
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `,
    [userId],
  );
}

export function setDefaultTestList(listId: string, userId: string) {
  const list = queryRow<CampaignListSelection>(
    `
      SELECT
        id,
        name,
        CASE WHEN COALESCE("isDefaultTestList", FALSE) THEN 1 ELSE 0 END as "isDefaultTestList"
      FROM "List"
      WHERE id = ? AND "userId" = ?
      LIMIT 1
    `,
    [listId, userId],
  );

  if (!list) {
    throw new Error('List not found.');
  }

  executeSql('UPDATE "List" SET "isDefaultTestList" = FALSE, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = ?', [userId]);
  executeSql(
    'UPDATE "List" SET "isDefaultTestList" = TRUE, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ? AND "userId" = ?',
    [listId, userId],
  );

  return {
    id: list.id,
    name: list.name,
    isDefaultTestList: true,
  };
}
