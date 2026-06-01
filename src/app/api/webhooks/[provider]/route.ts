import { fail, ok } from '@/lib/http';
import { verifyWebhookSecret } from '@/lib/webhook';
import { executeSql, queryRow } from '@/lib/sqlite';

type ParsedEvent = {
  eventId: string;
  provider: string;
  messageId: string | null;
  campaignId: string;
  contactId: string | null;
  contactEmail: string;
  type: string;
};

const typeMap: Record<string, string> = {
  delivered: 'DELIVERED',
  delivery: 'DELIVERED',
  open: 'OPENED',
  opened: 'OPENED',
  click: 'CLICKED',
  clicked: 'CLICKED',
  bounce: 'BOUNCED',
  bounced: 'BOUNCED',
  complaint: 'BOUNCED',
  reject: 'BOUNCED',
  unsubscribe: 'UNSUBSCRIBED',
  unsubscribed: 'UNSUBSCRIBED',
  blocked: 'BOUNCED',
  sent: 'SENT',
};

function normalizeType(raw: string) {
  return typeMap[raw.toLowerCase()] || 'DELIVERED';
}

function getTagValue(tags: Record<string, unknown> | undefined, key: string) {
  const value = tags?.[key];
  if (Array.isArray(value)) {
    return String(value[0] || '').trim();
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return '';
}

function extractAwsSesPayload(raw: Record<string, unknown>) {
  if (typeof raw.Message === 'string') {
    try {
      const message = JSON.parse(raw.Message) as Record<string, unknown>;
      return message;
    } catch {
      return null;
    }
  }

  return raw;
}

function parseProviderEvent(provider: string, raw: Record<string, unknown>): ParsedEvent | null {
  const payload = provider === 'aws-ses' ? extractAwsSesPayload(raw) : raw;
  if (!payload) return null;
  const awsPayload = payload as Record<string, any>;

  const eventRaw =
    provider === 'aws-ses'
      ? String(awsPayload.eventType || awsPayload.notificationType || awsPayload.event || '').trim()
      : String(payload.event || payload.type || '').trim();
  const messageId =
    provider === 'aws-ses'
      ? String(awsPayload.mail?.messageId || '').trim() || null
      : String(payload.email_id || payload.message_id || payload.sg_message_id || '').trim() || null;
  const campaignId =
    provider === 'aws-ses'
      ? getTagValue(awsPayload.mail?.tags as Record<string, unknown> | undefined, 'campaign_id')
      : String(payload.campaign_id || '').trim();
  const contactId =
    provider === 'aws-ses'
      ? getTagValue(awsPayload.mail?.tags as Record<string, unknown> | undefined, 'contact_id') || null
      : String(payload.contact_id || '').trim() || null;
  const contactEmail =
    provider === 'aws-ses'
      ? String(
          getTagValue(awsPayload.mail?.tags as Record<string, unknown> | undefined, 'recipient_email') ||
          awsPayload.mail?.destination?.[0] ||
          awsPayload.delivery?.recipients?.[0] ||
          awsPayload.bounce?.bouncedRecipients?.[0]?.emailAddress ||
          awsPayload.complaint?.complainedRecipients?.[0]?.emailAddress ||
          ''
        )
          .trim()
          .toLowerCase()
      : String(payload.email || payload.recipient || '').trim().toLowerCase();

  const eventKey =
    provider === 'aws-ses'
      ? String(
          awsPayload.mail?.messageId ||
            awsPayload.mail?.headers?.find?.((header: Record<string, unknown>) => header?.name === 'Message-ID')?.value ||
            awsPayload.id ||
            ''
        ).trim()
      : String(payload.event_id || payload.id || '').trim();

  if (!eventRaw || !eventKey || !campaignId || (!contactEmail && !contactId)) return null;

  return {
    eventId: `${provider}:${eventKey}:${eventRaw.toLowerCase()}:${contactId || contactEmail}`,
    provider,
    messageId,
    campaignId,
    contactId,
    contactEmail,
    type: normalizeType(eventRaw),
  };
}

export async function POST(request: Request, { params }: { params: { provider: string } }) {
  if (!(await verifyWebhookSecret(request))) {
    return fail('Invalid webhook signature.', 401);
  }

  const provider = params.provider.toLowerCase();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return fail('Invalid JSON body.', 400);
  }

  const rawEvents = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' && payload !== null && 'events' in payload && Array.isArray((payload as Record<string, unknown>).events)
      ? (payload as Record<string, unknown>).events as unknown[]
      : [payload];

  let processed = 0;
  let skipped = 0;

  for (const raw of rawEvents) {
    if (!raw || typeof raw !== 'object') {
      skipped += 1;
      continue;
    }

    const parsed = parseProviderEvent(provider, raw as Record<string, unknown>);
    if (!parsed) {
      skipped += 1;
      continue;
    }

    const contact = parsed.contactId
      ? queryRow<{ id: string; userId: string }>(
          `
            SELECT c.id, l.userId
            FROM "Contact" c
            INNER JOIN "List" l ON l.id = c.listId
            INNER JOIN "Campaign" ca ON ca.listId = l.id
            WHERE c.id = ? AND ca.id = ?
            LIMIT 1
          `,
          [parsed.contactId, parsed.campaignId],
        )
      : queryRow<{ id: string; userId: string }>(
          `
            SELECT c.id, l.userId
            FROM "Contact" c
            INNER JOIN "List" l ON l.id = c.listId
            INNER JOIN "Campaign" ca ON ca.listId = l.id
            WHERE lower(c.email) = lower(?) AND ca.id = ?
            LIMIT 1
          `,
          [parsed.contactEmail, parsed.campaignId],
        );

    if (!contact) {
      skipped += 1;
      continue;
    }

    executeSql(
      `
        INSERT INTO "Event" (
          id, type, provider, providerEventId, providerMessageId,
          contactId, campaignId, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(providerEventId) DO UPDATE SET
          type = excluded.type,
          providerMessageId = excluded.providerMessageId
      `,
      [crypto.randomUUID().replace(/-/g, ''), parsed.type, parsed.provider, parsed.eventId, parsed.messageId, contact.id, parsed.campaignId],
    );

    if (parsed.type === 'BOUNCED' || parsed.type === 'UNSUBSCRIBED') {
      executeSql(
        `
          UPDATE "Contact"
          SET status = ?, updatedAt = CURRENT_TIMESTAMP
          WHERE lower(email) = lower(?)
            AND listId IN (SELECT id FROM "List" WHERE userId = ?)
        `,
        [parsed.type === 'BOUNCED' ? 'BOUNCED' : 'UNSUBSCRIBED', parsed.contactEmail, contact.userId],
      );
    }

    processed += 1;
  }

  return ok({ success: true, provider, processed, skipped });
}
