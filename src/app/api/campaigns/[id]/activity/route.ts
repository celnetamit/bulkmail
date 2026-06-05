import { performance } from 'node:perf_hooks';
import { NextResponse } from 'next/server';
import { requireUserFromCookies } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { buildOwnerScope } from '@/lib/data-scope';
import { queryRow, queryRows } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: { id: string } };

type ProgressPoint = {
  id: string;
  eventType: string;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  recipientCount: number;
  durationMs: number | null;
  note: string | null;
  createdAt: string;
};

function parseProgressNote(note: string | null) {
  if (!note) return {};
  return Object.fromEntries(
    note
      .split(';')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .map((segment) => {
        const [key, ...rest] = segment.split(':');
        return [key, rest.join(':')];
      }),
  );
}

function jsonWithCampaignActivityTimingHeaders(
  payload: {
    campaign: unknown;
    latestJob: unknown;
    live: unknown;
    progressTimeline: unknown[];
    systemEvents: unknown[];
  },
  input: {
    durationMs: number;
    hasLatestJob: boolean;
    progressPointCount: number;
    systemEventCount: number;
  },
) {
  return NextResponse.json(payload, {
    status: 200,
    headers: {
      'x-campaign-activity-duration-ms': input.durationMs.toFixed(2),
      'x-campaign-activity-has-job': input.hasLatestJob ? '1' : '0',
      'x-campaign-activity-progress-count': String(input.progressPointCount),
      'x-campaign-activity-system-events-count': String(input.systemEventCount),
    },
  });
}

export async function GET(_: Request, { params }: Params) {
  const startedAt = performance.now();
  const auth = await requireUserFromCookies();
  if ('error' in auth) return auth.error;

  const ownerScope = buildOwnerScope(auth.user, 'c."userId"');
  const campaign = queryRow<{ id: string; status: string; totalRecipients: number; sentCount: number; failedCount: number; skippedCount: number }>(
    `
      SELECT c.id, c.status, c."totalRecipients", c."sentCount", c."failedCount", c."skippedCount"
      FROM "Campaign" c
      WHERE c.id = ? AND ${ownerScope.clause}
      LIMIT 1
    `,
    [params.id, ...ownerScope.params],
  );

  if (!campaign) return fail('Campaign not found.', 404);

  const latestJob = queryRow<{
    id: string;
    status: string;
    attempts: number;
    provider: string | null;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    quotaSkippedCount: number;
    remainingToday: number;
    requestedAt: string;
    startedAt: string | null;
    nextRunAt: string | null;
    finishedAt: string | null;
    lastError: string | null;
    skipReason: string | null;
    updatedAt: string;
  }>(
    `
      SELECT
        id, status, attempts, provider, "totalRecipients", "sentCount", "failedCount", "skippedCount",
        "quotaSkippedCount", "remainingToday", "requestedAt", "startedAt", "nextRunAt", "finishedAt",
        "lastError", "skipReason", "updatedAt"
      FROM "CampaignSendJob"
      WHERE "campaignId" = ?
      ORDER BY "createdAt" DESC
      LIMIT 1
    `,
    [params.id],
  );

  const systemEvents = queryRows<{
    id: string;
    level: string;
    source: string;
    message: string;
    details: string | null;
    createdAt: string;
  }>(
    `
      SELECT id, level, source, message, details, "createdAt"
      FROM "SystemEvent"
      WHERE "campaignId" = ?
      ORDER BY "createdAt" DESC
      LIMIT 30
    `,
    [params.id],
  ).map((event) => ({
    ...event,
    details: event.details,
  }));

  const resourceMetrics = queryRows<ProgressPoint>(
    `
      SELECT
        id,
        "eventType",
        "sentCount",
        "failedCount",
        "skippedCount",
        "recipientCount",
        "durationMs",
        note,
        "createdAt"
      FROM "ResourceMetric"
      WHERE "campaignId" = ?
        AND "eventType" IN ('SEND_START', 'SEND_PROGRESS', 'SEND_COMPLETE')
      ORDER BY "createdAt" ASC
      LIMIT 120
    `,
    [params.id],
  );

  const progressTimeline = resourceMetrics.map((point, index) => {
    const previous = index > 0 ? resourceMetrics[index - 1] : null;
    const durationDeltaMs =
      point.durationMs != null && previous?.durationMs != null ? Math.max(1, point.durationMs - previous.durationMs) : null;
    const sentDelta = previous ? Math.max(0, point.sentCount - previous.sentCount) : point.sentCount;
    const failedDelta = previous ? Math.max(0, point.failedCount - previous.failedCount) : point.failedCount;
    const processedDelta = sentDelta + failedDelta;
    const throughputPerSecond =
      durationDeltaMs && processedDelta > 0 ? Number(((processedDelta / durationDeltaMs) * 1000).toFixed(2)) : 0;
    return {
      ...point,
      noteParts: parseProgressNote(point.note),
      throughputPerSecond,
    };
  });

  const latestPoint = progressTimeline.length > 0 ? progressTimeline[progressTimeline.length - 1] : null;

  const payload = {
    campaign,
    latestJob,
    live: {
      processedCount: latestJob ? latestJob.sentCount + latestJob.failedCount : campaign.sentCount + campaign.failedCount,
      remainingCount: Math.max(
        0,
        (latestJob?.totalRecipients || campaign.totalRecipients || 0) -
          (latestJob ? latestJob.sentCount + latestJob.failedCount + latestJob.skippedCount : campaign.sentCount + campaign.failedCount + campaign.skippedCount),
      ),
      throughputPerSecond: latestPoint?.throughputPerSecond || 0,
      progressPercent:
        (latestJob?.totalRecipients || campaign.totalRecipients || 0) > 0
          ? Math.min(
              100,
              (((latestJob?.sentCount || campaign.sentCount) + (latestJob?.failedCount || campaign.failedCount)) /
                (latestJob?.totalRecipients || campaign.totalRecipients)) *
                100,
            )
          : 0,
    },
    progressTimeline,
    systemEvents,
  };

  return jsonWithCampaignActivityTimingHeaders(payload, {
    durationMs: performance.now() - startedAt,
    hasLatestJob: Boolean(latestJob),
    progressPointCount: progressTimeline.length,
    systemEventCount: systemEvents.length,
  });
}
