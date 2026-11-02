-- PostgreSQL reference schema. The application currently runs the verified SQLite adapter.
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE IF NOT EXISTS demo_sessions(id TEXT PRIMARY KEY, expires_at BIGINT NOT NULL, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS clinics(id TEXT PRIMARY KEY, demo_id TEXT NOT NULL REFERENCES demo_sessions(id) ON DELETE CASCADE, slug TEXT NOT NULL, name TEXT NOT NULL, timezone TEXT NOT NULL DEFAULT 'America/New_York', accent TEXT NOT NULL DEFAULT 'teal', start_hour BIGINT NOT NULL DEFAULT 8, end_hour BIGINT NOT NULL DEFAULT 18, UNIQUE(demo_id,slug));
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, demo_id TEXT NOT NULL REFERENCES demo_sessions(id) ON DELETE CASCADE, name TEXT NOT NULL, persona TEXT NOT NULL, appearance TEXT NOT NULL DEFAULT 'light', density TEXT NOT NULL DEFAULT 'comfortable', UNIQUE(demo_id,persona));
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, demo_id TEXT NOT NULL REFERENCES demo_sessions(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS memberships(id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','coordinator','viewer')), active BIGINT NOT NULL DEFAULT 1, UNIQUE(clinic_id,id), UNIQUE(clinic_id,user_id));
CREATE TABLE IF NOT EXISTS patients(id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, name TEXT NOT NULL, dob TEXT NOT NULL, reference TEXT NOT NULL, UNIQUE(clinic_id,id));
CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, patient_id TEXT NOT NULL, number TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('New','In review','Needs information','Completed')), priority TEXT NOT NULL CHECK(priority IN ('Low','Normal','High','Urgent')), assignee_id TEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, completed_at BIGINT, version BIGINT NOT NULL DEFAULT 1, UNIQUE(clinic_id,id), UNIQUE(clinic_id,number), FOREIGN KEY(clinic_id,patient_id) REFERENCES patients(clinic_id,id), FOREIGN KEY(clinic_id,assignee_id) REFERENCES memberships(clinic_id,id));
CREATE INDEX IF NOT EXISTS cases_scope ON cases(clinic_id,status,updated_at,id);
CREATE INDEX IF NOT EXISTS cases_created ON cases(clinic_id,created_at,id);
CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, case_id TEXT NOT NULL, actor TEXT NOT NULL, body TEXT NOT NULL, created_at BIGINT NOT NULL, FOREIGN KEY(clinic_id,case_id) REFERENCES cases(clinic_id,id));
CREATE TABLE IF NOT EXISTS appointments(id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, patient_id TEXT NOT NULL, staff_id TEXT NOT NULL, title TEXT NOT NULL, starts_at BIGINT NOT NULL, ends_at BIGINT NOT NULL, cancelled BIGINT NOT NULL DEFAULT 0, version BIGINT NOT NULL DEFAULT 1, FOREIGN KEY(clinic_id,patient_id) REFERENCES patients(clinic_id,id), FOREIGN KEY(clinic_id,staff_id) REFERENCES memberships(clinic_id,id), CHECK(ends_at > starts_at), UNIQUE(clinic_id,id));
CREATE INDEX IF NOT EXISTS appointments_scope ON appointments(clinic_id,staff_id,starts_at);
CREATE TABLE IF NOT EXISTS saved_views(id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, filters TEXT NOT NULL, UNIQUE(clinic_id,user_id,name));
CREATE TABLE IF NOT EXISTS audit_events(id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, actor TEXT NOT NULL, action TEXT NOT NULL, entity_id TEXT NOT NULL, description TEXT NOT NULL, created_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS audit_scope ON audit_events(clinic_id,created_at,id);
CREATE TABLE IF NOT EXISTS table_preferences(clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, columns TEXT NOT NULL, PRIMARY KEY(clinic_id,user_id));
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='appointments_no_overlap') THEN
ALTER TABLE appointments ADD CONSTRAINT appointments_no_overlap
EXCLUDE USING gist (clinic_id WITH =, staff_id WITH =, int8range(starts_at,ends_at,'[)') WITH &&) WHERE (cancelled=0);
END IF;
END $$;
COMMIT;
