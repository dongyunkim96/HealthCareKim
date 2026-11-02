import Link from 'next/link';
import { MarketingNav, Footer } from '@/components/marketing';
export default function About() {
  return (
    <>
      <MarketingNav />
      <main id="main-content" className="about-page">
        <p className="eyebrow">PURPOSEFULLY THOUGHTFUL</p>
        <h1>
          Good software gives
          <br />
          people room to care.
        </h1>
        <p className="lead">
          HealthCareKim explores a simple idea: clinic operations should feel clear, connected, and
          manageable.
        </p>
        <div className="about-grid">
          <article>
            <h2>Clarity over clutter</h2>
            <p>
              Useful density, honest status, and an obvious next action. Every screen is designed
              around a real operational task.
            </p>
          </article>
          <article>
            <h2>Context stays together</h2>
            <p>
              Assignments, internal notes, appointments, and a chronological audit history help
              teams coordinate with confidence.
            </p>
          </article>
          <article>
            <h2>Boundaries that matter</h2>
            <p>
              Clinics have separate records and role permissions. Every demo workspace is isolated
              and expires after 24 hours.
            </p>
          </article>
          <article>
            <h2>An honest demonstration</h2>
            <p>
              This is a frontend engineering portfolio project using synthetic data. It is not a
              clinical system, provides no medical advice, and makes no HIPAA or security
              certification claims. It is not affiliated with Bask Health.
            </p>
          </article>
        </div>
        <Link href="/demo" className="btn btn-primary">
          Explore the demo →
        </Link>
      </main>
      <Footer />
    </>
  );
}
