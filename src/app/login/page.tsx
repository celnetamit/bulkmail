'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';

function getErrorMessage(error: string | null) {
  switch (error) {
    case 'not_provisioned':
      return 'Your email is not provisioned yet. Ask an admin to create your access first.';
    case 'auth_failed':
      return 'Google sign-in failed. Please try again.';
    case 'google_missing':
      return 'Google sign-in is not configured yet.';
    case 'disabled':
      return 'Your account is disabled.';
    default:
      return '';
  }
}

export default function LoginPage() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') || '/dashboard';
  const error = useMemo(() => getErrorMessage(searchParams.get('error')), [searchParams]);
  const googleSignInUrl = `/api/auth/google/start?next=${encodeURIComponent(nextPath)}`;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Sign In</h1>
        <p>Use your Google account to access your provisioned MailFlow workspace.</p>
        {error ? <div className="form-error">{error}</div> : null}
        <div className="auth-form">
          <a className="btn-primary" href={googleSignInUrl}>
            Continue with Google
          </a>
        </div>
        <p className="auth-link" style={{ marginTop: '1rem' }}>
          Access is provisioned by an admin. There is no public registration.
        </p>
      </section>
    </main>
  );
}
