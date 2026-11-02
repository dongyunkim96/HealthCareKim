import Link from 'next/link';
export default function NotFound() {
  return (
    <main id="main-content" className="standalone">
      <span className="eyebrow">404 · Page not found</span>
      <h1>Let’s get you back on track.</h1>
      <p>This destination doesn’t exist or is outside your current workspace.</p>
      <Link href="/demo" className="btn btn-primary">
        Open demo workspace
      </Link>
      <Link href="/" className="btn btn-secondary">
        Go home
      </Link>
    </main>
  );
}
