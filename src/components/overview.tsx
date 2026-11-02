'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client';
import { useWorkspace } from './workspace';
import { SectionHeading, ErrorBox, Loading, TextLink, Avatar, Badge } from './ui';
import {
  ClipboardList,
  UserRoundPlus,
  CircleCheck,
  Clock3,
  ArrowUpRight,
  CalendarDays,
  ArrowRight,
  Activity,
} from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import Link from 'next/link';
import dynamic from 'next/dynamic';
const TrendChart = dynamic(() => import('./trend-chart'), {
  ssr: false,
  loading: () => <div className="trend-chart chart-placeholder">Loading workload trend…</div>,
});
export function Overview() {
  const { data: boot, slug, key } = useWorkspace();
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [now] = useState(() => Date.now());
  const q = useQuery({
    queryKey: [key, slug, 'overview', days],
    queryFn: ({ signal }) => api.overview.query({ slug, days }, { signal }),
  });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  const data = q.data,
    base = `/app/${slug}`,
    tz = boot.clinic.timezone;
  const cards = [
    {
      label: 'Open cases',
      value: data.open,
      caption: 'Across your clinic',
      icon: ClipboardList,
      href: '?status=Open',
      description: 'All cases that are not Completed.',
    },
    {
      label: 'Unassigned cases',
      value: data.unassigned,
      caption: 'Ready for an owner',
      icon: UserRoundPlus,
      href: '?assignee=unassigned&status=Open',
      description: 'Open cases without an assigned team member.',
    },
    {
      label: 'Cases completed',
      value: data.completed,
      caption: `Over the last ${days} days`,
      icon: CircleCheck,
      href: `?status=Completed&completedDays=${days}`,
      description: `Cases completed in the selected rolling ${days}-day period.`,
    },
    {
      label: 'Avg. completion time',
      value: `${data.averageHours.toFixed(1)}h`,
      caption: 'From intake to complete',
      icon: Clock3,
      href: `?status=Completed&completedDays=${days}`,
      description:
        'Mean elapsed time from creation to completion for cases completed in this period.',
    },
  ];
  return (
    <>
      <SectionHeading
        eyebrow="YOUR CLINIC, AT A GLANCE"
        title={`Welcome back, ${boot.user.name.split(' ')[0]}.`}
        description="A clear view of your team’s day. Let’s keep things moving."
        action={
          <label className="period-picker">
            <CalendarDays size={16} />
            <select
              aria-label="Overview date range"
              value={days}
              onChange={(e) => setDays(Number(e.target.value) as 7 | 14 | 30)}
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </label>
        }
      />
      <div className="clinic-context">
        <span className="live-dot" />
        <strong>{boot.clinic.name}</strong>
        <span>All systems in view</span>
        <span className="context-date">{formatInTimeZone(now, tz, 'EEEE, MMMM d, yyyy')}</span>
      </div>
      <div className="kpi-grid">
        {cards.map((x, i) => (
          <Link
            className="kpi-card"
            href={base + '/cases' + x.href}
            key={x.label}
            title={x.description}
          >
            <div className="kpi-top">
              <span>{x.label}</span>
              <x.icon size={18} />
            </div>
            <div className="kpi-value">
              {x.value}
              <ArrowUpRight size={18} />
            </div>
            <p>
              <span className={`kpi-indicator kpi-indicator-${i}`} />
              {x.caption}
            </p>
          </Link>
        ))}
      </div>
      <div className="overview-charts">
        <section className="panel trend-panel">
          <div className="panel-heading">
            <div>
              <h2>Workload over time</h2>
              <p>New cases and completed work, day by day.</p>
            </div>
            <div className="chart-legend">
              <span>
                <i />
                Opened
              </span>
              <span>
                <i />
                Completed
              </span>
            </div>
          </div>
          <TrendChart data={data.trend} />
          <details className="chart-data">
            <summary>View chart data and metric definitions</summary>
            <p>
              Open cases: all statuses except Completed. Unassigned: open cases without an owner.
              Completed and average completion time use the last {days} rolling days. Average is
              elapsed hours from creation to completion. All dates below use {tz}.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Opened</th>
                  <th>Completed</th>
                </tr>
              </thead>
              <tbody>
                {data.trend.map((t) => (
                  <tr key={t.date}>
                    <th>{t.date}</th>
                    <td>{t.opened}</td>
                    <td>{t.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
        <section className="panel breakdown-panel">
          <div className="panel-heading">
            <div>
              <h2>Case breakdown</h2>
              <p>Every case, a clear next step.</p>
            </div>
            <ClipboardList size={18} />
          </div>
          <div className="status-total">
            <strong>{data.total}</strong>
            <span>total cases</span>
          </div>
          <div className="status-bar" aria-hidden="true">
            {data.breakdown.map((x) => (
              <span
                key={x.status}
                className={`status-segment status-${x.status.replaceAll(' ', '-').toLowerCase()}`}
                style={{ width: `${(x.count / data.total) * 100}%` }}
              />
            ))}
          </div>
          <div className="breakdown-list">
            {data.breakdown.map((x) => (
              <Link href={`${base}/cases?status=${encodeURIComponent(x.status)}`} key={x.status}>
                <Badge value={x.status} />
                <strong>
                  {x.count}
                  <small>{Math.round((x.count / data.total) * 100)}%</small>
                </strong>
              </Link>
            ))}
          </div>
          <div className="panel-bottom">
            <TextLink href={`${base}/cases`}>Explore all cases</TextLink>
          </div>
        </section>
      </div>
      <div className="overview-bottom">
        <section className="panel">
          <div className="panel-heading">
            <div className="heading-with-icon">
              <CalendarDays size={19} />
              <div>
                <h2>Coming up next</h2>
                <p>Appointments in {tz.replaceAll('_', ' ')}.</p>
              </div>
            </div>
            <TextLink href={`${base}/appointments`}>View schedule</TextLink>
          </div>
          <div className="upcoming-list">
            {data.appointments.length ? (
              data.appointments.map((a) => (
                <Link href={`${base}/appointments`} className="upcoming-row" key={a.id}>
                  <div className="appointment-time">
                    <strong>{formatInTimeZone(a.starts_at, tz, 'h:mm')}</strong>
                    <small>{formatInTimeZone(a.starts_at, tz, 'MMM d · a')}</small>
                  </div>
                  <div className="appointment-summary">
                    <strong>{a.patient}</strong>
                    <span>{a.title}</span>
                  </div>
                  <Avatar name={a.staff} size="small" />
                  <ArrowRight size={16} />
                </Link>
              ))
            ) : (
              <p className="panel-empty">No upcoming appointments. A little breathing room.</p>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div className="heading-with-icon">
              <Activity size={19} />
              <div>
                <h2>The latest at your clinic</h2>
                <p>A shared record of progress.</p>
              </div>
            </div>
            <TextLink href={`${base}/activity`}>All activity</TextLink>
          </div>
          <ol className="activity-mini">
            {data.events.map((e, i) => (
              <li key={e.id}>
                <span className={`activity-dot dot-${i % 3}`} />
                <div>
                  <p>{e.description}</p>
                  <small>
                    {e.actor} <span>·</span> {formatInTimeZone(e.created_at, tz, 'MMM d, h:mm a')}
                  </small>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <div className="overview-tip">
        <span className="tip-symbol">✧</span>
        <p>
          <strong>A clear next step makes all the difference.</strong> Start with unassigned cases
          to help every request find its owner.
        </p>
        <Link href={`${base}/cases?assignee=unassigned`}>
          Find unassigned cases <ArrowRight size={16} />
        </Link>
      </div>
    </>
  );
}
