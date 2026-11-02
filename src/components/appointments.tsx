'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { api, useAction } from '@/lib/client';
import { useWorkspace } from './workspace';
import { Button, SectionHeading, Modal, ErrorBox, Loading, Avatar, Badge, Empty } from './ui';
import { CalendarDays, List, Plus, Clock, ChevronLeft, ChevronRight, Globe2 } from 'lucide-react';
import type { Appointment } from '@/lib/types';
const formSchema = z.object({
  patientId: z.string().min(1, 'Choose a synthetic patient.'),
  staffId: z.string().min(1, 'Choose a staff member.'),
  title: z.string().trim().min(3, 'Enter at least 3 characters.').max(100),
  localStart: z.string().min(16, 'Choose a date and time.'),
  duration: z.number().min(15).max(120),
});
type FormValues = z.infer<typeof formSchema>;
export function Appointments() {
  const { data: boot, slug, key } = useWorkspace();
  const [now] = useState(() => Date.now());
  const [view, setView] = useState('agenda'),
    [staff, setStaff] = useState(''),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Appointment | null>(null),
    [cancel, setCancel] = useState<Appointment | null>(null),
    [week, setWeek] = useState(0),
    [showCancelled, setShowCancelled] = useState(false),
    [notice, setNotice] = useState('');
  const q = useQuery({
    queryKey: [key, slug, 'appointments'],
    queryFn: ({ signal }) => api.appointments.query({ slug }, { signal }),
  });
  const patients = useQuery({
    queryKey: [key, slug, 'patients'],
    queryFn: ({ signal }) => api.patients.query({ slug }, { signal }),
    enabled: open,
  });
  const save = useAction(
    (appointment: Parameters<typeof api.saveAppointment.mutate>[0]['appointment']) =>
      api.saveAppointment.mutate({ slug, appointment }),
  );
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      patientId: '',
      staffId: '',
      title: 'Intake consultation',
      localStart: '',
      duration: 30,
    },
  });
  const tz = boot.clinic.timezone,
    readOnly = boot.member.role === 'viewer';
  function launch(item: Appointment | null) {
    setEditing(item);
    save.reset();
    form.reset(
      item
        ? {
            patientId: item.patient_id,
            staffId: item.staff_id,
            title: item.title,
            localStart: formatInTimeZone(item.starts_at, tz, "yyyy-MM-dd'T'HH:mm"),
            duration: (item.ends_at - item.starts_at) / 60000,
          }
        : {
            patientId: '',
            staffId: boot.members.find((m) => m.active && m.role !== 'viewer')?.id ?? '',
            title: 'Intake consultation',
            localStart: '',
            duration: 30,
          },
    );
    setOpen(true);
  }
  const today = formatInTimeZone(now, tz, 'yyyy-MM-dd'),
    monday = new Date(`${today}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) + week * 7);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const rows = (q.data ?? []).filter(
    (a) => (showCancelled || !a.cancelled) && (!staff || a.staff_id === staff),
  );
  const filtered =
    view === 'week'
      ? rows.filter((a) => weekDays.includes(formatInTimeZone(a.starts_at, tz, 'yyyy-MM-dd')))
      : rows;
  const groups = Array.from(
    new Set(filtered.map((a) => formatInTimeZone(a.starts_at, tz, 'yyyy-MM-dd'))),
  );
  function appointmentRow(a: Appointment) {
    return (
      <article className={`agenda-row ${a.cancelled ? 'cancelled-row' : ''}`} key={a.id}>
        <div className="agenda-time">
          <strong>{formatInTimeZone(a.starts_at, tz, 'h:mm a')}</strong>
          <span>{(a.ends_at - a.starts_at) / 60000} min</span>
        </div>
        <div className="agenda-patient">
          <Avatar name={a.patient} />
          <div>
            <strong>{a.patient}</strong>
            <p>{a.title}</p>
          </div>
        </div>
        <div className="agenda-staff">
          <Avatar name={a.staff} size="small" />
          <span>{a.staff}</span>
        </div>
        {a.cancelled ? (
          <Badge value="Cancelled" />
        ) : (
          <span className="scheduled-label">
            <span className="live-dot" />
            Scheduled
          </span>
        )}
        {!readOnly && !a.cancelled && (
          <div className="agenda-actions">
            <Button variant="ghost" onClick={() => launch(a)}>
              Reschedule
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                save.reset();
                setCancel(a);
              }}
            >
              Cancel
            </Button>
          </div>
        )}
      </article>
    );
  }
  const [local, duration, chosenStaff] = useWatch({
    control: form.control,
    name: ['localStart', 'duration', 'staffId'],
  });
  const alternatives: string[] = [];
  if (save.error && local) {
    const start = fromZonedTime(local, tz).getTime();
    for (let i = 1; i <= 48 && alternatives.length < 3; i++) {
      const t = start + i * 30 * 60000,
        date = formatInTimeZone(t, tz, "yyyy-MM-dd'T'HH:mm"),
        hour = Number(formatInTimeZone(t, tz, 'H')),
        weekday = Number(formatInTimeZone(t, tz, 'i'));
      if (
        weekday > 5 ||
        hour < boot.clinic.start_hour ||
        hour + duration / 60 > boot.clinic.end_hour
      )
        continue;
      if (
        !(q.data ?? []).some(
          (a) =>
            a.id !== editing?.id &&
            !a.cancelled &&
            a.staff_id === chosenStaff &&
            a.starts_at < t + duration * 60000 &&
            a.ends_at > t,
        )
      )
        alternatives.push(date);
    }
  }
  return (
    <>
      <SectionHeading
        eyebrow="MAKE ROOM FOR A WELL-COORDINATED DAY"
        title="Appointments"
        description="A shared schedule, with the right people in the right places."
        action={
          !readOnly && (
            <Button onClick={() => launch(null)}>
              <Plus size={17} />
              New appointment
            </Button>
          )
        }
      />
      <div className="schedule-toolbar">
        <div className="segmented">
          <button className={view === 'agenda' ? 'active' : ''} onClick={() => setView('agenda')}>
            <List size={16} />
            Agenda
          </button>
          <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>
            <CalendarDays size={16} />
            Week
          </button>
        </div>
        <label className="staff-filter">
          Staff member
          <select
            aria-label="Filter appointments by staff"
            value={staff}
            onChange={(e) => setStaff(e.target.value)}
          >
            <option value="">All staff</option>
            {boot.members
              .filter((m) => m.role !== 'viewer')
              .map((m) => (
                <option value={m.id} key={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(e) => setShowCancelled(e.target.checked)}
          />
          Show cancelled
        </label>
      </div>
      <div className="timezone-banner">
        <Globe2 size={16} />
        <strong>{tz}</strong>
        <span>
          Mon–Fri · {boot.clinic.start_hour}:00–{boot.clinic.end_hour}:00 · All times shown in
          clinic time
        </span>
      </div>
      {notice && (
        <div className="success-box" role="status">
          {notice}
        </div>
      )}
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} retry={() => q.refetch()} />
      ) : view === 'week' ? (
        <section className="panel week-panel">
          <div className="panel-heading">
            <h2>
              {weekDays[0]} – {weekDays[6]}
            </h2>
            <div className="week-navigation">
              <Button
                variant="secondary"
                aria-label="Previous week"
                onClick={() => setWeek((v) => v - 1)}
              >
                <ChevronLeft size={16} />
              </Button>
              <Button variant="secondary" onClick={() => setWeek(0)}>
                This week
              </Button>
              <Button
                variant="secondary"
                aria-label="Next week"
                onClick={() => setWeek((v) => v + 1)}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
          <div className="week-grid">
            {weekDays.map((day) => (
              <section key={day} className={day === today ? 'today' : ''}>
                <h3>
                  {new Intl.DateTimeFormat('en', {
                    weekday: 'short',
                    day: 'numeric',
                    timeZone: 'UTC',
                  }).format(new Date(`${day}T12:00:00Z`))}
                </h3>
                {filtered
                  .filter((a) => formatInTimeZone(a.starts_at, tz, 'yyyy-MM-dd') === day)
                  .map((a) => (
                    <button
                      className={`week-appointment ${a.cancelled ? 'cancelled-row' : ''}`}
                      key={a.id}
                      onClick={() => {
                        if (!readOnly && !a.cancelled) launch(a);
                        else
                          setNotice(
                            `${a.patient}: ${a.title}, ${formatInTimeZone(a.starts_at, tz, 'h:mm a')}–${formatInTimeZone(a.ends_at, tz, 'h:mm a')}, ${a.staff}${a.cancelled ? ' (cancelled)' : ''}.`,
                          );
                      }}
                    >
                      <span>
                        <Clock size={12} />
                        {formatInTimeZone(a.starts_at, tz, 'h:mm a')}
                      </span>
                      <strong>{a.patient}</strong>
                      <small>{a.title}</small>
                      <small>{a.staff}</small>
                    </button>
                  ))}
              </section>
            ))}
          </div>
          <div className="mobile-week-agenda">
            {groups.map((day) => (
              <section key={day}>
                <h3>{day}</h3>
                {filtered
                  .filter((a) => formatInTimeZone(a.starts_at, tz, 'yyyy-MM-dd') === day)
                  .map(appointmentRow)}
              </section>
            ))}
          </div>
        </section>
      ) : groups.length ? (
        <div className="agenda-groups">
          {groups.map((day) => (
            <section className="panel" key={day}>
              <div className="agenda-date">
                <CalendarDays size={17} />
                <h2>
                  {new Intl.DateTimeFormat('en', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    timeZone: 'UTC',
                  }).format(new Date(`${day}T12:00:00Z`))}
                </h2>
                {day === today && <span className="demo-tag">TODAY</span>}
                <span>
                  {
                    filtered.filter((a) => formatInTimeZone(a.starts_at, tz, 'yyyy-MM-dd') === day)
                      .length
                  }{' '}
                  appointments
                </span>
              </div>
              {filtered
                .filter((a) => formatInTimeZone(a.starts_at, tz, 'yyyy-MM-dd') === day)
                .map(appointmentRow)}
            </section>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty title="A little breathing room">No appointments match this view.</Empty>
        </section>
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={editing ? 'Reschedule appointment' : 'New appointment'}
        description={`Appointments use ${tz}, weekdays ${boot.clinic.start_hour}:00–${boot.clinic.end_hour}:00. Availability is rechecked when saving.`}
      >
        <form
          className="stacked-form"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              await save.mutateAsync({
                ...values,
                ...(editing ? { id: editing.id, version: editing.version } : {}),
              });
              setOpen(false);
              setNotice(
                editing
                  ? 'Appointment rescheduled. Activity recorded.'
                  : 'Appointment created. Activity recorded.',
              );
            } catch {
              /* Preserve draft on conflict. */
            }
          })}
        >
          <label>
            Synthetic patient
            <select
              {...form.register('patientId')}
              aria-invalid={!!form.formState.errors.patientId}
            >
              <option value="">Choose a patient</option>
              {patients.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <small className="field-error">{form.formState.errors.patientId?.message}</small>
          </label>
          <label>
            Staff member
            <select aria-label="Staff member" {...form.register('staffId')}>
              <option value="">Choose staff</option>
              {boot.members
                .filter((m) => m.active && m.role !== 'viewer')
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
            <small className="field-error">{form.formState.errors.staffId?.message}</small>
          </label>
          <label>
            Appointment title
            <input {...form.register('title')} />
            <small className="field-error">{form.formState.errors.title?.message}</small>
          </label>
          <div className="form-grid">
            <label>
              Date and local time
              <input type="datetime-local" {...form.register('localStart')} />
              <small className="field-error">{form.formState.errors.localStart?.message}</small>
            </label>
            <label>
              Duration
              <select {...form.register('duration', { valueAsNumber: true })}>
                {[15, 30, 45, 60, 90, 120].map((d) => (
                  <option key={d} value={d}>
                    {d} minutes
                  </option>
                ))}
              </select>
            </label>
          </div>
          {save.error && <ErrorBox error={save.error} />}{' '}
          {!!alternatives.length && (
            <div className="alternative-times">
              <strong>Available alternatives to try</strong>
              <p>Based on the current schedule. Rechecked on save.</p>
              {alternatives.map((t) => (
                <Button
                  type="button"
                  variant="secondary"
                  key={t}
                  onClick={() => form.setValue('localStart', t)}
                >
                  {t.replace('T', ' · ')}
                </Button>
              ))}
            </div>
          )}
          <div className="form-actions">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button type="submit" pending={save.isPending}>
              Save appointment
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={!!cancel}
        onOpenChange={(value) => {
          if (!value) setCancel(null);
        }}
        title="Cancel this appointment?"
        description="The appointment remains in history. Its slot becomes available immediately."
      >
        {cancel && (
          <div className="stacked-form">
            <p>
              <strong>{cancel.patient}</strong> · {cancel.title}
              <br />
              {formatInTimeZone(cancel.starts_at, tz, 'MMM d, yyyy · h:mm a')}
            </p>
            {save.error && <ErrorBox error={save.error} />}
            <div className="form-actions">
              <Button variant="secondary" onClick={() => setCancel(null)}>
                Keep appointment
              </Button>
              <Button
                variant="danger"
                pending={save.isPending}
                onClick={async () => {
                  try {
                    await save.mutateAsync({
                      id: cancel.id,
                      version: cancel.version,
                      patientId: cancel.patient_id,
                      staffId: cancel.staff_id,
                      title: cancel.title,
                      localStart: formatInTimeZone(cancel.starts_at, tz, "yyyy-MM-dd'T'HH:mm"),
                      duration: (cancel.ends_at - cancel.starts_at) / 60000,
                      cancel: true,
                    });
                    setCancel(null);
                    setNotice('Appointment cancelled. The slot is now available.');
                  } catch {}
                }}
              >
                Confirm cancellation
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
