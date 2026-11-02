import { randomUUID } from 'node:crypto';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { transaction, lockDemoCreation, run, one, insertMany } from './db';
import { statuses, priorities } from './types';
const first = [
  'Avery',
  'Jordan',
  'Morgan',
  'Riley',
  'Cameron',
  'Taylor',
  'Parker',
  'Quinn',
  'Alex',
  'Jamie',
  'Sam',
  'Casey',
  'Emerson',
  'Rowan',
  'Skyler',
];
const last = [
  'Bennett',
  'Chen',
  'Davis',
  'Ellis',
  'Foster',
  'Garcia',
  'Hayes',
  'Kim',
  'Lewis',
  'Morgan',
];
export async function cleanup() {
  return (await run('DELETE FROM demo_sessions WHERE expires_at < ?', Date.now())).changes;
}

/** Generate one workspace and persist it in batches, rather than one network trip per record. */
export async function createDemo(persona = 'admin') {
  return transaction(async () => {
    await lockDemoCreation();
    await cleanup();
    if (((await one<{ n: number }>('SELECT COUNT(*) n FROM demo_sessions'))?.n ?? 0) >= 100)
      throw new Error('The demo is busy. Please try again later.');
    const demoId = randomUUID(),
      now = Date.now(),
      expires = now + 86400000;
    await run('INSERT INTO demo_sessions VALUES(?,?,?)', demoId, expires, now);
    const users = [
      ['admin', 'Alex Morgan'],
      ['coordinator', 'Jamie Chen'],
      ['viewer', 'Sam Rivera'],
      ['staff', 'Taylor Brooks'],
    ].map(([role, name]) => ({ id: randomUUID(), role, name }));
    await insertMany(
      'users',
      ['id', 'demo_id', 'name', 'persona'],
      users.map((u) => [u.id, demoId, u.name, u.role]),
    );
    const clinics = [
      ['willow', 'Willow Family Clinic', 'America/New_York'],
      ['harbor', 'Harbor Wellness', 'America/Chicago'],
      ['summit', 'Summit Virtual Care', 'America/Los_Angeles'],
    ].map(([slug, name, timezone]) => ({ id: randomUUID(), slug, name, timezone }));
    await insertMany(
      'clinics',
      ['id', 'demo_id', 'slug', 'name', 'timezone'],
      clinics.map((c) => [c.id, demoId, c.slug, c.name, c.timezone]),
    );
    const memberRows: unknown[][] = [],
      patientRows: unknown[][] = [],
      caseRows: unknown[][] = [],
      auditRows: unknown[][] = [],
      noteRows: unknown[][] = [],
      appointmentRows: unknown[][] = [];
    for (const [ci, clinic] of clinics.entries()) {
      const members = users.map((u) => ({ ...u, id: randomUUID(), userId: u.id }));
      memberRows.push(
        ...members.map((m) => [
          m.id,
          clinic.id,
          m.userId,
          m.name,
          m.role === 'staff' ? 'coordinator' : m.role,
        ]),
      );
      const patients: string[] = [];
      for (let i = 0; i < 150; i++) {
        const patientId = randomUUID(),
          caseId = randomUUID(),
          created = now - ((i * 13 + Math.floor(i / 9) * 7) % 42) * 86400000 - (i % 8) * 3600000;
        const status = statuses[i % 10 < 3 ? 0 : i % 10 < 6 ? 1 : i % 10 < 8 ? 2 : 3],
          updated = Math.min(now, created + ((i % 4) + 1) * 3600000),
          number = `HC-${ci + 1}${1000 + i}`;
        const patient = `${first[i % first.length]} ${last[Math.floor(i / first.length) % last.length]}`;
        patients.push(patientId);
        patientRows.push([
          patientId,
          clinic.id,
          patient,
          `${1960 + (i % 45)}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
          `SYN-${ci + 1}${String(i + 1).padStart(4, '0')}`,
        ]);
        caseRows.push([
          caseId,
          clinic.id,
          patientId,
          number,
          ['New patient intake', 'Follow-up coordination', 'Referral review', 'Document request'][
            i % 4
          ],
          status,
          priorities[i % 13 === 0 ? 3 : i % 5 === 0 ? 2 : i % 4 === 0 ? 0 : 1],
          i % 5 === 0 ? null : members[i % 2 === 0 ? 0 : 1].id,
          created,
          updated,
          status === 'Completed' ? updated : null,
          1,
        ]);
        auditRows.push([
          randomUUID(),
          clinic.id,
          'Demo intake',
          'case.created',
          caseId,
          `Created case ${number}`,
          created,
        ]);
        if (status !== 'New')
          auditRows.push([
            randomUUID(),
            clinic.id,
            members[1].name,
            'case.status',
            caseId,
            `Moved case to ${status}`,
            updated,
          ]);
        if (i < 20)
          noteRows.push([
            randomUUID(),
            clinic.id,
            caseId,
            members[1].name,
            'Synthetic intake received. Please confirm administrative details before closing.',
            updated,
          ]);
      }
      let count = 0;
      for (let day = 0; day < 12 && count < 12; day++) {
        const date = formatInTimeZone(now + day * 86400000, clinic.timezone, 'yyyy-MM-dd'),
          weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
        if (weekday === 0 || weekday === 6) continue;
        for (let slot = 0; slot < 3 && count < 12; slot++, count++) {
          const start = fromZonedTime(
            `${date}T${String(9 + slot * 2).padStart(2, '0')}:00:00`,
            clinic.timezone,
          ).getTime();
          appointmentRows.push([
            randomUUID(),
            clinic.id,
            patients[count],
            members[count % 2].id,
            ['Intake consultation', 'Follow-up check-in', 'Care coordination'][slot],
            start,
            start + 30 * 60000,
          ]);
        }
      }
    }
    await insertMany('memberships', ['id', 'clinic_id', 'user_id', 'name', 'role'], memberRows);
    await insertMany('patients', ['id', 'clinic_id', 'name', 'dob', 'reference'], patientRows);
    await insertMany(
      'cases',
      [
        'id',
        'clinic_id',
        'patient_id',
        'number',
        'type',
        'status',
        'priority',
        'assignee_id',
        'created_at',
        'updated_at',
        'completed_at',
        'version',
      ],
      caseRows,
    );
    await insertMany(
      'audit_events',
      ['id', 'clinic_id', 'actor', 'action', 'entity_id', 'description', 'created_at'],
      auditRows,
    );
    await insertMany(
      'notes',
      ['id', 'clinic_id', 'case_id', 'actor', 'body', 'created_at'],
      noteRows,
    );
    await insertMany(
      'appointments',
      ['id', 'clinic_id', 'patient_id', 'staff_id', 'title', 'starts_at', 'ends_at'],
      appointmentRows,
    );
    const user = users.find((u) => u.role === persona) ?? users[0],
      sessionId = randomUUID();
    await run('INSERT INTO sessions VALUES(?,?,?,?)', sessionId, demoId, user.id, expires);
    return { sessionId, demoId };
  });
}
