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
          <a href="/register" className="btn-primary">Create Account</a>
          <a href="/login" className="btn-secondary">Sign In</a>
        </div>
      </header>
    </main>
  );
}
