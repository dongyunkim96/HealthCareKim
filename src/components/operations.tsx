'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatInTimeZone } from 'date-fns-tz';
import { api, useAction } from '@/lib/client';
import { useWorkspace } from './workspace';
import { Button, SectionHeading, ErrorBox, Loading, Avatar, Empty } from './ui';
import {
  ShieldCheck,
  LockKeyhole,
  Search,
  ChevronLeft,
  ChevronRight,
  Check,
  Building2,
  Palette,
  Globe2,
  Users,
} from 'lucide-react';
import type { Member } from '@/lib/types';
import Link from 'next/link';
function MemberRow({ member }: { member: Member }) {
  const { slug, data: boot } = useWorkspace(),
    [role, setRole] = useState(member.role),
    [active, setActive] = useState(!!member.active);
  const save = useAction(() => api.updateMember.mutate({ slug, id: member.id, role, active }));
  const admin = boot.member.role === 'admin';
  return (
    <article className="team-row">
      <div className="team-identity">
        <Avatar name={member.name} />
        <div>
          <h3>
            {member.name}
            {member.user_id === boot.user.id && <span>You</span>}
          </h3>
          <p>
            {member.role === 'admin'
              ? 'Clinic administrator'
              : member.role === 'viewer'
                ? 'Read-only workspace access'
                : 'Care coordination'}
          </p>
        </div>
      </div>
      <div className="team-workload">
        <strong>{member.workload ?? 0}</strong>
        <span>open cases</span>
        <div className="workload-meter">
          <i
            style={{
              width: `${Math.min(100, ((member.workload ?? 0) / 100) * 100)}%`,
            }}
          />
        </div>
      </div>
      <div className="team-role">
        <label>
          Role
          <select
            aria-label={`Role for ${member.name}`}
            value={role}
            onChange={(e) => setRole(e.target.value as Member['role'])}
            disabled={!admin || save.isPending}
          >
            <option value="admin">Administrator</option>
            <option value="coordinator">Coordinator</option>
            <option value="viewer">Viewer</option>
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            aria-label={`${member.name} active membership`}
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            disabled={!admin || save.isPending}
          />
          Active
        </label>
      </div>
      {admin && (
        <Button
          variant="secondary"
          disabled={role === member.role && active === !!member.active}
          pending={save.isPending}
          onClick={() => save.mutate()}
        >
          Save
        </Button>
      )}
      {save.error && (
        <div className="full-width">
          <ErrorBox error={save.error} />
        </div>
      )}
      {save.isSuccess && (
        <span className="saved-indicator" role="status">
          <Check size={14} />
          Saved
        </span>
      )}
    </article>
  );
}
export function Team() {
  const { data } = useWorkspace();
  return (
    <>
      <SectionHeading
        eyebrow="GOOD WORK HAPPENS TOGETHER"
        title="Your clinic team"
        description="Clear ownership. A balanced workload. One shared view."
      />
      <div className="team-summary">
        <span>
          <Users size={19} />
          <strong>{data.members.filter((m) => m.active).length}</strong>active members
        </span>
        <span>
          <ShieldCheck size={19} />
          <strong>{data.members.filter((m) => m.active && m.role === 'admin').length}</strong>
          administrator
        </span>
        <span>
          <LockKeyhole size={17} />
          Permissions are checked on every action
        </span>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>People & permissions</h2>
            <p>Roles and membership are scoped to {data.clinic.name}.</p>
          </div>
          <span className="demo-tag">FICTIONAL TEAM</span>
        </div>
        {data.members.map((member) => (
          <MemberRow key={`${member.id}:${member.role}:${member.active}`} member={member} />
        ))}
      </section>
      <p className="page-note">
        Administrators manage clinic settings and permissions. Coordinators manage cases and
        appointments. Viewers have read-only access. At least one active administrator is required.
      </p>
    </>
  );
}
export function ActivityPage() {
  const { slug, key, data: boot } = useWorkspace(),
    params = useSearchParams(),
    router = useRouter();
  const page = Math.max(1, parseInt(params.get('page') ?? '1') || 1),
    search = params.get('q') ?? '';
  const q = useQuery({
    queryKey: [key, slug, 'activity', page, search],
    queryFn: ({ signal }) => api.activity.query({ slug, q: search, page }, { signal }),
  });
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / 20));
  return (
    <>
      <SectionHeading
        eyebrow="EVERY CHANGE, IN CONTEXT"
        title="Activity log"
        description="An uneditable record of your clinic’s operational history."
      />
      <section className="panel activity-panel">
        <form
          className="activity-search table-search"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            router.push(`/app/${slug}/activity?q=${encodeURIComponent(String(f.get('q') ?? ''))}`);
          }}
        >
          <Search size={17} />
          <input
            name="q"
            key={search}
            defaultValue={search}
            aria-label="Search activity"
            placeholder="Search actor, action, or detail…"
          />
          <Button variant="secondary" type="submit">
            Search
          </Button>
        </form>
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorBox error={q.error} retry={() => q.refetch()} />
        ) : q.data.rows.length ? (
          <ol className="audit-list">
            {q.data.rows.map((event) => (
              <li key={event.id}>
                <span
                  className={`audit-icon ${event.action.includes('status') ? 'audit-green' : ''}`}
                >
                  <ShieldCheck size={17} />
                </span>
                <div>
                  <p>{event.description}</p>
                  <span>
                    <strong>{event.actor}</strong>
                    <span className="audit-action">{event.action}</span>
                  </span>
                </div>
                <time>
                  {formatInTimeZone(event.created_at, boot.clinic.timezone, 'MMM d, yyyy')}
                  <small>
                    {formatInTimeZone(event.created_at, boot.clinic.timezone, 'h:mm a zzz')}
                  </small>
                </time>
                {event.action.startsWith('case.') && (
                  <Link
                    className="icon-btn"
                    aria-label="Open related case"
                    href={`/app/${slug}/cases/${event.entity_id}`}
                  >
                    ↗
                  </Link>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <Empty title="No matching activity" />
        )}
        <div className="pagination">
          <p>
            {q.data?.total ?? 0} events · {boot.clinic.timezone}
          </p>
          <div>
            <button
              className="icon-btn"
              disabled={page <= 1}
              aria-label="Previous activity page"
              onClick={() =>
                router.push(
                  `/app/${slug}/activity?q=${encodeURIComponent(search)}&page=${page - 1}`,
                )
              }
            >
              <ChevronLeft size={17} />
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button
              className="icon-btn"
              disabled={page >= pages}
              aria-label="Next activity page"
              onClick={() =>
                router.push(
                  `/app/${slug}/activity?q=${encodeURIComponent(search)}&page=${page + 1}`,
                )
              }
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
export function SettingsPage() {
  const { slug, data: boot } = useWorkspace();
  const [clinic, setClinic] = useState({
    name: boot.clinic.name,
    accent: boot.clinic.accent as 'teal' | 'blue' | 'violet',
    timezone: boot.clinic.timezone,
    startHour: boot.clinic.start_hour,
    endHour: boot.clinic.end_hour,
  });
  const [pref, setPref] = useState({
    appearance: boot.user.appearance as 'light' | 'dark',
    density: boot.user.density as 'comfortable' | 'compact',
  });
  const save = useAction(() => api.settings.mutate({ slug, settings: clinic }));
  const preferences = useAction(() => api.preferences.mutate({ slug, ...pref }));
  const isAdmin = boot.member.role === 'admin';
  return (
    <>
      <SectionHeading
        eyebrow="A WORKSPACE THAT WORKS FOR YOU"
        title="Settings"
        description="The right defaults make the whole day a little smoother."
      />
      <div className="settings-layout">
        <section className="panel">
          <div className="panel-heading">
            <div className="heading-with-icon">
              <Building2 size={19} />
              <div>
                <h2>Clinic workspace</h2>
                <p>Shared settings for everyone in this clinic.</p>
              </div>
            </div>
            {!isAdmin && <LockKeyhole size={18} />}
          </div>
          {!isAdmin ? (
            <div className="permission-state">
              <LockKeyhole size={26} />
              <h3>Administrator access required</h3>
              <p>
                Your role can’t change clinic settings. You can update your personal preferences
                below.
              </p>
              <dl>
                <dt>Clinic</dt>
                <dd>{boot.clinic.name}</dd>
                <dt>Timezone</dt>
                <dd>{boot.clinic.timezone}</dd>
              </dl>
            </div>
          ) : (
            <form
              className="stacked-form settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <label>
                Clinic name
                <input
                  value={clinic.name}
                  minLength={3}
                  maxLength={80}
                  required
                  onChange={(e) => setClinic({ ...clinic, name: e.target.value })}
                />
              </label>
              <label>
                <span>
                  <Globe2 size={15} /> Business timezone
                </span>
                <select
                  value={clinic.timezone}
                  onChange={(e) => setClinic({ ...clinic, timezone: e.target.value })}
                >
                  {[
                    'America/New_York',
                    'America/Chicago',
                    'America/Denver',
                    'America/Los_Angeles',
                    'Europe/London',
                    'Asia/Seoul',
                    'UTC',
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <small>
                  Schedules and date groups use this timezone. Existing appointments keep their
                  absolute times.
                </small>
              </label>
              <div className="form-grid">
                <label>
                  Opens at
                  <select
                    value={clinic.startHour}
                    onChange={(e) =>
                      setClinic({
                        ...clinic,
                        startHour: Number(e.target.value),
                      })
                    }
                  >
                    {Array.from({ length: 23 }, (_, i) => (
                      <option value={i} key={i}>
                        {String(i).padStart(2, '0')}:00
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Closes at
                  <select
                    value={clinic.endHour}
                    onChange={(e) => setClinic({ ...clinic, endHour: Number(e.target.value) })}
                  >
                    {Array.from({ length: 23 }, (_, i) => (
                      <option value={i + 1} key={i}>
                        {String(i + 1).padStart(2, '0')}:00
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="muted">
                Business days: Monday–Friday. Appointment duration: 15–120 minutes.
              </p>
              <fieldset className="accent-fieldset">
                <legend>
                  <Palette size={16} /> Clinic accent
                </legend>
                <div>
                  {['teal', 'blue', 'violet'].map((a) => (
                    <button
                      type="button"
                      className={`accent-choice accent-${a} ${clinic.accent === a ? 'chosen' : ''}`}
                      aria-label={`${a} accent`}
                      aria-pressed={clinic.accent === a}
                      key={a}
                      onClick={() =>
                        setClinic({
                          ...clinic,
                          accent: a as typeof clinic.accent,
                        })
                      }
                    >
                      {clinic.accent === a && <Check size={18} />}
                    </button>
                  ))}
                </div>
              </fieldset>
              {save.error && <ErrorBox error={save.error} />}{' '}
              {save.isSuccess && (
                <div className="success-box" role="status">
                  Clinic settings saved. Activity recorded.
                </div>
              )}
              <div className="form-actions">
                <Button type="submit" pending={save.isPending}>
                  Save clinic settings
                </Button>
              </div>
            </form>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div className="heading-with-icon">
              <Palette size={19} />
              <div>
                <h2>Personal preferences</h2>
                <p>Your preferences across your demo clinics.</p>
              </div>
            </div>
          </div>
          <form
            className="stacked-form settings-form"
            onSubmit={(e) => {
              e.preventDefault();
              preferences.mutate();
            }}
          >
            <label>
              Appearance
              <select
                aria-label="Appearance"
                value={pref.appearance}
                onChange={(e) =>
                  setPref({
                    ...pref,
                    appearance: e.target.value as typeof pref.appearance,
                  })
                }
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label>
              Table density
              <select
                aria-label="Table density"
                value={pref.density}
                onChange={(e) =>
                  setPref({
                    ...pref,
                    density: e.target.value as typeof pref.density,
                  })
                }
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
              <small>Changes the vertical spacing of desktop case rows.</small>
            </label>
            {preferences.error && <ErrorBox error={preferences.error} />}{' '}
            {preferences.isSuccess && (
              <div className="success-box" role="status">
                Preferences saved.
              </div>
            )}
            <div className="form-actions">
              <Button type="submit" pending={preferences.isPending}>
                Save preferences
              </Button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
