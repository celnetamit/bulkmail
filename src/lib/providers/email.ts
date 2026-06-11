import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { getSenderIdentity, resolveMailTransport } from '@/lib/mail-settings';
import { createUnsubscribeToken } from '@/lib/unsubscribe';
import { createOpenTrackingToken } from '@/lib/tracking';
import { isValidEmailAddress, normalizeEmailAddress } from '@/lib/email-address';
import { recordSystemEvent } from '@/lib/observability';
import { getPlatformSettings } from '@/lib/platform-settings';
import { getUserQuotaStatus } from '@/lib/quota';
import { recordResourceMetric } from '@/lib/resource-analytics';
import { executeSql, queryRow } from '@/lib/sqlite';

type CampaignRecipient = { id: string; email: string; status: string };

type SendInput = {
  userId: string;
  campaignId: string;
  campaignName: string;
  subject: string;
  bodyHtml: string;
  appUrl: string;
  contacts: CampaignRecipient[];
  getControlState?: () => Promise<'RUNNING' | 'PAUSED' | 'CANCELLED'>;
};

type TestEmailInput = {
  toEmail: string;
  subject: string;
  bodyHtml: string;
};

type SendResult = Array<{ contactId: string; provider: string; messageId: string }>;
type SendOutcome = 'SENT' | 'FAILED' | 'SKIPPED' | 'PAUSED' | 'CANCELLED';

const UNSUBSCRIBE_URL_PLACEHOLDER = '{{unsubscribeUrl}}';
const DEFAULT_SEND_CONCURRENCY = 5;
const MIN_PROGRESS_UPDATE_INTERVAL = 25;

function getAppOrigin() {
  const envOrigin =
    process.env.APP_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.COOLIFY_URL?.trim() ||
    '';

  if (envOrigin) {
    try {
      return new URL(envOrigin).origin;
    } catch {
      // fall through to the local fallback below
    }
  }

  return 'http://localhost:3000';
}

function formatSenderAddress(name: string | null | undefined, email: string) {
  const trimmedName = String(name || '').trim();
  return trimmedName ? `${trimmedName} <${email}>` : email;
}

function formatSesSenderAddress(name: string | null | undefined, email: string) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) return email;

  if (/[^\u0020-\u007e]/.test(trimmedName)) {
    const encodedName = Buffer.from(trimmedName, 'utf8').toString('base64');
    return `=?UTF-8?B?${encodedName}?= <${email}>`;
  }

  return `${trimmedName} <${email}>`;
}

function dedupeRecipients(recipients: CampaignRecipient[]) {
  const seen = new Set<string>();
  const unique: CampaignRecipient[] = [];
  let duplicates = 0;
  let invalid = 0;

  for (const recipient of recipients) {
    const email = normalizeEmailAddress(recipient.email);
    if (!isValidEmailAddress(email)) {
      invalid += 1;
      continue;
    }

    if (seen.has(email)) {
      duplicates += 1;
      continue;
    }
    seen.add(email);
    unique.push({ ...recipient, email });
  }

  return { unique, duplicates, invalid };
}

function injectBeforeBodyClose(bodyHtml: string, snippet: string) {
  if (/<\/body>/i.test(bodyHtml)) {
    return bodyHtml.replace(/<\/body>/i, `${snippet}</body>`);
  }

  if (/<\/html>/i.test(bodyHtml)) {
    return bodyHtml.replace(/<\/html>/i, `${snippet}</html>`);
  }

  return `${bodyHtml}${snippet}`;
}

function appendUnsubscribeFooter(bodyHtml: string, unsubscribeUrl: string) {
  return injectBeforeBodyClose(
    bodyHtml,
    `
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#64748b;">
      <p style="margin:0 0 8px;">If you do not want to receive these emails, you can <a href="${unsubscribeUrl}" style="color:#2563eb;text-decoration:underline;">unsubscribe here</a>.</p>
    </div>`,
  );
}

function injectUnsubscribeUrl(bodyHtml: string, unsubscribeUrl: string) {
  return bodyHtml.split(UNSUBSCRIBE_URL_PLACEHOLDER).join(unsubscribeUrl);
}

function applyUnsubscribeLink(bodyHtml: string, unsubscribeUrl: string) {
  const htmlWithInjectedUnsubscribe = injectUnsubscribeUrl(bodyHtml, unsubscribeUrl);
  return htmlWithInjectedUnsubscribe === bodyHtml
    ? appendUnsubscribeFooter(bodyHtml, unsubscribeUrl)
    : htmlWithInjectedUnsubscribe;
}

function appendOpenTrackingPixel(bodyHtml: string, trackingUrl: string) {
  return injectBeforeBodyClose(
    bodyHtml,
    `
    <img src="${trackingUrl}" alt="" width="1" height="1" style="display:block;width:1px;height:1px;border:0;outline:none;text-decoration:none;opacity:0;" />`,
  );
}

async function sendViaMock(
  input: { subject: string; bodyHtml: string; recipients: CampaignRecipient[] },
): Promise<SendResult> {
  return input.recipients.map((contact) => ({
    contactId: contact.id,
    provider: 'mock',
    messageId: `mock-${Date.now()}-${contact.id}`,
  }));
}

async function sendViaResend(
  input: { subject: string; bodyHtml: string; recipients: CampaignRecipient[] },
  transport: { resendApiKey: string; fromEmail: string; fromName: string; replyToEmail: string },
): Promise<SendResult> {
  const results: SendResult = [];

  for (const contact of input.recipients) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${transport.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: formatSenderAddress(transport.fromName, transport.fromEmail),
        reply_to: transport.replyToEmail,
        to: [contact.email],
        subject: input.subject,
        html: input.bodyHtml,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Resend send failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as { id: string };
    results.push({ contactId: contact.id, provider: 'resend', messageId: data.id });
  }

  return results;
}

async function sendViaAwsSes(
  input: { subject: string; bodyHtml: string; recipients: CampaignRecipient[] },
  transport: {
    awsRegion: string;
    fromEmail: string;
    fromName: string;
    replyToEmail: string;
    userId?: string;
    campaignId?: string;
    awsCredentials?: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken?: string;
    };
  },
): Promise<SendResult> {
  const client = new SESv2Client({
    region: transport.awsRegion,
    credentials: transport.awsCredentials,
  });

  const results: SendResult = [];

  for (const contact of input.recipients) {
    const response = await client.send(
      new SendEmailCommand({
        FromEmailAddress: formatSesSenderAddress(transport.fromName, transport.fromEmail),
        ReplyToAddresses: [transport.replyToEmail],
        Destination: { ToAddresses: [contact.email] },
        EmailTags: [
          ...(transport.userId ? [{ Name: 'user_id', Value: transport.userId }] : []),
          ...(transport.campaignId ? [{ Name: 'campaign_id', Value: transport.campaignId }] : []),
          { Name: 'contact_id', Value: contact.id },
          { Name: 'recipient_email', Value: contact.email },
        ],
        Content: {
          Simple: {
            Subject: { Data: input.subject, Charset: 'UTF-8' },
            Body: {
              Html: { Data: input.bodyHtml, Charset: 'UTF-8' },
            },
          },
        },
      }),
    );

    results.push({
      contactId: contact.id,
      provider: 'aws-ses',
      messageId: response.MessageId || `aws-ses-${Date.now()}-${contact.id}`,
    });
  }

  return results;
}

async function sendEmailBatch(
  userId: string,
  input: { subject: string; bodyHtml: string; recipients: CampaignRecipient[]; campaignId?: string },
) {
  const transport = await resolveMailTransport(userId);
  const senderIdentity = await getSenderIdentity(userId);

  if (transport.provider === 'resend') {
    if (!transport.resendApiKey) {
      throw new Error('Resend settings are incomplete. Set the API key in Settings.');
    }
    return sendViaResend(input, {
      resendApiKey: transport.resendApiKey,
      fromEmail: senderIdentity.fromEmail,
      fromName: senderIdentity.fromName,
      replyToEmail: senderIdentity.replyToEmail,
    });
  }

  if (transport.provider === 'aws-ses') {
    if (!transport.awsRegion) {
      throw new Error('AWS SES settings are incomplete. Set the region in Settings.');
    }
    return sendViaAwsSes(input, {
      awsRegion: transport.awsRegion,
      fromEmail: senderIdentity.fromEmail,
      fromName: senderIdentity.fromName,
      replyToEmail: senderIdentity.replyToEmail,
      userId,
      campaignId: input.campaignId,
      awsCredentials: transport.awsCredentials,
    });
  }

  return sendViaMock(input);
}

async function getSendConcurrency() {
  const platformSettings = await getPlatformSettings();
  if (Number.isFinite(platformSettings.campaignSendConcurrency) && platformSettings.campaignSendConcurrency >= 1) {
    return Math.min(25, Math.floor(platformSettings.campaignSendConcurrency));
  }

  const configured = Number(process.env.CAMPAIGN_SEND_CONCURRENCY || '');
  if (Number.isFinite(configured) && configured >= 1) {
    return Math.min(25, Math.floor(configured));
  }

  return DEFAULT_SEND_CONCURRENCY;
}

function getProgressCheckpointSize(concurrency: number, totalRecipients: number) {
  return Math.max(
    MIN_PROGRESS_UPDATE_INTERVAL,
    Math.min(100, Math.ceil(totalRecipients / 20)),
    concurrency * 2,
  );
}

function buildProgressNote(provider: string, processedCount: number, totalRecipients: number, concurrency: number) {
  return `provider:${provider};processed:${processedCount}/${totalRecipients};concurrency:${concurrency}`;
}

async function updateCampaignProgress(
  campaignId: string,
  data: {
    status?: string;
    provider?: string;
    totalRecipients?: number;
    sentCount?: number;
    failedCount?: number;
    skippedCount?: number;
    startedAt?: Date | null;
    finishedAt?: Date | null;
    durationSeconds?: number | null;
  },
) {
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (data.status !== undefined) {
    assignments.push('"status" = ?');
    params.push(data.status);
  }
  if (data.provider !== undefined) {
    assignments.push('"provider" = ?');
    params.push(data.provider);
  }
  if (data.totalRecipients !== undefined) {
    assignments.push('"totalRecipients" = ?');
    params.push(data.totalRecipients);
  }
  if (data.sentCount !== undefined) {
    assignments.push('"sentCount" = ?');
    params.push(data.sentCount);
  }
  if (data.failedCount !== undefined) {
    assignments.push('"failedCount" = ?');
    params.push(data.failedCount);
  }
  if (data.skippedCount !== undefined) {
    assignments.push('"skippedCount" = ?');
    params.push(data.skippedCount);
  }
  if (data.startedAt !== undefined) {
    assignments.push('"startedAt" = ?');
    params.push(data.startedAt ? data.startedAt.toISOString() : null);
  }
  if (data.finishedAt !== undefined) {
    assignments.push('"finishedAt" = ?');
    params.push(data.finishedAt ? data.finishedAt.toISOString() : null);
  }
  if (data.durationSeconds !== undefined) {
    assignments.push('"durationSeconds" = ?');
    params.push(data.durationSeconds);
  }

  if (assignments.length === 0) return;

  params.push(campaignId);
  executeSql(
    `UPDATE "Campaign" SET ${assignments.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`,
    params,
  );
}

export async function dispatchCampaignEmails(userId: string, input: SendInput) {
  const { unique: dedupedContacts, duplicates, invalid } = dedupeRecipients(input.contacts.filter((contact) => contact.status === 'SUBSCRIBED'));
  const transport = await resolveMailTransport(userId);
  const account = queryRow<{ dailyEmailLimit: number; isActive: number | boolean }>(
    'SELECT "dailyEmailLimit", "isActive" FROM "User" WHERE "id" = ? LIMIT 1',
    [userId],
  );

  if (!account || !account.isActive) {
    throw new Error('Account is disabled.');
  }

  const quota = await getUserQuotaStatus(userId, account.dailyEmailLimit);
  const sendableContacts = dedupedContacts.slice(0, quota.remainingToday);
  const quotaSkipped = Math.max(0, dedupedContacts.length - sendableContacts.length);
  const startedAt = new Date();
  const sendConcurrency = await getSendConcurrency();
  const progressCheckpointSize = getProgressCheckpointSize(sendConcurrency, sendableContacts.length);
  let outcome: SendOutcome = 'SENT';

  await updateCampaignProgress(input.campaignId, {
    status: 'SENDING',
    provider: transport.provider,
    totalRecipients: dedupedContacts.length,
    sentCount: 0,
    failedCount: 0,
    skippedCount: duplicates + invalid + quotaSkipped,
    startedAt,
    finishedAt: null,
    durationSeconds: null,
  });

  recordResourceMetric({
    scopeType: 'CAMPAIGN',
    eventType: 'SEND_START',
    userId,
    campaignId: input.campaignId,
    sentCount: 0,
    failedCount: 0,
    skippedCount: duplicates + invalid + quotaSkipped,
    recipientCount: dedupedContacts.length,
    durationMs: 0,
    note: buildProgressNote(transport.provider, 0, dedupedContacts.length, sendConcurrency),
  });
  recordSystemEvent({
    level: 'INFO',
    source: 'campaign_send_start',
    userId,
    campaignId: input.campaignId,
    message: `Campaign send started for ${sendableContacts.length} sendable recipients.`,
    details: {
      provider: transport.provider,
      totalRecipients: dedupedContacts.length,
      sendableRecipients: sendableContacts.length,
      duplicates,
      invalid,
      quotaSkipped,
      concurrency: sendConcurrency,
    },
  });

  if (sendableContacts.length === 0) {
    const finishedAt = new Date();
    const emptyOutcome: SendOutcome = quotaSkipped > 0 ? 'FAILED' : 'SENT';
    await updateCampaignProgress(input.campaignId, {
      status: quotaSkipped > 0 ? 'FAILED' : 'SENT',
      provider: transport.provider,
      finishedAt,
      durationSeconds: Math.max(0, Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000)),
    });
    recordResourceMetric({
      scopeType: 'CAMPAIGN',
      eventType: 'SEND_COMPLETE',
      userId,
      campaignId: input.campaignId,
      sentCount: 0,
      failedCount: 0,
      skippedCount: duplicates + invalid + quotaSkipped,
      recipientCount: dedupedContacts.length,
      durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      note: buildProgressNote(transport.provider, 0, dedupedContacts.length, sendConcurrency),
    });
    recordSystemEvent({
      level: quotaSkipped > 0 ? 'WARN' : 'INFO',
      source: 'campaign_send_complete',
      userId,
      campaignId: input.campaignId,
      message:
        quotaSkipped > 0
          ? 'Campaign send skipped because the daily quota has been exhausted.'
          : 'Campaign send finished with no sendable recipients.',
      details: {
        provider: transport.provider,
        totalRecipients: dedupedContacts.length,
        quotaSkipped,
        duplicates,
        invalid,
        concurrency: sendConcurrency,
      },
    });
    return {
      outcome: emptyOutcome,
      provider: transport.provider,
      sentCount: 0,
      failedCount: 0,
      skippedCount: duplicates + invalid + quotaSkipped,
      totalRecipients: dedupedContacts.length,
      quotaSkippedCount: quotaSkipped,
      remainingToday: quota.remainingToday,
    };
  }

  let sentCount = 0;
  let failedCount = 0;
  let lastProgressCheckpoint = 0;

  async function sendContact(contact: CampaignRecipient) {
    const unsubscribeToken = await createUnsubscribeToken({
      userId,
      campaignId: input.campaignId,
      contactId: contact.id,
      email: contact.email,
    });

    const unsubscribeUrl = `${input.appUrl.replace(/\/$/, '')}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
    const trackingToken = await createOpenTrackingToken({
      userId,
      campaignId: input.campaignId,
      contactId: contact.id,
      email: contact.email,
    });
    const trackingUrl = `${input.appUrl.replace(/\/$/, '')}/api/track/open?token=${encodeURIComponent(trackingToken)}`;
    const html = appendOpenTrackingPixel(applyUnsubscribeLink(input.bodyHtml, unsubscribeUrl), trackingUrl);

    const sent = await sendEmailBatch(userId, {
      subject: input.subject,
      bodyHtml: html,
      campaignId: input.campaignId,
      recipients: [contact],
    });

    const message = sent[0];
    if (message) {
      executeSql(
        `
          INSERT INTO "Event" (
                "id", "type", "provider", "providerEventId", "providerMessageId",
                "contactId", "campaignId", "createdAt"
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          crypto.randomUUID().replace(/-/g, ''),
          'SENT',
          message.provider,
          `${message.provider}:sent:${message.messageId}:${message.contactId}`,
          message.messageId,
          contact.id,
          input.campaignId,
          new Date().toISOString(),
        ],
      );
    }
  }

  for (let index = 0; index < sendableContacts.length; index += sendConcurrency) {
    const controlStateBeforeChunk = input.getControlState ? await input.getControlState() : 'RUNNING';
    if (controlStateBeforeChunk === 'PAUSED') {
      outcome = 'PAUSED';
      break;
    }
    if (controlStateBeforeChunk === 'CANCELLED') {
      outcome = 'CANCELLED';
      break;
    }

    const chunk = sendableContacts.slice(index, index + sendConcurrency);
    const results = await Promise.allSettled(
      chunk.map(async (contact) => {
        await sendContact(contact);
        return contact;
      }),
    );

    results.forEach((result, chunkIndex) => {
      if (result.status === 'fulfilled') {
        sentCount += 1;
        return;
      }

      failedCount += 1;
      const contact = chunk[chunkIndex];
      console.error('campaign_send_item_failed', {
        campaignId: input.campaignId,
        contactId: contact?.id,
        email: contact?.email,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
      recordSystemEvent({
        level: 'WARN',
        source: 'campaign_send_item',
        message: result.reason instanceof Error ? result.reason.message : 'Campaign send item failed.',
        userId,
        campaignId: input.campaignId,
        details: {
          contactId: contact?.id || null,
          email: contact?.email || null,
          provider: transport.provider,
        },
      });
    });

    const processedCount = sentCount + failedCount;
    await updateCampaignProgress(input.campaignId, {
      status: 'SENDING',
      provider: transport.provider,
      totalRecipients: dedupedContacts.length,
      sentCount,
      failedCount,
      skippedCount: duplicates + invalid + quotaSkipped,
      startedAt,
    });

    if (
      processedCount === sendableContacts.length ||
      processedCount - lastProgressCheckpoint >= progressCheckpointSize
    ) {
      lastProgressCheckpoint = processedCount;
      recordResourceMetric({
        scopeType: 'CAMPAIGN',
        eventType: 'SEND_PROGRESS',
        userId,
        campaignId: input.campaignId,
        sentCount,
        failedCount,
        skippedCount: duplicates + invalid + quotaSkipped,
        recipientCount: dedupedContacts.length,
        durationMs: Math.max(0, Date.now() - startedAt.getTime()),
        note: buildProgressNote(transport.provider, processedCount, dedupedContacts.length, sendConcurrency),
      });
      recordSystemEvent({
        level: 'INFO',
        source: 'campaign_send_progress',
        userId,
        campaignId: input.campaignId,
        message: `Campaign send progress: ${processedCount}/${sendableContacts.length} processed.`,
        details: {
          provider: transport.provider,
          processedCount,
          sendableRecipients: sendableContacts.length,
          totalRecipients: dedupedContacts.length,
          sentCount,
          failedCount,
          skippedCount: duplicates + invalid + quotaSkipped,
          concurrency: sendConcurrency,
        },
      });
    }

    const controlStateAfterChunk = input.getControlState ? await input.getControlState() : 'RUNNING';
    if (controlStateAfterChunk === 'PAUSED') {
      outcome = 'PAUSED';
      break;
    }
    if (controlStateAfterChunk === 'CANCELLED') {
      outcome = 'CANCELLED';
      break;
    }
  }

  const finishedAt = new Date();
  await updateCampaignProgress(input.campaignId, {
    status:
      outcome === 'PAUSED'
        ? 'PAUSED'
        : outcome === 'CANCELLED'
          ? 'CANCELLED'
          : failedCount > 0 && sentCount === 0
            ? 'FAILED'
            : 'SENT',
    provider: transport.provider,
    totalRecipients: dedupedContacts.length,
    sentCount,
    failedCount,
    skippedCount: duplicates + invalid + quotaSkipped,
    startedAt,
    finishedAt,
    durationSeconds: Math.max(0, Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000)),
  });
  recordResourceMetric({
    scopeType: 'CAMPAIGN',
    eventType: 'SEND_COMPLETE',
    userId,
    campaignId: input.campaignId,
    sentCount,
    failedCount,
    skippedCount: duplicates + invalid + quotaSkipped,
    recipientCount: dedupedContacts.length,
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    note: buildProgressNote(transport.provider, sendableContacts.length, dedupedContacts.length, sendConcurrency),
  });
  recordSystemEvent({
    level: outcome === 'CANCELLED' || failedCount > 0 ? 'WARN' : 'INFO',
    source: 'campaign_send_complete',
    userId,
    campaignId: input.campaignId,
    message:
      outcome === 'PAUSED'
        ? 'Campaign send paused by operator.'
        : outcome === 'CANCELLED'
          ? 'Campaign send cancelled by operator.'
          : failedCount > 0
            ? `Campaign send completed with ${failedCount} failed recipients.`
            : 'Campaign send completed successfully.',
    details: {
      provider: transport.provider,
      totalRecipients: dedupedContacts.length,
      sendableRecipients: sendableContacts.length,
      sentCount,
      failedCount,
      skippedCount: duplicates + invalid + quotaSkipped,
      quotaSkipped,
      duplicates,
      invalid,
      durationSeconds: Math.max(0, Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000)),
      concurrency: sendConcurrency,
      outcome,
    },
  });

  const finalOutcome: SendOutcome =
    outcome === 'PAUSED' || outcome === 'CANCELLED'
      ? outcome
      : failedCount > 0 && sentCount === 0
        ? 'FAILED'
        : 'SENT';

  return {
    outcome: finalOutcome,
    provider: transport.provider,
    sentCount,
    failedCount,
    skippedCount: duplicates + invalid + quotaSkipped,
    totalRecipients: dedupedContacts.length,
    quotaSkippedCount: quotaSkipped,
    remainingToday: quota.remainingToday,
  };
}

export async function sendTestEmail(userId: string, input: TestEmailInput) {
  const recipients = [{ id: 'test-recipient', email: input.toEmail, status: 'SUBSCRIBED' }];
  const unsubscribeToken = await createUnsubscribeToken({
    kind: 'test',
    userId,
    email: input.toEmail,
  });
  const unsubscribeUrl = `${getAppOrigin()}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const sent = await sendEmailBatch(userId, {
    subject: input.subject,
    bodyHtml: applyUnsubscribeLink(input.bodyHtml, unsubscribeUrl),
    recipients,
  });

  const transport = await resolveMailTransport(userId);
  return {
    provider: transport.provider,
    messageId: sent[0]?.messageId || null,
  };
}
