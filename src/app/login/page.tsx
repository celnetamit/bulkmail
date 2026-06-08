import Link from 'next/link';
import { APP_ROUTES, API_ROUTES } from '@/lib/routes';

function getErrorMessage(error: string | undefined) {
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

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string; error?: string };
}) {
  const nextPath = searchParams?.next || APP_ROUTES.DASHBOARD;
  const error = getErrorMessage(searchParams?.error);
  const googleSignInUrl = `${API_ROUTES.AUTH_GOOGLE_START}?next=${encodeURIComponent(nextPath)}`;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Sign In</h1>
        <p>Use your Google account to access your provisioned MailFlow workspace.</p>
        {error ? <div className="form-error">{error}</div> : null}
        <div className="auth-form">
          <Link className="btn-primary" href={googleSignInUrl}>
            Continue with Google
          </Link>
        </div>
        <p className="auth-link" style={{ marginTop: '1rem' }}>
          Access is provisioned by an admin. There is no public registration.
        </p>
      </section>
    </main>
  );
}
