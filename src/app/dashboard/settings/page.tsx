'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useToast } from '@/components/toast-provider';

type Settings = {
  provider: 'mock' | 'resend' | 'aws-ses';
  awsRegion: string;
  awsFromEmail: string;
  hasAwsAccessKeyId: boolean;
  hasAwsSecretAccessKey: boolean;
  hasAwsSessionToken: boolean;
  resendApiKeyMasked: boolean;
  resendFromEmail: string;
  hasWebhookSharedSecret: boolean;
  imageUploadLimitKb: number;
  sendingDomain: string;
  spfVerified: boolean;
  dkimVerified: boolean;
  dmarcVerified: boolean;
  source: 'database' | 'env';
};

type SenderIdentity = {
  defaultFromEmail: string;
  defaultReplyToEmail: string;
  fromEmail: string;
  replyToEmail: string;
  senderFromEmail: string;
  senderReplyToEmail: string;
};

type CurrentUser = {
  role: 'ADMIN' | 'MANAGER' | 'USER';
  userId: string;
  email: string;
  name: string | null;
  senderFromEmail: string | null;
  senderReplyToEmail: string | null;
  capabilities: string[];
};

export default function SettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [senderIdentity, setSenderIdentity] = useState<SenderIdentity | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingSenderIdentity, setSavingSenderIdentity] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const [provider, setProvider] = useState<'mock' | 'resend' | 'aws-ses'>('mock');
  const [awsRegion, setAwsRegion] = useState('');
  const [awsFromEmail, setAwsFromEmail] = useState('');
  const [awsAccessKeyId, setAwsAccessKeyId] = useState('');
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState('');
  const [awsSessionToken, setAwsSessionToken] = useState('');
  const [resendApiKey, setResendApiKey] = useState('');
  const [resendFromEmail, setResendFromEmail] = useState('');
  const [webhookSharedSecret, setWebhookSharedSecret] = useState('');
  const [imageUploadLimitKb, setImageUploadLimitKb] = useState('50');
  const [sendingDomain, setSendingDomain] = useState('');
  const [spfVerified, setSpfVerified] = useState(false);
  const [dkimVerified, setDkimVerified] = useState(false);
  const [dmarcVerified, setDmarcVerified] = useState(false);
  const [senderFromEmail, setSenderFromEmail] = useState('');
  const [senderReplyToEmail, setSenderReplyToEmail] = useState('');

  const [testToEmail, setTestToEmail] = useState('');
  const [testSubject, setTestSubject] = useState('MailFlow test email');
  const [testBodyHtml, setTestBodyHtml] = useState('<p>Hello, this is a test email from MailFlow.</p>');

  async function loadSessionAndSettings() {
    const meResponse = await fetch('/api/auth/me', { cache: 'no-store' });
    const meData = (await meResponse.json()) as { user?: CurrentUser; error?: string };

    if (!meResponse.ok || !meData.user) {
      toast.error('Account load failed', meData.error || 'Account details could not be loaded.');
      return;
    }

    setCurrentUser(meData.user);

    const res = await fetch('/api/settings', { cache: 'no-store' });
    const data = (await res.json()) as { settings?: Settings; senderIdentity?: SenderIdentity; error?: string };
    if (!res.ok) {
      toast.error('Settings load failed', data.error || 'Settings could not be loaded.');
      return;
    }

    setSenderIdentity(data.senderIdentity || null);
    setSenderFromEmail(data.senderIdentity?.senderFromEmail || '');
    setSenderReplyToEmail(data.senderIdentity?.senderReplyToEmail || '');

    if (!data.settings) {
      setSettings(null);
      return;
    }

    setSettings(data.settings);
    setProvider(data.settings.provider);
    setAwsRegion(data.settings.awsRegion);
    setAwsFromEmail(data.settings.awsFromEmail);
    setResendFromEmail(data.settings.resendFromEmail);
    setImageUploadLimitKb(String(data.settings.imageUploadLimitKb || 50));
    setSendingDomain(data.settings.sendingDomain || '');
    setSpfVerified(Boolean(data.settings.spfVerified));
    setDkimVerified(Boolean(data.settings.dkimVerified));
    setDmarcVerified(Boolean(data.settings.dmarcVerified));
  }

  useEffect(() => {
    loadSessionAndSettings();
  }, []);

  async function saveSenderSettings(event: FormEvent) {
    event.preventDefault();
    setSavingSenderIdentity(true);

    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        senderFromEmail,
        senderReplyToEmail,
      }),
    });

    const data = (await res.json()) as { error?: string; senderIdentity?: SenderIdentity };
    setSavingSenderIdentity(false);

    if (!res.ok) {
      toast.error('Sender settings failed', data.error || 'Your sender identity could not be saved.');
      return;
    }

    setSenderIdentity(data.senderIdentity || null);
    setSenderFromEmail(data.senderIdentity?.senderFromEmail || '');
    setSenderReplyToEmail(data.senderIdentity?.senderReplyToEmail || '');
    toast.success('Sender settings saved', 'Your from and reply-to defaults were updated.');
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!currentUser?.capabilities?.includes('manage_settings')) {
      toast.warning('Admin only', 'Mail Provider settings are admin-only.');
      return;
    }
    setSaving(true);

    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider,
        awsRegion,
        awsFromEmail,
        awsAccessKeyId,
        awsSecretAccessKey,
        awsSessionToken,
        resendApiKey,
        resendFromEmail,
        webhookSharedSecret,
        imageUploadLimitKb: Number(imageUploadLimitKb),
        sendingDomain,
        spfVerified,
        dkimVerified,
        dmarcVerified,
      }),
    });

    const data = (await res.json()) as { error?: string; settings?: Settings };
    setSaving(false);

    if (!res.ok) {
      toast.error('Settings save failed', data.error || 'The settings could not be saved.');
      return;
    }

    toast.success('Settings saved', 'Mail and compliance settings were updated.');
    setAwsAccessKeyId('');
    setAwsSecretAccessKey('');
    setAwsSessionToken('');
    setResendApiKey('');
    setWebhookSharedSecret('');
    setSendingDomain(data.settings?.sendingDomain || '');
    await loadSessionAndSettings();
  }

  async function sendTestEmail(event: FormEvent) {
    event.preventDefault();
    setSendingTest(true);

    const res = await fetch('/api/settings/test-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        toEmail: testToEmail,
        subject: testSubject,
        bodyHtml: testBodyHtml,
      }),
    });

    const data = (await res.json()) as { error?: string; provider?: string };
    setSendingTest(false);

    if (!res.ok) {
      toast.error('Test email failed', data.error || 'The test email could not be sent.');
      return;
    }

    toast.success('Test email sent', `Sent via ${data.provider || provider}.`);
  }

  return (
    <div className="overview">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <h1>Settings</h1>
            <p>Configure the active mail provider, store credentials securely, and send a live test email.</p>
          </div>
          <div className="header-actions">
            <Link className="btn-secondary" href="/dashboard/help">Help</Link>
          </div>
        </div>
      </header>
      <div className="card dashboard-panel" style={{ marginBottom: '1rem' }}>
        <h2>Personal Sender Identity</h2>
        <form className="auth-form" onSubmit={saveSenderSettings}>
          <input
            type="email"
            value={senderFromEmail}
            onChange={(e) => setSenderFromEmail(e.target.value)}
            placeholder={currentUser?.email || 'your@email.com'}
          />
          <input
            type="email"
            value={senderReplyToEmail}
            onChange={(e) => setSenderReplyToEmail(e.target.value)}
            placeholder={senderFromEmail || senderIdentity?.defaultReplyToEmail || currentUser?.email || 'reply-to@email.com'}
          />
          <button className="btn-primary" type="submit" disabled={savingSenderIdentity}>
            {savingSenderIdentity ? 'Saving...' : 'Save Sender Identity'}
          </button>
        </form>
        <p className="form-note">
          Leave From email blank to use your login email: <strong>{senderIdentity?.defaultFromEmail || currentUser?.email || 'Not available'}</strong>.
          Leave Reply-to blank to use the current From email automatically.
        </p>
      </div>
      {currentUser?.capabilities?.includes('manage_settings') ? (
        <div className="card dashboard-panel" style={{ marginBottom: '1rem' }}>
          <h2>Mail Provider</h2>
          <form className="auth-form" onSubmit={saveSettings}>
            <select className="status-select" value={provider} onChange={(e) => setProvider(e.target.value as Settings['provider'])}>
              <option value="mock">Mock</option>
              <option value="resend">Resend</option>
              <option value="aws-ses">AWS SES</option>
            </select>

            {provider === 'aws-ses' ? (
              <>
                <input value={awsRegion} onChange={(e) => setAwsRegion(e.target.value)} placeholder="AWS region, e.g. ap-south-1" />
                <input value={awsFromEmail} onChange={(e) => setAwsFromEmail(e.target.value)} placeholder="From email, e.g. no-reply@yourdomain.com" />
                <input value={awsAccessKeyId} onChange={(e) => setAwsAccessKeyId(e.target.value)} placeholder={settings?.hasAwsAccessKeyId ? 'Access key stored - leave blank to keep' : 'AWS access key id'} />
                <input type="password" value={awsSecretAccessKey} onChange={(e) => setAwsSecretAccessKey(e.target.value)} placeholder={settings?.hasAwsSecretAccessKey ? 'Secret key stored - leave blank to keep' : 'AWS secret access key'} />
                <input type="password" value={awsSessionToken} onChange={(e) => setAwsSessionToken(e.target.value)} placeholder={settings?.hasAwsSessionToken ? 'Session token stored - leave blank to keep' : 'Optional session token'} />
              </>
            ) : null}

            {provider === 'resend' ? (
              <>
                <input type="password" value={resendApiKey} onChange={(e) => setResendApiKey(e.target.value)} placeholder={settings?.resendApiKeyMasked ? 'API key stored - leave blank to keep' : 'Resend API key'} />
                <input value={resendFromEmail} onChange={(e) => setResendFromEmail(e.target.value)} placeholder="From email, e.g. no-reply@example.com" />
              </>
            ) : null}

            <input type="password" value={webhookSharedSecret} onChange={(e) => setWebhookSharedSecret(e.target.value)} placeholder={settings?.hasWebhookSharedSecret ? 'Webhook secret stored - leave blank to keep' : 'Webhook shared secret'} />
            <input
              value={imageUploadLimitKb}
              onChange={(e) => setImageUploadLimitKb(e.target.value)}
              type="number"
              min={1}
              step={1}
              placeholder="Default image upload limit KB"
            />

            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </form>
          <p className="form-note">
            Stored values are kept encrypted in the database. Leave secret fields blank to keep the existing value. The upload limit applies to users without a per-user override.
            For AWS SES event tracking, point your SNS subscription at <strong>/api/webhooks/aws-ses</strong>. MailFlow now verifies SNS signatures and auto-confirms the subscription handshake.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <h2>Mail Provider</h2>
          <p className="form-note">Mail Provider settings are managed by admins only.</p>
          <p className="form-note">Image upload limits are also controlled by admins, with per-user overrides where assigned.</p>
        </div>
      )}

      {currentUser?.capabilities?.includes('manage_settings') ? (
        <div className="card dashboard-panel" style={{ marginBottom: '1rem' }}>
          <h2>Compliance Automation</h2>
          <form className="auth-form" onSubmit={saveSettings}>
            <input value={sendingDomain} onChange={(e) => setSendingDomain(e.target.value)} placeholder="Sending domain, e.g. mail.example.com" />

            <label className="inline-toggle">
              <input type="checkbox" checked={spfVerified} onChange={(e) => setSpfVerified(e.target.checked)} />
              <span>SPF verified</span>
            </label>

            <label className="inline-toggle">
              <input type="checkbox" checked={dkimVerified} onChange={(e) => setDkimVerified(e.target.checked)} />
              <span>DKIM verified</span>
            </label>

            <label className="inline-toggle">
              <input type="checkbox" checked={dmarcVerified} onChange={(e) => setDmarcVerified(e.target.checked)} />
              <span>DMARC verified</span>
            </label>

            <p className="form-note">
              These flags feed the Help and Admin compliance checks. We can show live readiness from the app, while DNS verification itself still happens outside MailFlow.
            </p>
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Compliance'}
            </button>
          </form>
        </div>
      ) : null}

      <div className="card dashboard-panel">
        <h2>Send Test Email</h2>
        <form className="auth-form" onSubmit={sendTestEmail}>
          <input type="email" value={testToEmail} onChange={(e) => setTestToEmail(e.target.value)} placeholder="recipient@example.com" required />
          <input value={testSubject} onChange={(e) => setTestSubject(e.target.value)} placeholder="Subject" required />
          <textarea className="auth-textarea" rows={6} value={testBodyHtml} onChange={(e) => setTestBodyHtml(e.target.value)} required />
          <button className="btn-primary" type="submit" disabled={sendingTest}>
            {sendingTest ? 'Sending...' : 'Send Test Email'}
          </button>
        </form>
        <p className="form-note">This uses your current sender identity together with the selected provider credentials. It does not create a campaign record.</p>
      </div>
    </div>
  );
}
