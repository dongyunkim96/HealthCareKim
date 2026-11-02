import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/server/router';
import { context } from '@/lib/auth';
import { trustedOrigin } from '@/lib/origin';
export const runtime = 'nodejs';
function handler(req: Request) {
  if (req.method === 'POST' && !trustedOrigin(req))
    return new Response('Origin not allowed', { status: 403 });
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: async () => ({ identity: await context() }),
  });
}
export { handler as GET, handler as POST };
