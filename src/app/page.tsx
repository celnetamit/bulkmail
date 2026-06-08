import Link from 'next/link';
import { APP_ROUTES } from '@/lib/routes';

export default function Home() {
  return (
    <main className="container">
      <header className="hero">
        <h1>Welcome to MailFlow</h1>
        <p>
          Your premium bulk email sending platform. Seamlessly manage lists,
          craft templates, and launch campaigns.
        </p>
        <div className="actions">
          <Link href={APP_ROUTES.LOGIN} className="btn-primary">Sign In with Google</Link>
        </div>
      </header>
    </main>
  );
}
