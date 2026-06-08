import Link from 'next/link';
import { APP_ROUTES } from '@/lib/routes';

export default function RegisterPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Access by Invitation</h1>
        <p>
          MailFlow does not allow public self-registration. An admin must create your access first,
          then you can sign in with Google.
        </p>
        <Link href={APP_ROUTES.LOGIN} className="btn-primary">
          Go to Sign In
        </Link>
      </section>
    </main>
  );
}
