import { queryRow, queryRows } from '@/lib/sqlite';
import { buildOwnerScopeForRole } from '@/lib/data-scope';

export type AnalyticsDetectionStatus = 'healthy' | 'watch' | 'critical' | 'idle';

export type AnalyticsDetection = {
  key: string;
  title: string;
  status: AnalyticsDetectionStatus;
  value: number;
  count: number;
  unit: 'percent' | 'count';
  detail: string;
};

function getMaxRateStatus(rate: number, sampleSize: number, warningAt: number, criticalAt: number, minimumSample = 10): AnalyticsDetectionStatus {
  if (sampleSize < minimumSample) return 'idle';
  if (rate >= criticalAt) return 'critical';
  if (rate >= warningAt) return 'watch';
  return 'healthy';
}

function getMinRateStatus(rate: number, sampleSize: number, warningBelow: number, criticalBelow: number, minimumSample = 10): AnalyticsDetectionStatus {
  if (sampleSize < minimumSample) return 'idle';
  if (rate <= criticalBelow) return 'critical';
  if (rate <= warningBelow) return 'watch';
  return 'healthy';
}

function buildDetections(metrics: {
  delivered: number;
  opened: number;
  sent: number;
  bounced: number;
  unsubscribed: number;
  spamComplaints: number;
  providerBlocks: number;
  openRate: number;
  bounceRate: number;
  unsubscribeRate: number;
  spamComplaintRate: number;
  providerBlockRate: number;
}): AnalyticsDetection[] {
  return [
    {
      key: 'open-rate',
      title: 'Open detection',
      status: getMinRateStatus(metrics.openRate, metrics.delivered, 15, 5, 20),
      value: metrics.openRate,
      count: metrics.opened,
      unit: 'percent',
      detail: `${metrics.opened} open event${metrics.opened === 1 ? '' : 's'} from ${metrics.delivered} delivered email${metrics.delivered === 1 ? '' : 's'}.`,
    },
    {
      key: 'bounce-rate',
      title: 'Bounce detection',
      status: getMaxRateStatus(metrics.bounceRate, metrics.sent, 2, 5, 20),
      value: metrics.bounceRate,
      count: metrics.bounced,
      unit: 'percent',
      detail: `${metrics.bounced} bounce-family event${metrics.bounced === 1 ? '' : 's'} from ${metrics.sent} sent email${metrics.sent === 1 ? '' : 's'}.`,
    },
    {
      key: 'unsubscribe-rate',
      title: 'Unsubscribe detection',
      status: getMaxRateStatus(metrics.unsubscribeRate, metrics.delivered, 0.5, 2, 20),
      value: metrics.unsubscribeRate,
      count: metrics.unsubscribed,
      unit: 'percent',
      detail: `${metrics.unsubscribed} unsubscribe event${metrics.unsubscribed === 1 ? '' : 's'} from ${metrics.delivered} delivered email${metrics.delivered === 1 ? '' : 's'}.`,
    },
    {
      key: 'spam-complaints',
      title: 'Spam complaint detection',
      status: getMaxRateStatus(metrics.spamComplaintRate, metrics.delivered, 0.05, 0.1, 20),
      value: metrics.spamComplaintRate,
      count: metrics.spamComplaints,
      unit: 'percent',
      detail: `${metrics.spamComplaints} complaint/spam event${metrics.spamComplaints === 1 ? '' : 's'} found in provider webhooks.`,
    },
    {
      key: 'provider-blocks',
      title: 'Provider block detection',
      status: getMaxRateStatus(metrics.providerBlockRate, metrics.sent, 1, 3, 20),
      value: metrics.providerBlockRate,
      count: metrics.providerBlocks,
      unit: 'percent',
      detail: `${metrics.providerBlocks} blocked/rejected event${metrics.providerBlocks === 1 ? '' : 's'} found in provider webhooks.`,
    },
  ];
}

export async function getUserAnalyticsSummary(userId: string, options?: { campaignId?: string; listId?: string; from?: Date | null; to?: Date | null; role?: string; }) {
  const role = options?.role || 'USER';
  const campaignOwnerScope = buildOwnerScopeForRole(userId, role, 'c.userId');
  const filters: string[] = [campaignOwnerScope.clause];
  const params: unknown[] = [...campaignOwnerScope.params];

  if (options?.campaignId) {
    filters.push('c.id = ?');
    params.push(options.campaignId);
  }

  if (options?.listId) {
    filters.push('(c.listId = ? OR c.id IN (SELECT campaignId FROM "CampaignList" WHERE listId = ?))');
    params.push(options.listId, options.listId);
  }

  if (options?.from) {
    filters.push('e.createdAt >= ?');
    params.push(options.from.toISOString());
  }

  if (options?.to) {
    filters.push('e.createdAt <= ?');
    params.push(options.to.toISOString());
  }

  const eventRows = queryRows<{ type: string; count: number }>(
    `
      SELECT e.type as type, COUNT(*) as count
      FROM "Event" e
      INNER JOIN "Campaign" c ON c.id = e.campaignId
      WHERE ${filters.join(' AND ')}
      GROUP BY e.type
    `,
    params,
  );

  const counts = { SENT: 0, DELIVERED: 0, OPENED: 0, CLICKED: 0, BOUNCED: 0, UNSUBSCRIBED: 0 };

  for (const row of eventRows) {
    if (row.type in counts) counts[row.type as keyof typeof counts] = row.count;
  }

  const signalCounts = queryRow<{
    spamComplaints: number;
    providerBlocks: number;
  }>(
    `
      SELECT
        COALESCE(SUM(CASE
          WHEN lower(COALESCE(e.providerEventId, '')) LIKE '%:complaint:%'
            OR lower(COALESCE(e.providerEventId, '')) LIKE '%:complained:%'
            OR lower(COALESCE(e.providerEventId, '')) LIKE '%:spam:%'
            OR lower(COALESCE(e.providerEventId, '')) LIKE '%:spam_report:%'
          THEN 1 ELSE 0
        END), 0) as spamComplaints,
        COALESCE(SUM(CASE
          WHEN lower(COALESCE(e.providerEventId, '')) LIKE '%:blocked:%'
            OR lower(COALESCE(e.providerEventId, '')) LIKE '%:block:%'
            OR lower(COALESCE(e.providerEventId, '')) LIKE '%:reject:%'
            OR lower(COALESCE(e.providerEventId, '')) LIKE '%:rejected:%'
          THEN 1 ELSE 0
        END), 0) as providerBlocks
      FROM "Event" e
      INNER JOIN "Campaign" c ON c.id = e.campaignId
      WHERE ${filters.join(' AND ')}
    `,
    params,
  );

  const contactOwnerScope = buildOwnerScopeForRole(userId, role, 'l.userId');
  const contactFilters: string[] = [contactOwnerScope.clause];
  const contactParams: unknown[] = [...contactOwnerScope.params];

  if (options?.listId) {
    contactFilters.push('l.id = ?');
    contactParams.push(options.listId);
  } else if (options?.campaignId) {
    contactFilters.push(`
      l.id IN (
        SELECT listId FROM "CampaignList" WHERE campaignId = ?
        UNION
        SELECT l.id
        FROM "List" l
        INNER JOIN "Campaign" c ON c.listId = l.id
        WHERE c.id = ? AND ${campaignOwnerScope.clause}
      )
    `);
    contactParams.push(options.campaignId, options.campaignId, ...campaignOwnerScope.params);
  }

  const contactStats = queryRow<{
    totalContacts: number;
    subscribedContacts: number;
    bouncedContacts: number;
    unsubscribedContacts: number;
  }>(
    `
      SELECT
        COUNT(*) as totalContacts,
        COALESCE(SUM(CASE WHEN c.status = 'SUBSCRIBED' THEN 1 ELSE 0 END), 0) as subscribedContacts,
        COALESCE(SUM(CASE WHEN c.status = 'BOUNCED' THEN 1 ELSE 0 END), 0) as bouncedContacts,
        COALESCE(SUM(CASE WHEN c.status = 'UNSUBSCRIBED' THEN 1 ELSE 0 END), 0) as unsubscribedContacts
      FROM "Contact" c
      INNER JOIN "List" l ON l.id = c.listId
      WHERE ${contactFilters.join(' AND ')}
    `,
    contactParams,
  );

  const sent = counts.SENT;
  const delivered = counts.DELIVERED;
  const opened = counts.OPENED;
  const clicked = counts.CLICKED;
  const bounced = counts.BOUNCED;
  const unsubscribed = counts.UNSUBSCRIBED;
  const spamComplaints = signalCounts?.spamComplaints || 0;
  const providerBlocks = signalCounts?.providerBlocks || 0;
  const openRate = delivered > 0 ? (opened / delivered) * 100 : 0;
  const clickRate = delivered > 0 ? (clicked / delivered) * 100 : 0;
  const bounceRate = sent > 0 ? (bounced / sent) * 100 : 0;
  const unsubscribeRate = delivered > 0 ? (unsubscribed / delivered) * 100 : 0;
  const spamComplaintRate = delivered > 0 ? (spamComplaints / delivered) * 100 : 0;
  const providerBlockRate = sent > 0 ? (providerBlocks / sent) * 100 : 0;
  const metrics = {
    sent,
    delivered,
    opened,
    clicked,
    bounced,
    unsubscribed,
    spamComplaints,
    providerBlocks,
    openRate,
    clickRate,
    bounceRate,
    unsubscribeRate,
    spamComplaintRate,
    providerBlockRate,
  };

  return {
    ...metrics,
    suppressedContacts: (contactStats?.bouncedContacts || 0) + (contactStats?.unsubscribedContacts || 0),
    contactStats: {
      total: contactStats?.totalContacts || 0,
      subscribed: contactStats?.subscribedContacts || 0,
      bounced: contactStats?.bouncedContacts || 0,
      unsubscribed: contactStats?.unsubscribedContacts || 0,
    },
    detections: buildDetections(metrics),
  };
}
