# HealthCareKim

A responsive clinic operations portfolio application. English interface, fictional clinics, synthetic patients, persistent SQL records, and isolated 24-hour demo workspaces.

## Run locally

Requires Node.js 20.19+ (22 LTS recommended) and npm. From this directory:

```sh
npm ci
npm run setup
npm run dev
```

Open **http://127.0.0.1:3000** and choose **Explore demo**. `setup` creates an ignored `.env.local` with a random session secret and never overwrites an existing environment. Keep the same secret across restarts to retain access to existing demo sessions. No external account or hosted database is needed for the SQLite development mode. For Neon Free hosting, follow [Neon setup](docs/neon-setup.md).

For a production build:

```sh
npm run build
npm start
```

For Neon hosting, set the server-only `DATABASE_URL`, a random `SESSION_SECRET` containing at least 32 characters, and the exact public `APP_ORIGIN`. For local SQLite mode, use a persistent `DATABASE_PATH` instead. Use HTTPS for deployed sessions. The server refuses production sessions without a valid secret. The production server listens on port 3000 unless `PORT` is set.

## Demo walkthrough

1. Select administrator, coordinator, or viewer and a starting clinic.
2. Open Cases, filter **New** and **Unassigned**, and save a named view.
3. Open a case. On desktop it opens in a side sheet with a full-page link; mobile opens the detail route.
4. Assign Jamie Chen, move New → In review, add a synthetic operational note, and select Save changes.
5. Inspect Activity history, refresh, and confirm the saved ownership, status, and note.
6. Switch clinics. Each clinic has separate cases, members, appointments, settings, and saved views.
7. Use the account menu to explore another demo persona or reset only your workspace.

Each entry creates Willow Family Clinic, Harbor Wellness, and Summit Virtual Care, with 150 cases per clinic, fictional people, historical completions, notes, appointments, and audit events. Demo sessions expire after 24 hours; expired workspaces are cleaned on entry or with `npm run db:cleanup`. Active workspaces are capped at 100. `npm run db:seed` creates a named synthetic fixture once and preserves it on repeated runs until it expires; browser authentication still starts at `/demo`. Schema setup and CLI seeding are idempotent. Demo entry creates a separate workspace and the browser reset replaces only its own workspace.

## Roles

| Role          | Cases and appointments | Clinic settings and team              | Personal views/preferences |
| ------------- | ---------------------- | ------------------------------------- | -------------------------- |
| Administrator | Read and write         | Manage                                | Manage own                 |
| Coordinator   | Read and write         | Read team; clinic settings restricted | Manage own                 |
| Viewer        | Read only              | Read team; clinic settings restricted | Manage own                 |

The demo persona selector is limited to users already created in the current synthetic workspace. It rotates the server session, does not accept arbitrary user IDs, and does not grant access to other demos. Production customer enrollment, invitations, and external identity providers are outside this portfolio demo.

## Architecture

- Next.js App Router, React, strict TypeScript, Tailwind CSS v4, and original design tokens. Development and production builds use the supported Webpack runner because Turbopack was unstable in this Windows workspace.
- Customized Radix/shadcn-style composition for accessible dialogs, menus, buttons, and tables. Original abstract SVG brand icon and Lucide icons.
- TanStack Query owns interactive server data. TanStack Table provides headless table composition. Filters, sort, and pagination live in the URL; local component state owns unsaved forms and current-page selection.
- tRPC validates procedure input with Zod. React Hook Form and Zod manage appointment forms.
- Asynchronous Neon PostgreSQL adapter with a SQLite development fallback. Drizzle compiles parameterized SQL for both dialects. AsyncLocalStorage keeps each transaction on its own connection. No browser storage acts as the database.
- iron-session encrypts/seals an opaque session ID in an HTTP-only cookie. Users, sessions, demo expiry, and memberships are checked on the server. Cookie roles or client-provided identities are never authoritative.
- Recharts is loaded only when the overview mounts. Charts use stored case records and include a table equivalent. date-fns-tz handles clinic-local time over UTC epoch-millisecond storage.

Important source locations: `src/lib/service.ts` (scoped domain operations), `src/server/router.ts` (runtime-validated API), `src/lib/auth.ts` (sessions), `src/lib/demo-fixtures.ts` (batched demo fixtures), `src/components/` (interactive screens), and `migrations/0001_sqlite.sql` (executable schema).

## Data model

DemoSession owns Users and Clinics. Users have Memberships per clinic and revocable Sessions. Each clinic owns Patients, Cases, CaseNotes, Appointments, SavedViews, TablePreferences, and AuditEvents. Composite foreign keys prohibit cross-clinic patient, case, and assignee relationships. Indexes scope case pages, appointment availability, and audit pagination. SQLite migrations apply transactionally once per schema version.

Case writes use expected-version checks and atomic audit insertion. PostgreSQL exclusion constraints and SQLite triggers prevent overlapping active appointments. Clinic row locks on PostgreSQL and immediate transactions on SQLite serialize administrative writes. Last-administrator checks run inside the same write transaction. Bulk updates deliberately return per-record results, allowing partial success.

## Responsive behavior

Desktop uses a full sidebar, cases table, and side detail sheet. Tablet uses a labeled icon rail and a horizontally scrollable cases region. Mobile uses a navigation drawer, purposeful case cards, filter sheet, stacked detail form, and appointment agenda. The week view becomes a date-grouped agenda on mobile. Table density, visible columns, appearance, clinic accent, timezone, and business hours persist on the server at their proper user/clinic scope.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run test:postgres
npm run build
# Start the app on port 3001 for the default browser configuration:
# PowerShell: $env:PORT='3001'; npm run dev
# POSIX: PORT=3001 npm run dev
npx playwright install chromium
npm run test:e2e
```

Set `TEST_BASE_URL` to test another server origin. On this workstation the existing browser cache is selected with `PLAYWRIGHT_BROWSERS_PATH=C:\Users\hiu03\AppData\Local\ms-playwright`. Ordinary clean machines can use `npx playwright install chromium` instead. Backend tests use an isolated temporary database, including competing Node processes. Browser tests create their own synthetic workspaces and never touch real data.

See [verification results](docs/verification.md), [engineering decisions](docs/engineering-decisions.md), and [screenshots](docs/screenshots/). Source and dependency license notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Neon Free deployment preparation

The Neon runtime adapter is implemented. Set `DATABASE_URL` to your Neon pooled connection URL and run `npm run db:migrate` before the first hosted request. `npm run db:seed` creates an idempotent synthetic fixture. Existing local SQLite demo records remain local; they are not automatically uploaded.

The local application is connected to the user-created Neon Free project `neon-indigo-zebra` in AWS us-east-1. The schema and synthetic fixture are initialized, and six hosted-database browser workflows passed, including competing writes over separate connections. Credentials remain in ignored local environment settings. See [Neon Free setup](docs/neon-setup.md) for connection details and verification. Public website deployment remains separate. A Vercel process without `DATABASE_URL` fails clearly rather than falling back to ephemeral local files.

The PostgreSQL schema at `migrations/postgres/0001.sql` includes `btree_gist`, the appointment overlap exclusion constraint, and advisory locking around migrations. `DATABASE_URL_UNPOOLED` selects the direct migration endpoint while the application uses pooled `DATABASE_URL`. Local PostgreSQL-engine tests run in PGlite with that extension; the hosted transport was also verified against Neon. `npm test` retains the SQLite regression suite.

Docker source supports either a persistent SQLite volume or an explicitly supplied `DATABASE_URL`. Docker was unavailable here, so its configuration remains unverified. The optional Compose PostgreSQL reference service initializes the schema, but the application’s hosted transport uses the Neon serverless driver rather than a generic TCP PostgreSQL driver.

## Limits and honest scope

This is a synthetic-data engineering demonstration, not clinical software. It provides no diagnosis, treatment, prescribing, real payments, patient uploads, email invitations, HIPAA certification, or security certification, and has no affiliation with Bask Health. Do not enter real patient information.

SQLite is appropriate for this single-instance portfolio demo. The Neon adapter supports hosted/serverless use; production-scale exposure still needs shared abuse controls. Demo expiration, workspace count bounds, origin checks, encrypted cookies, tenant authorization, and database constraints are implemented; a production customer identity lifecycle and distributed rate limiting are not.

Automated viewport and touch emulation do not constitute physical-device or assistive-technology testing. Browser coverage uses Chromium. Remaining development-only dependency advisories and actual measurement conditions are recorded in `docs/verification.md`.
