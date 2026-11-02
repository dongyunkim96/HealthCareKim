import type { Metadata } from 'next';
import { Providers } from '@/lib/client';
import './globals.css';
export const metadata: Metadata = {
  title: {
    default: 'HealthCareKim — Clarity for every clinic',
    template: '%s | HealthCareKim',
  },
  description:
    'A fictional clinic operations demo. Organize intake, coordinate appointments, and bring clarity to your team’s day.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
