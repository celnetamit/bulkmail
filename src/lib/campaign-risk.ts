import { getCampaignLists } from '@/lib/campaign-lists';
import { buildComplianceItems } from '@/lib/compliance';
import { isValidEmailAddress, normalizeEmailAddress } from '@/lib/email-address';
import { getMailSettings } from '@/lib/mail-settings';
import { queryRow, queryRows } from '@/lib/sqlite';

export type CampaignRiskSeverity = 'block' | 'warning' | 'info';
export type CampaignRiskCategory = 'compliance' | 'spam' | 'audience' | 'deliverability';
export type CampaignRiskStatus = 'blocked' | 'warning' | 'ready';

export type CampaignRiskItem = {
  key: string;
  title: string;
  detail: string;
  severity: CampaignRiskSeverity;
  category: CampaignRiskCategory;
};

export type CampaignRiskResult = {
  status: CampaignRiskStatus;
  score: number;
  summary: string;
  counts: {
    blocks: number;
    warnings: number;
    infos: number;
  };
  audience: {
    lists: number;
    totalContacts: number;
    subscribedContacts: number;
    suppressedContacts: number;
    invalidContacts: number;
    duplicateContacts: number;
  };
  items: CampaignRiskItem[];
};

type CampaignRiskCampaign = {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  status: string;
  isArchived: number | boolean;
  listId: string;
};

type ContactRiskRow = {
  id: string;
  email: string;
  status: string;
};

const SPAM_PHRASES = [
  '100% free',
  'act now',
  'buy now',
  'cash bonus',
  'click here',
  'congratulations',
  'deal expires',
  'earn money',
  'free gift',
  'guaranteed',
  'limited time',
  'lowest price',
  'miracle',
  'no obligation',
  'open immediately',
  'payday',
  'risk free',
  'urgent',
  'winner',
  'you have been selected',
];

const URL_SHORTENER_PATTERN = /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|buff\.ly|rebrand\.ly|cutt\.ly|is\.gd)\b/i;
const HREF_PATTERN = /\bhref\s*=\s*["'][^"']+["']/gi;
const IMG_PATTERN = /<img\b/gi;

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length || 0;
}

function getUppercaseRatio(value: string) {
  const letters = value.replace(/[^a-z]/gi, '');
  if (letters.length === 0) return 0;
  const uppercase = letters.replace(/[^A-Z]/g, '');
  return uppercase.length / letters.length;
}

function addItem(items: CampaignRiskItem[], item: CampaignRiskItem) {
  items.push(item);
}

function getAudienceStats(contacts: ContactRiskRow[]) {
  const seen = new Set<string>();
  let subscribedContacts = 0;
  let suppressedContacts = 0;
  let invalidContacts = 0;
  let duplicateContacts = 0;

  for (const contact of contacts) {
    const email = normalizeEmailAddress(contact.email);
    if (!isValidEmailAddress(email)) invalidContacts += 1;
    if (seen.has(email)) duplicateContacts += 1;
    seen.add(email);

    if (contact.status === 'SUBSCRIBED') {
      subscribedContacts += 1;
    } else {
      suppressedContacts += 1;
    }
  }

  return {
    totalContacts: contacts.length,
    subscribedContacts,
    suppressedContacts,
    invalidContacts,
    duplicateContacts,
  };
}

function getContentRiskItems(campaign: CampaignRiskCampaign): CampaignRiskItem[] {
  const items: CampaignRiskItem[] = [];
  const subject = campaign.subject.trim();
  const bodyHtml = campaign.bodyHtml.trim();
  const bodyText = stripHtml(bodyHtml);
  const lowerContent = `${subject} ${bodyText}`.toLowerCase();
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;
  const linkCount = countMatches(bodyHtml, HREF_PATTERN);
  const imageCount = countMatches(bodyHtml, IMG_PATTERN);

  if (subject.length < 6) {
    addItem(items, {
      key: 'subject-too-short',
      title: 'Subject line is too short',
      detail: 'Short subjects are easy to miss and can look suspicious in bulk sends.',
      severity: 'warning',
      category: 'spam',
    });
  }

  if (subject.length > 90) {
    addItem(items, {
      key: 'subject-too-long',
      title: 'Subject line is long',
      detail: 'Keep the subject under 90 characters so mailbox previews stay readable.',
      severity: 'warning',
      category: 'spam',
    });
  }

  if (subject.length >= 12 && getUppercaseRatio(subject) > 0.7) {
    addItem(items, {
      key: 'subject-uppercase',
      title: 'Subject has heavy uppercase text',
      detail: 'Large all-caps subjects are a common spam signal.',
      severity: 'warning',
      category: 'spam',
    });
  }

  if (/[!?]{3,}/.test(subject)) {
    addItem(items, {
      key: 'subject-punctuation',
      title: 'Subject has repeated punctuation',
      detail: 'Repeated exclamation or question marks can hurt sender trust.',
      severity: 'warning',
      category: 'spam',
    });
  }

  const matchedPhrases = SPAM_PHRASES.filter((phrase) => lowerContent.includes(phrase));
  if (matchedPhrases.length > 0) {
    addItem(items, {
      key: 'spam-phrases',
      title: 'Spam-sensitive wording detected',
      detail: `Review wording such as ${matchedPhrases.slice(0, 4).join(', ')}.`,
      severity: matchedPhrases.length >= 4 ? 'block' : 'warning',
      category: 'spam',
    });
  }

  if (wordCount < 40) {
    addItem(items, {
      key: 'body-too-short',
      title: 'Body copy is thin',
      detail: 'Very short bulk email bodies can look low-context to recipients and filters.',
      severity: 'warning',
      category: 'spam',
    });
  }

  if (linkCount > 12 || (wordCount > 0 && linkCount / wordCount > 0.08)) {
    addItem(items, {
      key: 'link-density',
      title: 'High link density',
      detail: `This draft has ${linkCount} tracked link${linkCount === 1 ? '' : 's'} across about ${wordCount} words.`,
      severity: 'warning',
      category: 'spam',
    });
  }

  if (URL_SHORTENER_PATTERN.test(bodyHtml)) {
    addItem(items, {
      key: 'shortened-links',
      title: 'Shortened links detected',
      detail: 'Shortened URLs hide the final domain and are often treated as suspicious in email.',
      severity: 'warning',
      category: 'spam',
    });
  }

  if (imageCount >= 4 && wordCount < 80) {
    addItem(items, {
      key: 'image-heavy',
      title: 'Image-heavy email',
      detail: `This draft has ${imageCount} image${imageCount === 1 ? '' : 's'} with limited supporting text.`,
      severity: 'warning',
      category: 'spam',
    });
  }

  return items;
}

function getAudienceRiskItems(audience: CampaignRiskResult['audience']): CampaignRiskItem[] {
  const items: CampaignRiskItem[] = [];
  const suppressedRate = audience.totalContacts > 0 ? audience.suppressedContacts / audience.totalContacts : 0;
  const invalidRate = audience.totalContacts > 0 ? audience.invalidContacts / audience.totalContacts : 0;

  if (audience.lists === 0) {
    addItem(items, {
      key: 'no-list',
      title: 'No list selected',
      detail: 'Attach at least one audience list before sending.',
      severity: 'block',
      category: 'audience',
    });
  }

  if (audience.totalContacts === 0) {
    addItem(items, {
      key: 'empty-audience',
      title: 'Audience has no contacts',
      detail: 'Add contacts to the selected list before sending.',
      severity: 'block',
      category: 'audience',
    });
  }

  if (audience.totalContacts > 0 && audience.subscribedContacts === 0) {
    addItem(items, {
      key: 'no-subscribed-contacts',
      title: 'No subscribed contacts available',
      detail: 'All selected contacts are suppressed, bounced, unsubscribed, or invalid.',
      severity: 'block',
      category: 'audience',
    });
  }

  if (suppressedRate >= 0.2) {
    addItem(items, {
      key: 'high-suppression',
      title: 'High suppression rate',
      detail: `${audience.suppressedContacts} of ${audience.totalContacts} selected contacts are already suppressed.`,
      severity: suppressedRate >= 0.5 ? 'block' : 'warning',
      category: 'audience',
    });
  }

  if (invalidRate >= 0.05) {
    addItem(items, {
      key: 'invalid-addresses',
      title: 'Invalid addresses detected',
      detail: `${audience.invalidContacts} selected contact${audience.invalidContacts === 1 ? '' : 's'} have invalid email addresses.`,
      severity: invalidRate >= 0.15 ? 'block' : 'warning',
      category: 'audience',
    });
  }

  if (audience.duplicateContacts > 0) {
    addItem(items, {
      key: 'duplicate-addresses',
      title: 'Duplicate addresses detected',
      detail: `${audience.duplicateContacts} duplicate recipient${audience.duplicateContacts === 1 ? '' : 's'} will be skipped automatically.`,
      severity: 'info',
      category: 'audience',
    });
  }

  return items;
}

function getDeliverabilityItems(userId: string): CampaignRiskItem[] {
  const items: CampaignRiskItem[] = [];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const history = queryRow<{
    sentCount: number;
    bouncedCount: number;
    unsubscribedCount: number;
  }>(
    `
      SELECT
        COALESCE(SUM(CASE WHEN e.type = 'SENT' THEN 1 ELSE 0 END), 0) as sentCount,
        COALESCE(SUM(CASE WHEN e.type = 'BOUNCED' THEN 1 ELSE 0 END), 0) as bouncedCount,
        COALESCE(SUM(CASE WHEN e.type = 'UNSUBSCRIBED' THEN 1 ELSE 0 END), 0) as unsubscribedCount
      FROM "Event" e
      INNER JOIN "Campaign" c ON c.id = e."campaignId"
      WHERE c."userId" = ? AND e."createdAt" >= ?
    `,
    [userId, thirtyDaysAgo],
  );

  const sentCount = history?.sentCount || 0;
  if (sentCount < 25) return items;

  const bounceRate = (history?.bouncedCount || 0) / sentCount;
  const unsubscribeRate = (history?.unsubscribedCount || 0) / sentCount;

  if (bounceRate >= 0.05) {
    addItem(items, {
      key: 'recent-bounce-rate',
      title: 'Recent bounce rate is high',
      detail: `Recent bounce rate is ${(bounceRate * 100).toFixed(1)}%. Clean the audience before the next send.`,
      severity: bounceRate >= 0.1 ? 'block' : 'warning',
      category: 'deliverability',
    });
  }

  if (unsubscribeRate >= 0.02) {
    addItem(items, {
      key: 'recent-unsubscribe-rate',
      title: 'Recent unsubscribe rate is elevated',
      detail: `Recent unsubscribe rate is ${(unsubscribeRate * 100).toFixed(1)}%. Review consent, segment fit, and content relevance.`,
      severity: unsubscribeRate >= 0.05 ? 'block' : 'warning',
      category: 'deliverability',
    });
  }

  return items;
}

async function getComplianceRiskItems(userId: string, suppressedContacts: number): Promise<CampaignRiskItem[]> {
  const items: CampaignRiskItem[] = [];
  const [mailSettings, platformSettings, defaultTestList] = await Promise.all([
    getMailSettings(userId),
    Promise.resolve(queryRow<{
      sendingDomain: string | null;
      spfVerified: number | boolean;
      dkimVerified: number | boolean;
      dmarcVerified: number | boolean;
    }>(
      `
        SELECT sendingDomain, spfVerified, dkimVerified, dmarcVerified
          FROM "PlatformSettings"
          WHERE "id" = 'global'
        LIMIT 1
      `,
      [],
    )),
    Promise.resolve(queryRow<{ name: string }>(
      `
        SELECT name
          FROM "List"
          WHERE "userId" = ? AND COALESCE("isDefaultTestList", FALSE) = TRUE
          LIMIT 1
      `,
      [userId],
    )),
  ]);

  const compliance = buildComplianceItems({
    provider: mailSettings.provider,
    awsFromEmail: mailSettings.awsFromEmail,
    resendFromEmail: mailSettings.resendFromEmail,
    hasWebhookSharedSecret: mailSettings.hasWebhookSharedSecret,
    sendingDomain: platformSettings?.sendingDomain || '',
    spfVerified: Boolean(platformSettings?.spfVerified),
    dkimVerified: Boolean(platformSettings?.dkimVerified),
    dmarcVerified: Boolean(platformSettings?.dmarcVerified),
    defaultTestListName: defaultTestList?.name,
    suppressedContacts,
  });

  for (const check of compliance) {
    if (check.status === 'ready') continue;
    if (check.key === 'content') continue;

    const isSenderBlock = check.key === 'sender' && mailSettings.provider !== 'mock';
    addItem(items, {
      key: `compliance-${check.key}`,
      title: check.title,
      detail: check.detail,
      severity: isSenderBlock ? 'block' : 'warning',
      category: 'compliance',
    });
  }

  return items;
}

function buildResult(items: CampaignRiskItem[], audience: CampaignRiskResult['audience']): CampaignRiskResult {
  const counts = items.reduce(
    (acc, item) => {
      if (item.severity === 'block') acc.blocks += 1;
      if (item.severity === 'warning') acc.warnings += 1;
      if (item.severity === 'info') acc.infos += 1;
      return acc;
    },
    { blocks: 0, warnings: 0, infos: 0 },
  );
  const score = Math.min(100, counts.blocks * 35 + counts.warnings * 12 + counts.infos * 4);
  const status: CampaignRiskStatus = counts.blocks > 0 ? 'blocked' : counts.warnings > 0 ? 'warning' : 'ready';
  const summary =
    status === 'blocked'
      ? `${counts.blocks} blocking issue${counts.blocks === 1 ? '' : 's'} must be fixed before sending.`
      : status === 'warning'
        ? `${counts.warnings} warning${counts.warnings === 1 ? '' : 's'} should be reviewed before sending.`
        : 'No campaign risk issues detected.';

  return {
    status,
    score,
    summary,
    counts,
    audience,
    items,
  };
}

export async function analyzeCampaignRisk(userId: string, campaignId: string) {
  const campaign = queryRow<CampaignRiskCampaign>(
    `
      SELECT id, name, subject, bodyHtml, status, CASE WHEN COALESCE(isArchived, FALSE) THEN 1 ELSE 0 END as isArchived, listId
      FROM "Campaign"
      WHERE id = ? AND userId = ?
      LIMIT 1
    `,
    [campaignId, userId],
  );

  if (!campaign) return null;

  const selectedLists = getCampaignLists(campaign.id, userId);
  const effectiveListIds = selectedLists.length > 0 ? selectedLists.map((list) => list.id) : [campaign.listId];
  const contacts = effectiveListIds.length > 0
    ? queryRows<ContactRiskRow>(
        `
          SELECT c.id, c.email, c.status
          FROM "Contact" c
          INNER JOIN "List" l ON l.id = c.listId
          WHERE l.id IN (${effectiveListIds.map(() => '?').join(', ')}) AND l.userId = ?
        `,
        [...effectiveListIds, userId],
      )
    : [];
  const audienceStats = getAudienceStats(contacts);
  const audience = {
    lists: effectiveListIds.length,
    ...audienceStats,
  };

  const items: CampaignRiskItem[] = [];

  if (campaign.isArchived) {
    addItem(items, {
      key: 'archived-campaign',
      title: 'Campaign is archived',
      detail: 'Restore the campaign before sending.',
      severity: 'block',
      category: 'audience',
    });
  }

  if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
    addItem(items, {
      key: 'campaign-status',
      title: 'Campaign status is not sendable',
      detail: 'Only draft or scheduled campaigns can be sent.',
      severity: 'block',
      category: 'audience',
    });
  }

  items.push(...getContentRiskItems(campaign));
  items.push(...getAudienceRiskItems(audience));
  items.push(...getDeliverabilityItems(userId));
  const complianceItems = await getComplianceRiskItems(userId, audience.suppressedContacts);
  items.push(...complianceItems);

  return buildResult(items, audience);
}
