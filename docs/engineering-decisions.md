# Engineering decisions

## Scope and environment

The repository was empty. The implementation uses the requested Next.js App Router stack and a working SQLite fallback because no hosted PostgreSQL credentials or database service were available. The SQL backend is authoritative; no localStorage or in-memory mock stores operational records. Exact dependency versions and the npm lockfile make installation reproducible.

The UI favors a quiet teal identity, useful case density, clear labels alongside status colors, an original SVG icon, and purpose-built mobile cards. System fonts avoid external font requests. Radix primitives supply focus trapping, Escape handling, accessible dialog names, and menu behavior; the controlled-dialog wrapper explicitly restores the last external focus target.

## Tenant boundary

An encrypted/sealed HTTP-only cookie contains only an opaque session ID. The server joins the session to its unexpired demo workspace and user. Every procedure resolves the clinic by both demo ID and clinic slug and reads active membership again. Roles are never accepted from a request as authority.

Every tenant-owned record includes clinic identity. Patient, case, note, appointment, and assignment relations use composite foreign keys so invalid cross-clinic links also fail below the service layer. Resource lookups use both clinic ID and entity ID. Saved views and visible columns additionally include the authenticated user. User preferences intentionally apply to that user across their three clinics.

The public persona control is a demo feature with a fixed allowlist. It can select only a persona already seeded inside the caller's workspace, rotates the opaque session ID, and revokes the prior session. It cannot mint arbitrary membership or act on another workspace. Reset and expiration delete only a demo ownership root with cascading cleanup. Workspace creation is transactional and limited to 100 active workspaces of 24 hours each.

## Server state and switching

TanStack Query owns all operational screen data. Server route handling checks session and membership for access but does not independently fetch the same screen datasets. Keys include server session ID, clinic slug, resource name, and applicable filters/record ID. Query functions forward cancellation signals. No previous-data placeholder is used when a clinic changes. The workspace remounts on session or clinic change, clearing temporary forms, panels, and selections. Cache invalidation follows successful mutations.

Case filters, sort, order, and page round-trip through URL search parameters. Sorting includes a stable case-ID tie-breaker. Filters reset pagination. Unknown enum values, invalid calendar dates, and malformed page numbers normalize to usable defaults in the UI; direct API inputs are validated by Zod. Selection contains both a query signature and page-local IDs, so filters and page changes cannot silently carry selection forward.

## Transactions and edits

Case writes run under a SQLite `BEGIN IMMEDIATE` transaction. The requested version must equal the stored version; the update also predicates on that version. Assignment, status, priority, internal note, and corresponding audit events commit together. A failed audit insertion rolls everything back. Audit records have no update or delete procedure.

New → In review; In review → Needs information or Completed; Needs information → In review; Completed → In review with a reopen reason of at least five characters. The server enforces the state machine, including bulk calls. Reopening clears the current completion timestamp while keeping historical audit events.

Conflict UI keeps proposed field edits and note text, offers a record refresh, and requires the user to save again after review. It does not automatically replay a stale mutation. Ordinary failures retain drafts and never show a success message. Bulk actions use independently checked transactions and report per-item success and failure rather than implying all-or-nothing behavior.

## Appointment integrity

UTC epoch milliseconds are the persisted timestamp format. Forms show and accept clinic-local wall time with an explicit IANA timezone label. date-fns-tz converts local time; a round trip rejects nonexistent DST times. Business hours are integer hour boundaries, Monday through Friday, and duration is 15–120 minutes. Opening/closing boundaries are checked on the server. Typical seeded US zones place DST clock changes on Sundays outside business hours; such ambiguous appointments cannot pass the weekday rule.

SQLite insert/update triggers reject intersecting half-open intervals for the same clinic and staff member where cancellation is false. `BEGIN IMMEDIATE`, WAL, and a busy timeout serialize concurrent writes; adjacent appointments are allowed. Cancelled appointments remain in history and release the slot. Reschedules recheck overlap and version. The UI proposes alternatives from the currently loaded schedule and explicitly rechecks on save.

The PostgreSQL reference schema uses `btree_gist` and an exclusion constraint over clinic ID, staff ID, and `int8range(starts_at, ends_at, '[)')`, restricted to active appointments. This schema is prepared but not verified against a live PostgreSQL server. Runtime portability requires an asynchronous query adapter; SQLite behavior should not be represented as a tested PostgreSQL implementation.

## Metrics and performance

Open and unassigned KPIs describe current non-completed cases. Completed count and mean elapsed completion hours use the selected rolling period. Chart days group stored creation/completion timestamps in clinic time. Each metric links to the matching filtered case list. Completion time measures calendar hours, not business hours. Reopening can change the current aggregate; the audit trail retains prior completion events.

Only 15 case records and 20 audit events are returned per page. Joined record queries use prepared parameters; sort SQL comes from a fixed map. Chart code is dynamically imported, has a stable reserved height, and does not animate initial data. Overview calculations are bounded to the 150 seeded cases per clinic; a production system should move these aggregates into indexed SQL/time buckets as scale grows. Appointment lists are intentionally bounded by the demo's lifecycle, rather than implementing infinite calendar history.

## Deployment and remaining tradeoffs

The tested runtime is a single Node server with a persistent SQLite file. Do not put the file on an ephemeral or shared multi-writer network filesystem. Docker source provides a persistent volume and non-root process but was not built in this environment. Production sessions require a configured secret and secure cookies; use HTTPS in deployment. A local development secret is generated by setup and excluded from source.

This demo does not include customer signup, password recovery, email delivery, billing, clinical integrations, real patient uploads, a physical-device lab, or full assistive-technology certification. The aggregate workspace bound is not a replacement for production rate limiting. Moderate development-tool advisories remain where upstream major upgrades would need a separate compatibility review; production dependency audit results are recorded separately.

Sources consulted include the official [Next.js documentation](https://nextjs.org/docs), [shadcn/ui](https://github.com/shadcn-ui/ui), [TanStack Table](https://github.com/TanStack/table), [TanStack Query](https://github.com/TanStack/query), [Lucide](https://github.com/lucide-icons/lucide), [Recharts](https://github.com/recharts/recharts), [tailwind-merge](https://github.com/dcastil/tailwind-merge), [Drizzle](https://orm.drizzle.team/docs/get-started), and [iron-session](https://github.com/vvo/iron-session). Installed source notices are retained in THIRD_PARTY_NOTICES.md.
