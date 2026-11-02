'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Building2, ShieldCheck, Users, Eye, Check } from 'lucide-react';
import { MarketingNav, Footer } from '@/components/marketing';
import { Button, ErrorBox } from '@/components/ui';
import { demoAction } from '@/lib/client';
export default function Demo() {
  const [persona, setPersona] = useState('admin'),
    [clinic, setClinic] = useState('willow'),
    [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  const router = useRouter();
  async function enter() {
    setPending(true);
    setError(undefined);
    try {
      await demoAction('enter', persona);
      router.push(`/app/${clinic}/overview`);
      router.refresh();
    } catch (e) {
      setError(e);
      setPending(false);
    }
  }
  return (
    <>
      <MarketingNav />
      <main id="main-content" className="demo-page">
        <span className="pill">
          <span className="live-dot" /> YOUR OWN SPACE TO EXPLORE
        </span>
        <h1>Step into a clearer day.</h1>
        <p className="lead">
          Choose a perspective and a clinic. We’ll create your own workspace with fictional records,
          ready to explore.
        </p>
        <div className="demo-section">
          <h2>
            <span>01</span> Choose your perspective
          </h2>
          <div className="persona-grid">
            {[
              {
                id: 'admin',
                icon: ShieldCheck,
                title: 'Clinic administrator',
                desc: 'The whole picture. Manage cases, appointments, your team, and clinic settings.',
              },
              {
                id: 'coordinator',
                icon: Users,
                title: 'Care coordinator',
                desc: 'Keep work moving. Assign cases, leave notes, and coordinate appointments.',
              },
              {
                id: 'viewer',
                icon: Eye,
                title: 'Workspace viewer',
                desc: 'Stay in the loop. Explore records, schedules, and activity with read-only access.',
              },
            ].map((x) => (
              <button
                key={x.id}
                className={`persona-card ${persona === x.id ? 'selected' : ''}`}
                onClick={() => setPersona(x.id)}
                aria-pressed={persona === x.id}
              >
                <span className="persona-icon">
                  <x.icon size={23} />
                </span>
                {persona === x.id && <Check className="selected-check" size={18} />}
                <h3>{x.title}</h3>
                <p>{x.desc}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="demo-section">
          <h2>
            <span>02</span> Pick a starting clinic
          </h2>
          <div className="clinic-grid">
            {[
              ['willow', 'Willow Family Clinic', 'Brooklyn, NY · Eastern time'],
              ['harbor', 'Harbor Wellness', 'Chicago, IL · Central time'],
              ['summit', 'Summit Virtual Care', 'San Francisco, CA · Pacific time'],
            ].map(([id, name, loc]) => (
              <button
                key={id}
                className={`clinic-choice ${clinic === id ? 'selected' : ''}`}
                onClick={() => setClinic(id)}
                aria-pressed={clinic === id}
              >
                <Building2 size={22} />
                <span>
                  <strong>{name}</strong>
                  <small>{loc}</small>
                </span>
                {clinic === id && <Check size={17} />}
              </button>
            ))}
          </div>
        </div>
        {error != null && <ErrorBox error={error} />}
        <div className="demo-enter">
          <Button pending={pending} onClick={enter}>
            Enter my workspace <ArrowRight size={18} />
          </Button>
          <p>No signup · 450 synthetic cases · Expires in 24 hours</p>
        </div>
        <p className="demo-disclosure">
          Demo only. All people, clinics, and records are fictional. Changes persist in your
          isolated workspace. Please do not enter real patient information.
        </p>
      </main>
      <Footer />
    </>
  );
}
