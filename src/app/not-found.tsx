import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <main className="container" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <div className="card" style={{ maxWidth: 520, width: '100%', padding: '1.5rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Page not found</h1>
        <p style={{ marginBottom: '1rem' }}>The page you tried to open does not exist or was moved.</p>
        <Link className="btn-primary" href="/dashboard">
          Go to Dashboard
        </Link>
      </div>
    </main>
  );
}
