import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { getDefaultTestList } from '@/lib/campaign-lists';
import { getMailSettings } from '@/lib/mail-settings';

export const dynamic = 'force-dynamic';

const steps = [
  {
    title: 'Start with a list',
    body: 'Create the customer lists you want to email, plus one default test list for preview sends. Add contacts manually or import a CSV, then clean duplicates and invalid addresses before sending anything.',
    action: { label: 'Open Lists', href: '/dashboard/lists' },
  },
  {
    title: 'Build a reusable template',
    body: 'Use Templates when you want the same structure again later. Keep the subject clear, use the visual editor for layout, and switch to HTML only when you need precise markup control.',
    action: { label: 'Open Templates', href: '/dashboard/templates' },
  },
  {
    title: 'Create a campaign draft',
    body: 'A campaign connects one message to one or more customer lists. Pick the right lists, choose a template if you have one, and write a focused subject line and body.',
    action: { label: 'Open Campaigns', href: '/dashboard/campaigns' },
  },
  {
    title: 'Send a test first',
    body: 'Before you send at scale, use your default test list or the one-click test option on a campaign. Check the subject, layout, links, and unsubscribe footer.',
    action: { label: 'Open Settings', href: '/dashboard/settings' },
  },
  {
    title: 'Watch results live',
    body: 'After sending, check Analytics for opens, bounces, and unsubscribes. If something looks off, pause and fix the list or message before sending the next batch.',
    action: { label: 'Open Analytics', href: '/dashboard/analytics' },
  },
];

type ComplianceStatus = 'ready' | 'manual' | 'action';

type ComplianceItem = {
  title: string;
  detail: string;
  status: ComplianceStatus;
  action?: { label: string; href: string };
};

const tips = [
  {
    title: 'If you are new here',
    body: 'Do not start by building a campaign. Start with a list, then a template, then a campaign. That order keeps the workflow easy to follow.',
  },
  {
    title: 'If you cannot change Mail Provider',
    body: 'Only admins can manage the provider settings. Regular users can still create lists, build campaigns, and send within their allowed quota.',
  },
  {
    title: 'If an email bounces or is unsubscribed',
    body: 'Those contacts are automatically skipped on future sends. You can review contact status inside the list detail page.',
  },
  {
    title: 'If you need images',
    body: 'Use the visual editor upload button to add images. The size limit is controlled by your admin, and per-user overrides may apply.',
  },
];

function statusLabel(status: ComplianceStatus) {
  if (status === 'ready') return 'Ready';
  if (status === 'manual') return 'Manual check';
  return 'Needs action';
}

function statusClass(status: ComplianceStatus) {
  if (status === 'ready') return 'badge-success';
  return 'badge-warning';
}

export default async function HelpPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/login');

  const [mailSettings, defaultTestList] = await Promise.all([
    getMailSettings(user.userId),
    getDefaultTestList(user.userId),
  ]);

  const senderConfigured = Boolean(
    (mailSettings.provider === 'aws-ses' && mailSettings.awsFromEmail) ||
      (mailSettings.provider === 'resend' && mailSettings.resendFromEmail) ||
      (mailSettings.provider === 'mock' && mailSettings.source === 'env'),
  );

  const complianceItems: ComplianceItem[] = [
    {
      title: 'Sender identity is configured',
      detail: senderConfigured
        ? `Current provider: ${mailSettings.provider}. Sender details are loaded from ${mailSettings.source}.`
        : 'Set a real sender email in Settings before sending live mail.',
      status: senderConfigured ? 'ready' : 'action',
      action: { label: 'Open Settings', href: '/dashboard/settings' },
    },
    {
      title: 'SPF, DKIM, and DMARC are published',
      detail:
        'Publish SPF, DKIM, and DMARC records for your sending domain so Gmail and other providers can trust your mail. MailFlow cannot verify DNS from inside the app.',
      status: 'manual',
      action: { label: 'Review Settings', href: '/dashboard/settings' },
    },
    {
      title: 'Unsubscribe handling is active',
      detail: 'Every campaign includes an unsubscribe link, and unsubscribed contacts are skipped automatically on future sends.',
      status: 'ready',
      action: { label: 'Open Campaigns', href: '/dashboard/campaigns' },
    },
    {
      title: 'Bounce and complaint handling is wired',
      detail: mailSettings.provider === 'mock'
        ? 'Switch to a real provider and configure webhook secrets so SES or Resend can report bounces and complaints.'
        : mailSettings.hasWebhookSharedSecret
          ? 'Webhook secret is stored. Make sure your provider points at the webhook endpoint in production.'
          : 'Add the webhook shared secret in Settings, then connect your provider webhooks.',
      status: mailSettings.provider !== 'mock' && mailSettings.hasWebhookSharedSecret ? 'ready' : 'action',
      action: { label: 'Open Settings', href: '/dashboard/settings' },
    },
    {
      title: 'Default test list exists',
      detail: defaultTestList
        ? `Using "${defaultTestList.name}" for one-click test sends.`
        : 'Create or mark one list as the default test list before using one-click tests.',
      status: defaultTestList ? 'ready' : 'action',
      action: { label: 'Open Lists', href: '/dashboard/lists' },
    },
    {
      title: 'Spam-safe content is reviewed',
      detail:
        'Check subject lines, links, images, and audience fit before each send. Avoid purchased lists and stale contacts.',
      status: 'manual',
      action: { label: 'Open Campaigns', href: '/dashboard/campaigns' },
    },
  ];

  const readyCount = complianceItems.filter((item) => item.status === 'ready').length;
  const totalCount = complianceItems.length;

  return (
    <div className="overview">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <h1>Help</h1>
            <p>A guided walkthrough for getting comfortable with MailFlow, one step at a time.</p>
          </div>
          <div className="header-actions">
            <Link className="btn-secondary" href="/dashboard">Back to Overview</Link>
            <Link className="btn-secondary" href="/dashboard/campaigns/create">Create Campaign</Link>
          </div>
        </div>
      </header>

      <div className="help-callout card">
        <div>
          <h2>Best way to use the platform</h2>
          <p className="help-callout__eyebrow">Welcome{user.name ? `, ${user.name}` : `, ${user.email}`}. This is your guided starting path.</p>
          <p>Follow the flow below in order. It will save you a lot of backtracking and keeps every campaign tied to the right list and template.</p>
        </div>
        <div className="help-callout__actions">
          <Link className="btn-primary" href="/dashboard/lists">Start with Lists</Link>
          <Link className="btn-secondary" href="/dashboard/campaigns/create">Create Campaign</Link>
        </div>
      </div>

      <section className="card help-panel">
        <div className="help-panel__header">
          <div>
            <h2>Compliance checklist</h2>
            <p>Use this before every launch. The app can confirm the items it controls and flags the rest for manual review.</p>
          </div>
          <div className="help-panel__summary">
            <span className="badge badge-success">{readyCount}/{totalCount} ready</span>
            <Link className="mini-btn" href="/dashboard/settings">Open Settings</Link>
          </div>
        </div>
        <div className="help-compliance-grid">
          {complianceItems.map((item) => (
            <article className="help-compliance-card" key={item.title}>
              <div className="help-compliance-card__head">
                <span className={`badge ${statusClass(item.status)}`}>{statusLabel(item.status)}</span>
                <h3>{item.title}</h3>
              </div>
              <p>{item.detail}</p>
              {item.action ? (
                <Link className="mini-btn" href={item.action.href}>
                  {item.action.label}
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <div className="help-grid">
        {steps.map((step, index) => (
          <article className="help-card" key={step.title}>
            <div className="help-card__header">
              <span className="help-step-index">{index + 1}</span>
              <div>
                <h2>{step.title}</h2>
                <p>{step.body}</p>
              </div>
            </div>
            <Link className="mini-btn" href={step.action.href}>
              {step.action.label}
            </Link>
          </article>
        ))}
      </div>

      <div className="help-bottom-grid">
        <section className="card help-panel">
          <h2>Quick checklist</h2>
          <ul className="help-checklist">
            <li>Confirm your contact list is clean and up to date.</li>
            <li>Mark one list as the default test list before using one-click tests.</li>
            <li>Use the template editor if the layout will be reused.</li>
            <li>Send one test email before bulk sending.</li>
            <li>Check Analytics after the first send batch.</li>
            <li>Review unsubscribes and bounces before the next send.</li>
          </ul>
        </section>

        <section className="card help-panel">
          <h2>Need to know</h2>
          <div className="help-tips">
            {tips.map((tip) => (
              <div className="help-tip" key={tip.title}>
                <h3>{tip.title}</h3>
                <p>{tip.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card help-panel">
        <h2>Shortcuts</h2>
        <div className="help-links">
          <Link className="help-link" href="/dashboard/lists">Lists</Link>
          <Link className="help-link" href="/dashboard/templates">Templates</Link>
          <Link className="help-link" href="/dashboard/campaigns">Campaigns</Link>
          <Link className="help-link" href="/dashboard/media-library">Media Library</Link>
          <Link className="help-link" href="/dashboard/analytics">Analytics</Link>
          <Link className="help-link" href="/dashboard/settings">Settings</Link>
        </div>
      </section>
    </div>
  );
}
