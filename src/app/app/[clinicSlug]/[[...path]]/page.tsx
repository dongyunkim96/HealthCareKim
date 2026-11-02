import { redirect, notFound } from 'next/navigation';
import { context } from '@/lib/auth';
import { scope } from '@/lib/service';
import { Workspace } from '@/components/workspace';
export const dynamic = 'force-dynamic';
export default async function AppPage({
  params,
}: {
  params: Promise<{ clinicSlug: string; path?: string[] }>;
}) {
  const { clinicSlug, path = [] } = await params;
  const ctx = await context();
  if (!ctx) redirect('/demo');
  if (!path.length) redirect(`/app/${clinicSlug}/overview`);
  const [section, id] = path;
  if (
    !['overview', 'cases', 'appointments', 'team', 'activity', 'settings'].includes(section) ||
    path.length > 2 ||
    (path.length === 2 && section !== 'cases')
  )
    notFound();
  try {
    scope(ctx, clinicSlug);
  } catch {
    notFound();
  }
  return (
    <Workspace
      key={`${ctx.sessionId}:${clinicSlug}`}
      slug={clinicSlug}
      section={section}
      caseId={id}
      sessionKey={ctx.sessionId}
    />
  );
}
