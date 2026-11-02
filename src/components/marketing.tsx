import Link from 'next/link';
import { Logo } from './ui';
export function MarketingNav() {
  return (
    <header className="marketing-nav">
      <Logo />
      <nav aria-label="Main navigation">
        <Link href="/about">Our approach</Link>
        <Link href="/#workflow">How it works</Link>
        <Link href="/demo" className="btn btn-primary">
          Explore demo <span aria-hidden="true">↗</span>
        </Link>
      </nav>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="marketing-footer">
      <div>
        <Logo />
        <p>
          Clarity for every clinic.
          <br />
          Confidence in every workflow.
        </p>
      </div>
      <div>
        <strong>Explore</strong>
        <Link href="/">Product</Link>
        <Link href="/#workflow">The workflow</Link>
        <Link href="/about">About this project</Link>
        <Link href="/demo">Try the demo</Link>
      </div>
      <div className="footer-disclosure">
        <strong>Designed for a clearer day.</strong>
        <p>
          Portfolio demonstration. All clinics, people, and records are fictional. No real patient
          information. No clinical advice.
        </p>
        <small>© {new Date().getFullYear()} HealthCareKim</small>
      </div>
    </footer>
  );
}
