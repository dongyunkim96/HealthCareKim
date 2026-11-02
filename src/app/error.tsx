'use client';
import { ErrorBox } from '@/components/ui';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main-content" className="standalone">
      <ErrorBox error={error} retry={reset} />
    </main>
  );
}
