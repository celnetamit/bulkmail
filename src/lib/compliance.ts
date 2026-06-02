import type { MailProvider } from '@/lib/mail-settings';

export type ComplianceStatus = 'ready' | 'manual' | 'action';

export type ComplianceItem = {
  key: string;
  title: string;
  detail: string;
  status: ComplianceStatus;
  action?: { label: string; href: string };
};

export type ComplianceContext = {
  provider: MailProvider;
  awsFromEmail: string;
  resendFromEmail: string;
  hasWebhookSharedSecret: boolean;
  sendingDomain: string;
  spfVerified: boolean;
  dkimVerified: boolean;
  dmarcVerified: boolean;
  defaultTestListName?: string;
  suppressedContacts: number;
};

export function buildComplianceItems(context: ComplianceContext): ComplianceItem[] {
  const senderConfigured = Boolean(
    (context.provider === 'aws-ses' && context.awsFromEmail) ||
      (context.provider === 'resend' && context.resendFromEmail),
  );

  const domainConfigured = Boolean(context.sendingDomain);
  const spfReady = domainConfigured && context.spfVerified;
  const dkimReady = domainConfigured && context.dkimVerified;
  const dmarcReady = domainConfigured && context.dmarcVerified;

  return [
    {
      key: 'sender',
      title: 'Sender identity configured',
      detail: senderConfigured
        ? `Current provider: ${context.provider}. Sender details are loaded from the saved settings.`
        : 'Set a real sender email in Settings before sending live mail.',
      status: senderConfigured ? 'ready' : 'action',
      action: { label: 'Open Settings', href: '/dashboard/settings' },
    },
    {
      key: 'spf',
      title: 'SPF record verified',
      detail: spfReady
        ? `SPF is marked verified for ${context.sendingDomain}.`
        : domainConfigured
          ? `Set the SPF record for ${context.sendingDomain}, then mark it verified in Settings.`
          : 'Set a sending domain in Settings, publish SPF, and mark it verified.',
      status: spfReady ? 'ready' : 'action',
      action: { label: 'Open Settings', href: '/dashboard/settings' },
    },
    {
      key: 'dkim',
      title: 'DKIM record verified',
      detail: dkimReady
        ? `DKIM is marked verified for ${context.sendingDomain}.`
        : domainConfigured
          ? `Set the DKIM record for ${context.sendingDomain}, then mark it verified in Settings.`
          : 'Set a sending domain in Settings, publish DKIM, and mark it verified.',
      status: dkimReady ? 'ready' : 'action',
      action: { label: 'Open Settings', href: '/dashboard/settings' },
    },
    {
      key: 'dmarc',
      title: 'DMARC policy verified',
      detail: dmarcReady
        ? `DMARC is marked verified for ${context.sendingDomain}.`
        : domainConfigured
          ? `Set a DMARC policy for ${context.sendingDomain}, then mark it verified in Settings.`
          : 'Set a sending domain in Settings, publish DMARC, and mark it verified.',
      status: dmarcReady ? 'ready' : 'action',
      action: { label: 'Open Settings', href: '/dashboard/settings' },
    },
    {
      key: 'unsubscribe',
      title: 'Unsubscribe handling is active',
      detail: 'Every campaign includes an unsubscribe link, and unsubscribed contacts are skipped automatically on future sends.',
      status: 'ready',
      action: { label: 'Open Campaigns', href: '/dashboard/campaigns' },
    },
    {
      key: 'suppression',
      title: 'Suppression is active',
      detail:
        context.suppressedContacts > 0
          ? `${context.suppressedContacts} suppressed contacts are currently blocked from future sends.`
          : 'MailFlow is configured to skip unsubscribed and bounced contacts automatically on future sends.',
      status: 'ready',
      action: { label: 'Open Lists', href: '/dashboard/lists' },
    },
    {
      key: 'bounce',
      title: 'Bounce and complaint handling is wired',
      detail:
        context.provider === 'mock'
          ? 'Switch to a real provider and configure webhook secrets so SES or Resend can report bounces and complaints.'
          : context.hasWebhookSharedSecret
            ? 'Webhook secret is stored. Make sure your provider points at the webhook endpoint in production.'
            : 'Add the webhook shared secret in Settings, then connect your provider webhooks.',
      status: context.provider !== 'mock' && context.hasWebhookSharedSecret ? 'ready' : 'action',
      action: { label: 'Open Settings', href: '/dashboard/settings' },
    },
    {
      key: 'test-list',
      title: 'Default test list exists',
      detail: context.defaultTestListName
        ? `Using "${context.defaultTestListName}" for one-click test sends.`
        : 'Create or mark one list as the default test list before using one-click tests.',
      status: context.defaultTestListName ? 'ready' : 'action',
      action: { label: 'Open Lists', href: '/dashboard/lists' },
    },
    {
      key: 'content',
      title: 'Spam-safe content is reviewed',
      detail:
        'Check subject lines, links, images, and audience fit before each send. Avoid purchased lists and stale contacts.',
      status: 'manual',
      action: { label: 'Open Campaigns', href: '/dashboard/campaigns' },
    },
  ];
}
