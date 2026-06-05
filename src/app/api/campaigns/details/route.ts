import { performance } from 'node:perf_hooks';
import { NextResponse } from 'next/server';
import { requireUserFromCookies } from '@/lib/auth';
import { buildOwnerScope } from '@/lib/data-scope';
import { queryRows } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function buildInClause(values: string[]) {
  return values.map(() => '?').join(', ');
}

type CampaignDetailPayload = {
  details: Record<string, {
    lists: { id: string; name: string; isDefaultTestList: number | boolean }[];
    listCount: number;
    openedCount: number;
    deliveredCount: number;
    bouncedCount: number;
    unsubscribedCount: number;
  }>;
};

function okWithHeaders(payload: CampaignDetailPayload, durationMs: number, campaignCount: number) {
  return NextResponse.json(payload, {
    status: 200,
    headers: {
      'x-campaign-details-duration-ms': durationMs.toFixed(2),
      'x-campaign-details-campaign-count': String(campaignCount),
    },
  });
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const url = new URL(request.url);
  const ids = Array.from(new Set(
    (url.searchParams.get('ids') || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ));

  if (ids.length === 0) {
    return okWithHeaders({ details: {} }, performance.now() - startedAt, 0);
  }

  const ownerScope = buildOwnerScope(auth.user, 'c."userId"');
  const idInClause = buildInClause(ids);

  const visibleCampaignRows = queryRows<{ id: string; listId: string; listName: string }>(
    `
      SELECT c.id, c."listId", l.name as listName
      FROM "Campaign" c
      INNER JOIN "List" l ON l.id = c."listId"
      WHERE c.id IN (${idInClause}) AND ${ownerScope.clause}
    `,
    [...ids, ...ownerScope.params],
  );

  if (visibleCampaignRows.length === 0) {
    return okWithHeaders({ details: {} }, performance.now() - startedAt, 0);
  }

  const visibleCampaignIds = visibleCampaignRows.map((row) => row.id);
  const visibleIdInClause = buildInClause(visibleCampaignIds);

  const eventRows = queryRows<{
    campaignId: string;
    openedCount: number;
    deliveredCount: number;
    bouncedCount: number;
    unsubscribedCount: number;
  }>(
    `
      SELECT
        e."campaignId" as "campaignId",
        SUM(CASE WHEN e.type = 'OPENED' THEN 1 ELSE 0 END) as "openedCount",
        SUM(CASE WHEN e.type = 'DELIVERED' THEN 1 ELSE 0 END) as "deliveredCount",
        SUM(CASE WHEN e.type = 'BOUNCED' THEN 1 ELSE 0 END) as "bouncedCount",
        SUM(CASE WHEN e.type = 'UNSUBSCRIBED' THEN 1 ELSE 0 END) as "unsubscribedCount"
      FROM "Event" e
      WHERE e."campaignId" IN (${visibleIdInClause})
      GROUP BY e."campaignId"
    `,
    visibleCampaignIds,
  );

  const campaignListRows = queryRows<{
    campaignId: string;
    listId: string;
    listName: string;
    isDefaultTestList: number | boolean;
  }>(
    `
      SELECT
        cl."campaignId" as "campaignId",
        cl."listId" as "listId",
        l.name as listName,
        CASE WHEN COALESCE(l."isDefaultTestList", FALSE) THEN 1 ELSE 0 END as "isDefaultTestList"
      FROM "CampaignList" cl
      INNER JOIN "List" l ON l.id = cl."listId"
      WHERE cl."campaignId" IN (${visibleIdInClause})
      ORDER BY cl."createdAt" ASC
    `,
    visibleCampaignIds,
  );

  const countsByCampaign = new Map<string, {
    openedCount: number;
    deliveredCount: number;
    bouncedCount: number;
    unsubscribedCount: number;
  }>();
  const listsByCampaign = new Map<string, { id: string; name: string; isDefaultTestList: number | boolean }[]>();

  for (const row of eventRows) {
    countsByCampaign.set(row.campaignId, {
      openedCount: Number(row.openedCount || 0),
      deliveredCount: Number(row.deliveredCount || 0),
      bouncedCount: Number(row.bouncedCount || 0),
      unsubscribedCount: Number(row.unsubscribedCount || 0),
    });
  }

  for (const row of campaignListRows) {
    if (!listsByCampaign.has(row.campaignId)) listsByCampaign.set(row.campaignId, []);
    listsByCampaign.get(row.campaignId)!.push({
      id: row.listId,
      name: row.listName,
      isDefaultTestList: row.isDefaultTestList,
    });
  }

  const details = Object.fromEntries(
    visibleCampaignRows.map((campaign) => {
      const lists = listsByCampaign.get(campaign.id) || [{ id: campaign.listId, name: campaign.listName, isDefaultTestList: false }];
      const counts = countsByCampaign.get(campaign.id);
      return [
        campaign.id,
        {
          lists,
          listCount: lists.length,
          openedCount: counts?.openedCount || 0,
          deliveredCount: counts?.deliveredCount || 0,
          bouncedCount: counts?.bouncedCount || 0,
          unsubscribedCount: counts?.unsubscribedCount || 0,
        },
      ];
    }),
  );

  return okWithHeaders({ details }, performance.now() - startedAt, visibleCampaignRows.length);
}
