'use client';
import { createContext, useContext, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@/server/router';
import { api, demoAction } from '@/lib/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import {
  LayoutDashboard,
  ClipboardList,
  CalendarDays,
  Users,
  Activity,
  Settings,
  ChevronDown,
  Search,
  Menu,
  ArrowUpRight,
  LogOut,
  RotateCcw,
  ShieldCheck,
  Building2,
  HelpCircle,
} from 'lucide-react';
import { Logo, Avatar, Modal, Button, ErrorBox, Loading } from './ui';
import { Overview } from './overview';
import { Cases } from './cases';
import { CaseDetail } from './case-detail';
import { Appointments } from './appointments';
import { Team, ActivityPage, SettingsPage } from './operations';
type Bootstrap = inferRouterOutputs<AppRouter>['bootstrap'];
const WorkspaceContext = createContext<{
  data: Bootstrap;
  slug: string;
  key: string;
} | null>(null);
export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('Workspace unavailable');
  return ctx;
}
const nav = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'cases', label: 'Cases', icon: ClipboardList },
  { id: 'appointments', label: 'Appointments', icon: CalendarDays },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'activity', label: 'Activity log', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings },
];
export function Workspace({
  slug,
  section,
  caseId,
  sessionKey,
}: {
  slug: string;
  section: string;
  caseId?: string;
  sessionKey: string;
}) {
  const query = useQuery({
    queryKey: [sessionKey, slug, 'bootstrap'],
    queryFn: ({ signal }) => api.bootstrap.query({ slug }, { signal }),
  });
  const [menu, setMenu] = useState(false),
    [search, setSearch] = useState(''),
    [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>(),
    [reset, setReset] = useState(false);
  const router = useRouter();
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <main id="main-content" className="standalone">
        <ErrorBox error={query.error} retry={() => query.refetch()} />
      </main>
    );
  const data = query.data,
    base = `/app/${slug}`,
    sectionLabel = nav.find((n) => n.id === section)?.label ?? 'Workspace';
  async function account(action: string, persona?: string) {
    setPending(true);
    setError(undefined);
    try {
      await demoAction(action, persona);
      window.location.assign(action === 'logout' ? '/demo' : base + '/overview');
    } catch (e) {
      setError(e);
      setPending(false);
    }
  }
  function navigation() {
    return (
      <>
        <div className="sidebar-clinic">
          <span className="clinic-icon">
            <Building2 size={20} />
          </span>
          <div>
            <strong>{data.clinic.name}</strong>
            <small>Clinic workspace</small>
          </div>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Workspace navigation">
          {nav.map((item) => (
            <Link
              href={`${base}/${item.id}`}
              key={item.id}
              className={`nav-item ${item.id === section ? 'nav-active' : ''}`}
              aria-label={item.label}
              aria-current={item.id === section ? 'page' : undefined}
              onClick={() => setMenu(false)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === 'cases' && <span className="nav-count">{data.caseCount}</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-sidebar">
            <span className="demo-tag">DEMO WORKSPACE</span>
            <strong>A safe space to explore.</strong>
            <p>
              All records are synthetic.
              <br />
              Your changes stay in this demo.
            </p>
            <Link href="/about">
              About this project <ArrowUpRight size={14} />
            </Link>
          </div>
          <Link href="/about" className="nav-item">
            <HelpCircle size={18} />
            Help & information
          </Link>
          <div className="sidebar-user">
            <Avatar name={data.user.name} />
            <span>
              <strong>{data.user.name}</strong>
              <small>
                {data.member.role === 'admin'
                  ? 'Clinic administrator'
                  : data.member.role === 'viewer'
                    ? 'Read-only viewer'
                    : 'Care coordinator'}
              </small>
            </span>
            <ShieldCheck size={16} />
          </div>
        </div>
      </>
    );
  }
  return (
    <WorkspaceContext.Provider value={{ data, slug, key: sessionKey }}>
      <div
        className="app-shell"
        data-theme={data.user.appearance}
        data-accent={data.clinic.accent}
        data-density={data.user.density}
      >
        <aside className="sidebar">
          <div className="sidebar-brand">
            <Logo />
          </div>
          {navigation()}
        </aside>
        <div className="app-main">
          <header className="app-header">
            <div className="header-left">
              <button
                className="icon-btn mobile-menu"
                aria-label="Open navigation"
                onClick={() => setMenu(true)}
              >
                <Menu size={21} />
              </button>
              <span className="breadcrumb">
                Workspace <span>/</span> <strong>{sectionLabel}</strong>
              </span>
            </div>
            <div className="header-actions">
              <form
                className="header-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  router.push(`${base}/cases?q=${encodeURIComponent(search)}`);
                  setSearch('');
                }}
              >
                <Search size={16} />
                <input
                  aria-label="Search this clinic"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search this clinic…"
                />
                <kbd>↵</kbd>
              </form>
              <label className="clinic-switcher">
                <Building2 size={16} />
                <select
                  aria-label="Switch clinic"
                  value={slug}
                  onChange={(e) => router.push(`/app/${e.target.value}/overview`)}
                >
                  {data.clinics.map((c) => (
                    <option value={c.slug} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} />
              </label>
              <Dropdown.Root>
                <Dropdown.Trigger
                  className="account-trigger"
                  aria-label="Account and demo persona menu"
                >
                  <Avatar name={data.user.name} />
                  <ChevronDown size={13} />
                </Dropdown.Trigger>
                <Dropdown.Portal>
                  <Dropdown.Content className="dropdown-content" align="end" sideOffset={10}>
                    <Dropdown.Label className="dropdown-label">
                      DEMO PERSONA · {data.member.role}
                    </Dropdown.Label>
                    {['admin', 'coordinator', 'viewer'].map((p) => (
                      <Dropdown.Item
                        className="dropdown-item"
                        key={p}
                        disabled={pending}
                        onSelect={() => account('switch', p)}
                      >
                        Explore as {p}
                      </Dropdown.Item>
                    ))}
                    <Dropdown.Separator className="dropdown-separator" />
                    <Dropdown.Item className="dropdown-item" onSelect={() => setReset(true)}>
                      <RotateCcw size={15} />
                      Reset my workspace
                    </Dropdown.Item>
                    <Dropdown.Item className="dropdown-item" onSelect={() => account('logout')}>
                      <LogOut size={15} />
                      Leave demo
                    </Dropdown.Item>
                  </Dropdown.Content>
                </Dropdown.Portal>
              </Dropdown.Root>
            </div>
          </header>
          <div className="demo-ribbon">
            <span>
              <span className="live-dot" /> Demo mode{' '}
              <span className="ribbon-detail">
                · Fictional clinics. Synthetic data. Your own workspace.
              </span>
            </span>
            <span className="role-label">
              {data.member.role === 'viewer'
                ? 'Read-only access'
                : data.member.role === 'admin'
                  ? 'Administrator access'
                  : 'Coordinator access'}
            </span>
          </div>
          <main id="main-content" className="app-content">
            {error != null && <ErrorBox error={error} />}
            <div className="page-content" key={`${section}:${caseId ?? ''}`}>
              {section === 'overview' ? (
                <Overview />
              ) : section === 'cases' ? (
                caseId ? (
                  <CaseDetail id={caseId} />
                ) : (
                  <Cases />
                )
              ) : section === 'appointments' ? (
                <Appointments />
              ) : section === 'team' ? (
                <Team />
              ) : section === 'activity' ? (
                <ActivityPage />
              ) : (
                <SettingsPage />
              )}
            </div>
            <div className="workspace-footnote">
              <span>
                HealthCareKim <span>·</span> A little clarity goes a long way.
              </span>
              <span>Synthetic data only</span>
            </div>
          </main>
        </div>
        <Modal
          open={menu}
          onOpenChange={setMenu}
          title="Your workspace"
          description="Navigate your clinic."
          sheet
        >
          <div className="drawer-navigation">{navigation()}</div>
        </Modal>
        <Modal
          open={reset}
          onOpenChange={setReset}
          title="Reset your demo workspace?"
          description="This removes your changes across all three clinics and creates fresh synthetic records for your current demo only."
        >
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setReset(false)}>
              Keep exploring
            </Button>
            <Button
              variant="danger"
              pending={pending}
              onClick={() => account('reset', data.user.persona)}
            >
              Reset my workspace
            </Button>
          </div>
        </Modal>
      </div>
    </WorkspaceContext.Provider>
  );
}
