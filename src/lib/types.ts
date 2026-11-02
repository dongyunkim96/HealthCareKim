export const statuses = ['New', 'In review', 'Needs information', 'Completed'] as const;
export const priorities = ['Low', 'Normal', 'High', 'Urgent'] as const;
export type Role = 'admin' | 'coordinator' | 'viewer';
export type Clinic = {
  id: string;
  demo_id: string;
  slug: string;
  name: string;
  timezone: string;
  accent: string;
  start_hour: number;
  end_hour: number;
};
export type Member = {
  id: string;
  clinic_id: string;
  user_id: string;
  name: string;
  role: Role;
  active: number;
  workload?: number;
};
export type Case = {
  id: string;
  clinic_id: string;
  patient_id: string;
  patient: string;
  dob: string;
  reference: string;
  number: string;
  type: string;
  status: (typeof statuses)[number];
  priority: (typeof priorities)[number];
  assignee_id: string | null;
  assignee: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  version: number;
};
export type Audit = {
  id: string;
  actor: string;
  action: string;
  description: string;
  entity_id: string;
  created_at: number;
};
export type Note = {
  id: string;
  actor: string;
  body: string;
  created_at: number;
};
export type Appointment = {
  id: string;
  patient_id: string;
  patient: string;
  staff_id: string;
  staff: string;
  title: string;
  starts_at: number;
  ends_at: number;
  cancelled: number;
  version: number;
};
export type User = {
  id: string;
  name: string;
  persona: string;
  appearance: string;
  density: string;
};
export type Context = { sessionId: string; demoId: string; user: User };
