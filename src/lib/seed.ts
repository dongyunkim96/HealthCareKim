import { randomUUID } from 'node:crypto';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { sqlite, run, one } from './db';
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
export function cleanup() {
  return run('DELETE FROM demo_sessions WHERE expires_at < ?', Date.now()).changes;
}
export function createDemo(persona = 'admin') {
  cleanup();
  if ((one<{ n: number }>('SELECT COUNT(*) n FROM demo_sessions')?.n ?? 0) >= 100)
    throw new Error('The demo is busy. Please try again later.');
  return sqlite.transaction(() => {
    const demoId = randomUUID(),
      now = Date.now(),
      expires = now + 86400000;
    run('INSERT INTO demo_sessions VALUES(?,?,?)', demoId, expires, now);
    const people = [
      ['admin', 'Alex Morgan'],
      ['coordinator', 'Jamie Chen'],
      ['viewer', 'Sam Rivera'],
      ['staff', 'Taylor Brooks'],
    ];
    const users = people.map(([role, name]) => {
      const id = randomUUID();
      run('INSERT INTO users(id,demo_id,name,persona) VALUES(?,?,?,?)', id, demoId, name, role);
      return { id, name, role };
    });
    const clinics = [
      ['willow', 'Willow Family Clinic', 'America/New_York'],
      ['harbor', 'Harbor Wellness', 'America/Chicago'],
      ['summit', 'Summit Virtual Care', 'America/Los_Angeles'],
    ];
    clinics.forEach(([slug, name, tz], ci) => {
      const clinicId = randomUUID();
      run(
        'INSERT INTO clinics(id,demo_id,slug,name,timezone) VALUES(?,?,?,?,?)',
        clinicId,
        demoId,
        slug,
        name,
        tz,
      );
      const members = users.map((u) => {
        const id = randomUUID();
        run(
          'INSERT INTO memberships(id,clinic_id,user_id,name,role) VALUES(?,?,?,?,?)',
          id,
          clinicId,
          u.id,
          u.name,
          u.role === 'staff' ? 'coordinator' : u.role,
        );
        return { ...u, id };
      });
      const patients: string[] = [];
      for (let i = 0; i < 150; i++) {
        const patientId = randomUUID(),
          caseId = randomUUID(),
          created = now - ((i * 13 + Math.floor(i / 9) * 7) % 42) * 86400000 - (i % 8) * 3600000;
        const status = statuses[i % 10 < 3 ? 0 : i % 10 < 6 ? 1 : i % 10 < 8 ? 2 : 3];
        const updated = Math.min(now, created + ((i % 4) + 1) * 3600000);
        const patient = `${first[i % first.length]} ${last[Math.floor(i / first.length) % last.length]}`;
        patients.push(patientId);
        run(
          'INSERT INTO patients VALUES(?,?,?,?,?)',
          patientId,
          clinicId,
          patient,
          `${1960 + (i % 45)}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
          `SYN-${ci + 1}${String(i + 1).padStart(4, '0')}`,
        );
        const assignee = i % 5 === 0 ? null : members[i % 2 === 0 ? 0 : 1].id;
        run(
          'INSERT INTO cases VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
          caseId,
          clinicId,
          patientId,
          `HC-${ci + 1}${String(1000 + i)}`,
          ['New patient intake', 'Follow-up coordination', 'Referral review', 'Document request'][
            i % 4
          ],
          status,
          priorities[i % 13 === 0 ? 3 : i % 5 === 0 ? 2 : i % 4 === 0 ? 0 : 1],
          assignee,
          created,
          updated,
          status === 'Completed' ? updated : null,
          1,
        );
        run(
          'INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)',
          randomUUID(),
          clinicId,
          'Demo intake',
          'case.created',
          caseId,
          `Created case HC-${ci + 1}${1000 + i}`,
          created,
        );
        if (status !== 'New')
          run(
            'INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)',
            randomUUID(),
            clinicId,
            members[1].name,
            'case.status',
            caseId,
            `Moved case to ${status}`,
            updated,
          );
        if (i < 20)
          run(
            'INSERT INTO notes VALUES(?,?,?,?,?,?)',
            randomUUID(),
            clinicId,
            caseId,
            members[1].name,
            'Synthetic intake received. Please confirm administrative details before closing.',
            updated,
          );
      }
      // Upcoming weekdays, generated in each clinic's local business time.
      let count = 0;
      for (let day = 0; day < 12 && count < 12; day++) {
        const date = formatInTimeZone(now + day * 86400000, tz, 'yyyy-MM-dd');
        const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
        if (weekday === 0 || weekday === 6) continue;
        for (let slot = 0; slot < 3 && count < 12; slot++, count++) {
          const start = fromZonedTime(
            `${date}T${String(9 + slot * 2).padStart(2, '0')}:00:00`,
            tz,
          ).getTime();
          run(
            'INSERT INTO appointments(id,clinic_id,patient_id,staff_id,title,starts_at,ends_at) VALUES(?,?,?,?,?,?,?)',
            randomUUID(),
            clinicId,
            patients[count],
            members[count % 2].id,
            ['Intake consultation', 'Follow-up check-in', 'Care coordination'][slot],
            start,
            start + 30 * 60000,
          );
        }
      }
    });
    const user = users.find((x) => x.role === persona) ?? users[0];
    const sessionId = randomUUID();
    run('INSERT INTO sessions VALUES(?,?,?,?)', sessionId, demoId, user.id, expires);
    return { sessionId, demoId };
  })();
}
