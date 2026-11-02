'use client';
import { useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, ArrowRight, LoaderCircle, TriangleAlert, HeartPulse } from 'lucide-react';
import Link from 'next/link';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="HealthCareKim home">
      <span className="brand-symbol">
        <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M16 3 28 10v12l-12 7L4 22V10L16 3Z" stroke="currentColor" strokeWidth="2" />
          <path
            d="M10 16h4l2-5 3 10 2-5h3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {!compact && (
        <span>
          HealthCare<span className="brand-kim">Kim</span>
          <small>CLINIC OPERATIONS</small>
        </span>
      )}
    </Link>
  );
}
export function Button({
  children,
  className,
  variant = 'primary',
  pending = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  pending?: boolean;
}) {
  return (
    <button
      className={cn('btn', `btn-${variant}`, className)}
      {...props}
      disabled={pending || props.disabled}
    >
      {pending && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Badge({ value }: { value: string }) {
  return (
    <span className={cn('badge', `badge-${value.toLowerCase().replaceAll(' ', '-')}`)}>
      <span className="badge-dot" />
      {value}
    </span>
  );
}
export function Avatar({ name, size = 'normal' }: { name: string; size?: 'normal' | 'small' }) {
  return (
    <span className={`avatar avatar-${size}`} aria-hidden="true">
      {name
        .split(' ')
        .slice(0, 2)
        .map((s) => s[0])
        .join('')}
    </span>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  sheet = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  sheet?: boolean;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const track = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && !event.target.closest('[role="dialog"]'))
        returnFocus.current = event.target;
    };
    document.addEventListener('focusin', track);
    return () => document.removeEventListener('focusin', track);
  }, []);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className={cn('dialog-content', sheet && 'dialog-sheet')}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
          }}
        >
          <div className="dialog-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description || 'Review the details below.'}</Dialog.Description>
            </div>
            <Dialog.Close className="icon-btn" aria-label="Close dialog">
              <X size={20} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <TriangleAlert size={19} />
      <div>
        <strong>We couldn’t complete that action</strong>
        <p>{error instanceof Error ? error.message : String(error)}</p>
        {retry && (
          <Button variant="secondary" onClick={retry}>
            Try again
          </Button>
        )}
        <Link href="/demo" className="inline-link">
          Return to demo entry
        </Link>
      </div>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={26} />
      <p>Getting your workspace ready…</p>
    </div>
  );
}
export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <HeartPulse size={30} />
      <h3>{title}</h3>
      <p>{children || 'Try adjusting your filters to see more results.'}</p>
    </div>
  );
}
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link className="text-link" href={href}>
      {children}
      <ArrowRight size={15} />
    </Link>
  );
}
