import Link from 'next/link';
import {
  ArrowRight,
  Check,
  ClipboardList,
  Users,
  CalendarDays,
  ArrowUpRight,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { MarketingNav, Footer } from '@/components/marketing';
import { Badge, Avatar } from '@/components/ui';
export default function Home() {
  return (
    <>
      <MarketingNav />
      <main id="main-content">
        <section className="hero">
          <div className="hero-copy">
            <span className="pill">
              <span className="live-dot" /> A calmer way to run your clinic
            </span>
            <h1>
              Less busywork.
              <br />
              More <em>clarity.</em>
            </h1>
            <p>
              One thoughtful workspace for intake, appointments, and the people who keep your clinic
              moving.
            </p>
            <div className="hero-actions">
              <Link href="/demo" className="btn btn-primary btn-large">
                Explore the live demo <ArrowRight size={18} />
              </Link>
              <Link href="#workflow" className="btn btn-ghost">
                See how it works <ArrowUpRight size={17} />
              </Link>
            </div>
            <div className="hero-assurance">
              <span>
                <Check size={15} /> No signup needed
              </span>
              <span>
                <Check size={15} /> Your own demo workspace
              </span>
            </div>
          </div>
          <div className="hero-preview" aria-label="Example of the clinic operations interface">
            <div className="preview-top">
              <span className="preview-logo">✳</span>
              <strong>Willow Family Clinic</strong>
              <span className="preview-demo">DEMO</span>
              <Avatar name="Alex Morgan" />
            </div>
            <div className="preview-body">
              <div className="preview-greeting">
                <span className="eyebrow">YOUR CLINIC, AT A GLANCE</span>
                <h2>
                  A little more organized.
                  <br />A lot more in control.
                </h2>
              </div>
              <div className="preview-kpis">
                <div>
                  <ClipboardList size={18} />
                  <strong>120</strong>
                  <span>Open cases</span>
                </div>
                <div>
                  <Users size={18} />
                  <strong>24</strong>
                  <span>Need an owner</span>
                </div>
                <div>
                  <Check size={18} />
                  <strong>30</strong>
                  <span>Completed</span>
                </div>
              </div>
              <div className="preview-table">
                <div>
                  <strong>Today’s priorities</strong>
                  <span>View cases ↗</span>
                </div>
                {['Avery Bennett', 'Jordan Chen', 'Morgan Davis'].map((n, i) => (
                  <div className="preview-row" key={n}>
                    <Avatar name={n} />
                    <span>
                      <strong>{n}</strong>
                      <small>
                        {['New patient intake', 'Referral review', 'Follow-up coordination'][i]}
                      </small>
                    </span>
                    <Badge value={['In review', 'New', 'Completed'][i]} />
                  </div>
                ))}
              </div>
              <div className="preview-note">
                <span>
                  <ShieldCheck size={20} />
                </span>
                <p>
                  <strong>Every change has a story.</strong>
                  <br />A clear activity trail, always in view.
                </p>
                <Check size={16} />
              </div>
            </div>
          </div>
          <div className="hero-caption">
            <span className="live-dot" /> Thoughtfully connected. From intake to done.
          </div>
        </section>
        <section className="benefits-strip">
          <span>ONE CONNECTED WORKSPACE</span>
          <p>
            <ClipboardList /> Intake, with context
          </p>
          <p>
            <Users /> A team in sync
          </p>
          <p>
            <CalendarDays /> A clearer schedule
          </p>
          <p>
            <ShieldCheck /> Changes you can trace
          </p>
        </section>
        <section id="workflow" className="workflow-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">FROM THE FIRST REQUEST TO THE FINAL FOLLOW-UP</p>
              <h2>Good days start with a clear workflow.</h2>
            </div>
            <p className="muted">
              Bring the details together.
              <br />
              Keep the next step obvious.
            </p>
          </div>
          <div className="workflow-grid">
            {[
              {
                icon: ClipboardList,
                title: 'Bring every case into focus',
                body: 'Find the right intake, see what’s missing, and give every request a clear next step.',
              },
              {
                icon: Users,
                title: 'Give your team a shared view',
                body: 'Assign ownership, balance the workload, and move forward with the full context.',
              },
              {
                icon: CalendarDays,
                title: 'Keep the day moving',
                body: 'Coordinate appointments, follow progress, and leave a useful trail of every change.',
              },
            ].map((x, i) => (
              <article key={x.title}>
                <span className="step-number">0{i + 1}</span>
                <x.icon size={25} />
                <h3>{x.title}</h3>
                <p>{x.body}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="bottom-cta">
          <Sparkles size={27} />
          <h2>Meet your clinic’s clearer day.</h2>
          <p>
            Explore three fictional clinics, switch perspectives, and make the workspace your own.
          </p>
          <Link className="btn btn-primary btn-large" href="/demo">
            Step into the demo <ArrowRight size={17} />
          </Link>
          <small>Fictional data. Real, persistent workflows.</small>
        </section>
      </main>
      <Footer />
    </>
  );
}
