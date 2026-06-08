import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildComplianceItems } from '@/lib/compliance';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { getDefaultTestList } from '@/lib/campaign-lists';
import { getMailSettings } from '@/lib/mail-settings';
import { getPlatformSettings } from '@/lib/platform-settings';
import { APP_ROUTES } from '@/lib/routes';
import { queryRow } from '@/lib/sqlite';

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
  {
    title: 'If the sender name looks wrong',
    body: 'Open Settings and check Personal Sender Identity. Leave the sender name blank to use your login name automatically, or override it if you want campaigns to show a different friendly from name.',
  },
];

const awsSnsSteps = [
  'Verify the sender email address or sending domain in Amazon SES first.',
  'Create a Standard SNS topic, for example mailflow-ses-events.',
  'Create an HTTPS subscription that points to your public MailFlow endpoint: /api/webhooks/aws-ses.',
  'Wait for the subscription to become confirmed. MailFlow now verifies SNS signatures and auto-confirms the AWS handshake.',
  'In SES, publish delivery, bounce, and complaint notifications to that SNS topic.',
  'Optionally set AWS_SNS_TOPIC_ARN_ALLOWLIST in production so MailFlow accepts only your approved SNS topic ARNs.',
];

type ComplianceStatus = 'ready' | 'manual' | 'action';

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
  if (!user) redirect(APP_ROUTES.LOGIN);

  const [mailSettings, defaultTestList] = await Promise.all([
    getMailSettings(user.userId),
    getDefaultTestList(user.userId),
  ]);
  const platformSettings = await getPlatformSettings();
  const suppressedContacts = queryRow<{ count: number }>(
    `
      SELECT COUNT(*) as count
      FROM "Contact" c
      INNER JOIN "List" l ON l.id = c."listId"
      WHERE l."userId" = ?
        AND c.status IN ('UNSUBSCRIBED', 'BOUNCED')
    `,
    [user.userId],
  )?.count || 0;

  const complianceItems = buildComplianceItems({
    provider: mailSettings.provider,
    awsFromEmail: mailSettings.awsFromEmail,
    resendFromEmail: mailSettings.resendFromEmail,
    hasWebhookSharedSecret: mailSettings.hasWebhookSharedSecret,
    sendingDomain: platformSettings.sendingDomain,
    spfVerified: platformSettings.spfVerified,
    dkimVerified: platformSettings.dkimVerified,
    dmarcVerified: platformSettings.dmarcVerified,
    defaultTestListName: defaultTestList?.name,
    suppressedContacts,
  });

  const readyCount = complianceItems.filter((item) => item.status === 'ready').length;
  const totalCount = complianceItems.length;
  const publicAppUrl = process.env.APP_URL?.trim() || '';
  const awsWebhookEndpoint = publicAppUrl
    ? `${publicAppUrl.replace(/\/$/, '')}/api/webhooks/aws-ses`
    : '/api/webhooks/aws-ses';

  return (
    <div className="overview">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <h1>Help</h1>
            <p>A guided walkthrough for getting comfortable with MailFlow, one step at a time.</p>
          </div>
          <div className="header-actions">
            <Link className="btn-secondary" href={APP_ROUTES.DASHBOARD}>Back to Overview</Link>
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
        <div className="help-panel__header">
          <div>
            <h2>AWS SES and SNS setup</h2>
            <p>Use this when Amazon SES is your mail provider and you want MailFlow to receive delivered, bounced, complained, and opened event notifications from AWS.</p>
          </div>
          <div className="help-panel__summary">
            <span className="badge badge-success">{mailSettings.provider === 'aws-ses' ? 'AWS SES active' : 'Works with AWS SES'}</span>
            <Link className="mini-btn" href="/dashboard/settings">Open Settings</Link>
          </div>
        </div>

        <div className="help-tips" style={{ marginBottom: '1rem' }}>
          <div className="help-tip">
            <h3>Webhook endpoint</h3>
            <p>Use this HTTPS endpoint as the SNS subscription target for SES event notifications.</p>
            <p><strong>{awsWebhookEndpoint}</strong></p>
          </div>
          <div className="help-tip">
            <h3>IAM split</h3>
            <p>The MailFlow app runtime needs SES send access. SNS management permissions are only needed by the AWS user or role that creates topics, subscriptions, and SES event publishing rules.</p>
          </div>
        </div>

        <ol className="help-checklist">
          {awsSnsSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        <div className="help-tips" style={{ marginTop: '1rem' }}>
          <div className="help-tip">
            <h3>If the subscription stays pending</h3>
            <p>Make sure the app is publicly reachable over HTTPS and that AWS can POST to the webhook route without redirects or certificate errors.</p>
          </div>
          <div className="help-tip">
            <h3>Security note</h3>
            <p>You do not need the shared webhook secret for the AWS SNS path. MailFlow verifies the SNS signature directly and can restrict accepted topic ARNs with AWS_SNS_TOPIC_ARN_ALLOWLIST.</p>
          </div>
        </div>
      </section>

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
