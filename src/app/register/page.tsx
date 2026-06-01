import Link from 'next/link';

export default function RegisterPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Access by Invitation</h1>
        <p>
          MailFlow does not allow public self-registration. An admin must create your access first,
          then you can sign in with Google.
        </p>
        <Link href="/login" className="btn-primary">
          Go to Sign In
        </Link>
      </section>
    </main>
  );
}
