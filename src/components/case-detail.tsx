'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, useAction } from '@/lib/client';
import { useWorkspace } from './workspace';
import { SectionHeading, Button, Badge, Avatar, ErrorBox, Loading, TextLink } from './ui';
import type { CaseEdit } from '@/lib/service';
import { priorities } from '@/lib/types';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  ClipboardList,
  ShieldCheck,
  MessageSquare,
  History,
  Save,
  RefreshCw,
  LockKeyhole,
} from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
export function CaseDetail({ id, embedded = false }: { id: string; embedded?: boolean }) {
  const { slug, key, data: boot } = useWorkspace();
  const q = useQuery({
    queryKey: [key, slug, 'detail', id],
    queryFn: ({ signal }) => api.detail.query({ slug, id }, { signal }),
    refetchOnWindowFocus: false,
  });
  const save = useAction((edit: CaseEdit) => api.editCase.mutate({ slug, edit }));
  const [draft, setDraft] = useState<{
    assignee?: string;
    status?: string;
    priority?: string;
    note: string;
    reason: string;
  }>({ note: '', reason: '' });
  const [success, setSuccess] = useState(false);
  const [tab, setTab] = useState('notes');
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  const { record: r, notes, events } = q.data,
    readOnly = boot.member.role === 'viewer',
    tz = boot.clinic.timezone;
  const transitions: Record<string, string[]> = {
    New: ['In review'],
    'In review': ['Needs information', 'Completed'],
    'Needs information': ['In review'],
    Completed: ['In review'],
  };
  const status = draft.status ?? r.status,
    assignee = draft.assignee ?? r.assignee_id ?? '',
    priority = draft.priority ?? r.priority;
  const dirty =
    status !== r.status ||
    assignee !== (r.assignee_id ?? '') ||
    priority !== r.priority ||
    !!draft.note.trim();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSuccess(false);
    try {
      await save.mutateAsync({
        id,
        version: r.version,
        status: status as CaseEdit['status'],
        assigneeId: assignee || null,
        priority: priority as CaseEdit['priority'],
        note: draft.note,
        reason: draft.reason,
      });
      await q.refetch();
      setDraft({ note: '', reason: '' });
      setSuccess(true);
    } catch {
      /* Keep every unsaved field intact, including on version conflicts. */
    }
  }
  const fmt = (time: number) => formatInTimeZone(time, tz, 'MMM d, yyyy · h:mm a');
  return (
    <div className={embedded ? 'case-detail embedded-detail' : 'case-detail'}>
      {!embedded && (
        <Link className="back-link" href={`/app/${slug}/cases`}>
          <ArrowLeft size={15} />
          Back to cases
        </Link>
      )}
      <SectionHeading
        eyebrow={`${r.number} · SYNTHETIC PATIENT`}
        title={r.patient}
        description={r.type}
        action={
          embedded ? (
            <Link className="btn btn-secondary" href={`/app/${slug}/cases/${id}`}>
              Full page <ArrowUpRight size={15} />
            </Link>
          ) : (
            <Badge value={r.status} />
          )
        }
      />
      <div className="detail-grid">
        <div>
          <section className="panel patient-summary">
            <div className="panel-heading">
              <h2>
                <ClipboardList size={17} /> Patient summary
              </h2>
              <span className="demo-tag">SYNTHETIC</span>
            </div>
            <div className="patient-identity">
              <Avatar name={r.patient} />
              <div>
                <h3>{r.patient}</h3>
                <p>
                  {r.reference} <span>·</span> DOB {r.dob}
                </p>
              </div>
            </div>
            <dl className="metadata-grid">
              <div>
                <dt>Case type</dt>
                <dd>{r.type}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{fmt(r.created_at)}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{fmt(r.updated_at)}</dd>
              </div>
              <div>
                <dt>Record version</dt>
                <dd>Version {r.version}</dd>
              </div>
            </dl>
            <div className="synthetic-notice">
              <ShieldCheck size={15} />
              Fictional identity. Operational demonstration only.
            </div>
          </section>
          <section className="panel detail-history">
            <div className="case-tabs">
              <button
                className={`case-tab ${tab === 'notes' ? 'active' : ''}`}
                onClick={() => setTab('notes')}
              >
                <MessageSquare size={16} />
                Internal notes <span>{notes.length}</span>
              </button>
              <button
                className={`case-tab ${tab === 'activity' ? 'active' : ''}`}
                onClick={() => setTab('activity')}
              >
                <History size={16} />
                Activity history <span>{events.length}</span>
              </button>
            </div>
            {tab === 'notes' ? (
              <div className="notes-list">
                {notes.length ? (
                  notes.map((n) => (
                    <article key={n.id}>
                      <div>
                        <Avatar name={n.actor} size="small" />
                        <strong>{n.actor}</strong>
                        <time>{fmt(n.created_at)}</time>
                      </div>
                      <p>{n.body}</p>
                    </article>
                  ))
                ) : (
                  <div className="panel-empty">
                    A clean slate. Add a note to share useful operational context.
                  </div>
                )}
              </div>
            ) : (
              <ol className="detail-events">
                {events.map((e) => (
                  <li key={e.id}>
                    <span className="event-marker" />
                    <div>
                      <p>{e.description}</p>
                      <small>
                        {e.actor} · {fmt(e.created_at)}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        <section className="panel case-edit-panel">
          <div className="panel-heading">
            <h2>Keep things moving</h2>
            {readOnly && <LockKeyhole size={17} />}
          </div>
          {readOnly && (
            <div className="readonly-banner">
              You have read-only access. Switch to an administrator or coordinator demo persona to
              make changes.
            </div>
          )}
          <form className="stacked-form" onSubmit={submit}>
            <label>
              Status
              <select
                aria-label="Case status"
                disabled={readOnly || save.isPending}
                value={status}
                onChange={(e) => {
                  setSuccess(false);
                  setDraft({ ...draft, status: e.target.value });
                }}
              >
                <option value={r.status}>{r.status}</option>
                {transitions[r.status].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <small>Next steps follow the clinic’s operational workflow.</small>
            </label>
            {r.status === 'Completed' && status === 'In review' && (
              <label>
                Reopen reason
                <textarea
                  required
                  minLength={5}
                  maxLength={500}
                  value={draft.reason}
                  onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                />
              </label>
            )}
            <label>
              Assigned to
              <select
                aria-label="Case assignee"
                disabled={readOnly || save.isPending}
                value={assignee}
                onChange={(e) => {
                  setSuccess(false);
                  setDraft({ ...draft, assignee: e.target.value });
                }}
              >
                <option value="">Unassigned</option>
                {boot.members
                  .filter((m) => m.active && m.role !== 'viewer')
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Priority
              <select
                disabled={readOnly || save.isPending}
                value={priority}
                onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
              >
                {priorities.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Internal note
              <textarea
                disabled={readOnly || save.isPending}
                value={draft.note}
                onChange={(e) => {
                  setSuccess(false);
                  setDraft({ ...draft, note: e.target.value });
                }}
                maxLength={4000}
                rows={5}
                placeholder="Share the next step or useful context…"
              />
              <small>Operational notes only. Do not enter real patient information.</small>
            </label>
            {save.error && (
              <>
                <ErrorBox error={save.error} />
                <Button type="button" variant="secondary" onClick={() => q.refetch()}>
                  <RefreshCw size={15} />
                  Refresh record & keep draft
                </Button>
              </>
            )}
            {success && (
              <div className="success-box" role="status">
                <ShieldCheck size={17} />
                Changes saved. Activity history updated.
              </div>
            )}
            <Button type="submit" pending={save.isPending} disabled={readOnly || !dirty}>
              <Save size={16} />
              Save changes
            </Button>
            <p className="save-hint">
              Changes are saved only when you select Save. All timestamps use {tz}.
            </p>
          </form>
        </section>
      </div>
      {!embedded && (
        <div className="detail-footer">
          <TextLink href={`/app/${slug}/activity`}>See the complete clinic activity log</TextLink>
        </div>
      )}
    </div>
  );
}
