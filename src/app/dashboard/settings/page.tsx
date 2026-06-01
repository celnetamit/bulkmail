'use client';

import { FormEvent, useEffect, useState } from 'react';

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
  source: 'database' | 'env';
};

type CurrentUser = {
  role: 'ADMIN' | 'USER';
  email: string;
  name: string | null;
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
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

  const [testToEmail, setTestToEmail] = useState('');
  const [testSubject, setTestSubject] = useState('MailFlow test email');
  const [testBodyHtml, setTestBodyHtml] = useState('<p>Hello, this is a test email from MailFlow.</p>');

  async function loadSessionAndSettings() {
    const meResponse = await fetch('/api/auth/me', { cache: 'no-store' });
    const meData = (await meResponse.json()) as { user?: CurrentUser; error?: string };

    if (!meResponse.ok || !meData.user) {
      setMessage(meData.error || 'Failed to load account details.');
      return;
    }

    setCurrentUser(meData.user);

    if (meData.user.role !== 'ADMIN') {
      setSettings(null);
      return;
    }

    const res = await fetch('/api/settings', { cache: 'no-store' });
    const data = (await res.json()) as { settings?: Settings; error?: string };
    if (!res.ok) {
      setMessage(data.error || 'Failed to load settings.');
      return;
    }

    if (!data.settings) return;
    setSettings(data.settings);
    setProvider(data.settings.provider);
    setAwsRegion(data.settings.awsRegion);
    setAwsFromEmail(data.settings.awsFromEmail);
    setResendFromEmail(data.settings.resendFromEmail);
  }

  useEffect(() => {
    loadSessionAndSettings();
  }, []);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (currentUser?.role !== 'ADMIN') {
      setMessage('Mail Provider settings are admin-only.');
      return;
    }
    setSaving(true);
    setMessage('');

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
      }),
    });

    const data = (await res.json()) as { error?: string; settings?: Settings };
    setSaving(false);

    if (!res.ok) return setMessage(data.error || 'Failed to save settings.');

    setMessage('Settings saved.');
    setAwsAccessKeyId('');
    setAwsSecretAccessKey('');
    setAwsSessionToken('');
    setResendApiKey('');
    setWebhookSharedSecret('');
    await loadSessionAndSettings();
  }

  async function sendTestEmail(event: FormEvent) {
    event.preventDefault();
    setSendingTest(true);
    setMessage('');

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

    if (!res.ok) return setMessage(data.error || 'Failed to send test email.');

    setMessage(`Test email sent via ${data.provider || provider}.`);
  }

  return (
    <div className="overview">
      <header className="page-header">
        <h1>Settings</h1>
        <p>Configure the active mail provider, store credentials securely, and send a live test email.</p>
      </header>

      {message ? <p className="form-note">{message}</p> : null}

      {currentUser?.role === 'ADMIN' ? (
        <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
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

            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </form>
          <p className="form-note">Stored values are kept encrypted in the database. Leave secret fields blank to keep the existing value.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <h2>Mail Provider</h2>
          <p className="form-note">Mail Provider settings are managed by admins only.</p>
        </div>
      )}

      <div className="card" style={{ padding: '1rem' }}>
        <h2>Send Test Email</h2>
        <form className="auth-form" onSubmit={sendTestEmail}>
          <input type="email" value={testToEmail} onChange={(e) => setTestToEmail(e.target.value)} placeholder="recipient@example.com" required />
          <input value={testSubject} onChange={(e) => setTestSubject(e.target.value)} placeholder="Subject" required />
          <textarea className="auth-textarea" rows={6} value={testBodyHtml} onChange={(e) => setTestBodyHtml(e.target.value)} required />
          <button className="btn-primary" type="submit" disabled={sendingTest}>
            {sendingTest ? 'Sending...' : 'Send Test Email'}
          </button>
        </form>
        <p className="form-note">This uses the currently selected provider and settings. It does not create a campaign record.</p>
      </div>
    </div>
  );
}
