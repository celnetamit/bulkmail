import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUserFromCookies } from '@/lib/auth';

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
];

export default async function HelpPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect('/login');

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
