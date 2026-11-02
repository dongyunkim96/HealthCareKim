'use client';
import { createTRPCClient, httpLink } from '@trpc/client';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useState } from 'react';
import type { AppRouter } from '@/server/router';
export const api = createTRPCClient<AppRouter>({
  links: [httpLink({ url: '/api/trpc' })],
});
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: true },
          mutations: { retry: 0 },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
export function useAction<TInput, TOutput>(fn: (input: TInput) => Promise<TOutput>) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => cache.invalidateQueries(),
  });
}
export async function demoAction(action: string, persona = 'admin') {
  const response = await fetch('/api/demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, persona }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to continue.');
  return data;
}
