# Verification report

## Public Vercel and Neon deployment — November 2, 2026

The production website is live at [health-care-kim.vercel.app](https://health-care-kim.vercel.app/). Vercel project `health-care-kim` deployed commit `8c0529b2fdf50f9c2756763a7904da539fc1cf62` from `dongyunkim96/HealthCareKim`, branch `main`, and reached READY. The Linux build completed in 40 seconds. The runtime is Node.js 24.x.

Neon provides `DATABASE_URL` and `DATABASE_URL_UNPOOLED` through its Vercel integration. A dedicated production `SESSION_SECRET` and the exact production `APP_ORIGIN` were configured through the authenticated dashboard after the plugin returned 403 for environment-variable access. No credentials were committed to the repository.

Six Playwright workflows passed against the public production origin in **27.6 seconds**: demo entry/filter/save-view/assignment/status/audit/refresh/clinic isolation; direct API roles and persona switching; appointment creation/rescheduling/cancellation; stale-edit recovery; competing HTTP edits and bookings; and workspace reset isolation. Competing writes returned one success and one HTTP 409 for each pair, with one case version increment and one persisted note.

The post-deployment error/fatal log query returned no entries for this deployment in the checked 15-minute window. This is a bounded observation, not continuous monitoring. Production initialization and synthetic seeding had already completed; the build command does not run them automatically. Preview environments were not verified.

The adapter and initial-build sections below record earlier verification stages. Their statements about a local-only application describe those stages, before the public deployment above.

## Neon adapter conversion — November 2, 2026

The application now has an asynchronous Neon PostgreSQL runtime adapter selected by `DATABASE_URL`, with the existing SQLite development fallback retained. It is connected to the user-created Neon Free project `neon-indigo-zebra` (`billowing-morning-78982436`), branch `main`, database `neondb`, in AWS us-east-1. Schema migration succeeded through the direct endpoint; application and seed traffic succeeded through the pooled endpoint. No paid plan or external website deployment was activated.

| Check                                                               | Actual result                                    |
| ------------------------------------------------------------------- | ------------------------------------------------ |
| SQLite backend + parameter compilation                              | 27 tests passed                                  |
| PostgreSQL engine + parameter compilation (`npm run test:postgres`) | 27 tests passed in PGlite with `btree_gist`      |
| PostgreSQL-backed production browser suite                          | 14 tests passed in 47.6 seconds                  |
| Type checking and lint                                              | Passed                                           |
| Production build without hosted credentials                         | Passed                                           |
| SQLite migration and repeated named seed                            | Passed; existing fixture preserved               |
| Production dependency audit after adding Neon/ws                    | 0 known vulnerabilities                          |
| Live Neon browser workflows through local production app            | 6 tests passed (5 in 24.3s; concurrency in 3.5s) |
| Live Neon repeated seed                                             | Same fixture preserved                           |

The browser run targeted `http://127.0.0.1:3003` with a separate persistent local PGlite database. It covered the original 13 scenarios plus reset isolation between independent demo workspaces. The 360/390/768/1024/1440 viewport checks and light/dark/mobile accessibility scans passed. Updated screenshots and accessibility JSON files come from that run.

SQLite's competing-writer tests still use independent Node processes. The embedded PostgreSQL run tests competing asynchronous requests in its single engine. Separately, live Neon competing HTTP requests used distinct pooled transactions and returned one success and one HTTP 409 for both stale case writes and overlapping bookings; the case version advanced once and exactly one note persisted. Local suites check transactions, authorization, tenancy, stale versions, bulk results, and appointment overlaps. Parameter compilation additionally checks quoted question marks, hostile input binding, and missing/extra values. Tests clear `DATABASE_URL` before imports so fault-injection tests cannot alter a hosted database.

The schema migration now installs the PostgreSQL overlap exclusion constraint under an advisory lock. Demo creation uses batched inserts, a 100-workspace cap protected by a transaction advisory lock, and 24-hour expiration. Each mutation stays on its acquired connection through AsyncLocalStorage. Clinic row locks serialize permission checks and last-administrator decisions. Reset removes the current workspace and creates its replacement atomically.

Live browser verification also covered assignment/status/audit/refresh persistence and clinic isolation, API roles/persona switching, appointment create/conflict/reschedule/cancel, stale-edit draft recovery, and reset isolation between independent workspaces. Credentials are saved only in the ignored `.env.local`; existing session settings were preserved. See [Neon setup](neon-setup.md). The app server remains local at port 3001; publishing the website and configuring its deployment environment are still separate work.

The performance measurements below predate this adapter conversion. They describe the initial local build and should not be interpreted as Neon latency measurements.

# Initial local-build verification (historical)

Verified November 2, 2026, on Windows with Node.js 20.19.3, Next.js 16.4.4, and headless Chromium 156.0.8078.4. All operational data was synthetic. No external deployment was published.

## Final results

| Check                         | Actual result                                                      |
| ----------------------------- | ------------------------------------------------------------------ |
| `npm run typecheck`           | Passed; strict TypeScript                                          |
| `npm run lint`                | Passed; no warnings or errors                                      |
| `npm test`                    | 24 tests passed                                                    |
| `npm run build`               | Passed using Next.js's supported Webpack builder                   |
| `npm run test:e2e`            | 13 tests passed against the final production build in 41.9 seconds |
| Repeated `npm run db:seed`    | Same fixture preserved; idempotency confirmed                      |
| `npm run db:cleanup`          | Passed; 0 expired workspaces removed in the final check            |
| `npm audit --omit=dev --json` | 0 known production dependency vulnerabilities                      |
| License notices               | Installed production notices recorded in THIRD_PARTY_NOTICES.md    |

Earlier failures were corrected before the final full browser run: seed placeholders, filter labels, controlled-dialog focus restoration, muted text contrast, dark overview contrast, and a focusable Recharts layer inside a hidden graphic. The chart data table remains accessible while the duplicate graphic layer is non-focusable. A stale-edit test locator was narrowed to the application's error region instead of Next.js's separate route announcer.

Turbopack was unstable in this Windows workspace: development entered a repeated refresh cycle and production CSS compilation exited unexpectedly, including outside the sandbox. Development and build scripts now use `--webpack`. A subsequent sandbox-only generated-directory permission failure was resolved by running the same production build outside the sandbox. The final production build completed successfully.

The documented Webpack development flow also passed homepage → demo entry → overview. A final production client-bundle scan found no session-secret value in any of the 33 JavaScript assets scanned.

## Backend coverage: 24 tests

- 150 cases per clinic and separation between independent demo workspaces.
- All roles' reads, allowed case/appointment writes, viewer operational/admin denials, coordinator admin denials, and unauthenticated caller denial.
- Foreign-clinic case, patient, assignee, appointment, and saved-view IDs, plus another demo's case ID.
- Composite foreign-key rejection below the API boundary.
- Membership revalidation and last active administrator protection.
- State transitions, reopen reasons, stale versions, and note preservation.
- Injected audit-write failure rolling back both record changes and notes.
- Per-record partial bulk failure reporting.
- Competing Node processes using the same SQLite file: exactly one stale edit succeeds and exactly one overlapping appointment succeeds.
- Stable pagination, search, and user/clinic saved-view scope.
- Cancellation releasing slots and reschedules rechecking overlap.
- Weekend, business-hour, and duration validation.
- Nonexistent DST time rejection, both offsets across the November 1, 2026 US fallback, and clinic-local date grouping.
- Expiration cleanup preserving active workspaces.

Tests use temporary isolated databases and do not reset application data. Role/tenant tests invoke the same tRPC procedures and service operations used by HTTP routes; browser tests additionally exercise HTTP denial behavior.

## Browser coverage: 13 tests

1. Demo entry → case filters → saved view → desktop detail sheet/full route → assignment → status → note → audit → refresh persistence → clinic isolation → saved-view refresh.
2. URL sorting/pagination, browser back, filter page reset, and selection clearing.
3. Viewer denial over HTTP, read-only UI, allowed coordinator persona switching, and foreign-origin rejection.
4. Appointment creation, reschedule, cancellation, and cancelled-history visibility.
   5–9. Navigation, filters, details, agenda, screenshots, and horizontal-overflow checks at every requested viewport.
5. Representative axe scans and keyboard Enter/Tab/Shift+Tab/Escape, focus containment, and restoration to the filter button.
6. Stale case save preserving a draft, explicit refresh/review, and successful retry.
7. Appointment conflict preserving its form, offering alternatives, and saving an available alternative.
8. Visible-column and appearance persistence, dark appearance scans, and mobile case-card accessibility.

## Accessibility and viewports

Light appearance axe scans returned zero violations under the enabled WCAG 2 A/AA, WCAG 2.1 A/AA, and WCAG 2.2 AA tags on `/`, `/demo`, and Willow's overview, cases, case detail, appointments, team, activity, and settings. Dark overview/cases/settings and mobile cases also returned zero violations under their recorded tags. Raw results are in `accessibility-results.json` and `accessibility-variants.json`.

These are automated scans and browser keyboard checks, not WCAG certification or physical-device/screen-reader testing. Firefox, Safari, VoiceOver, NVDA, and high-contrast mode were not tested.

| Viewport   | Input emulation            | Screenshot suffix |
| ---------- | -------------------------- | ----------------- |
| 360 × 800  | Mobile and touch           | `-360.png`        |
| 390 × 844  | Mobile and touch           | `-390.png`        |
| 768 × 1024 | Tablet portrait and touch  | `-768.png`        |
| 1024 × 768 | Tablet landscape and touch | `-1024.png`       |
| 1440 × 900 | Desktop                    | `-1440.png`       |

Every viewport passed document-level horizontal-overflow assertions. Desktop/tablet cases can scroll within their labeled table region. For each suffix, `screenshots/` contains `overview`, `cases`, `detail`, and `appointments` captures. Also inspected: `home.png`, `overview.png`, `cases.png`, `case-detail.png`, `conflict.png`, and `dark-settings.png`. The general overview preview uses 1440 × 1000. Full-page screenshot height can exceed viewport height.

## Performance measurements

`scripts/performance.mjs` recorded three production navigation samples per route/profile: local warm server, browser cache disabled, no network throttling, native desktop CPU and 4× mobile CPU throttling. Desktop was 1440 × 900; mobile was 390 × 844 with touch/mobile emulation. Medians from `performance-results.json`:

| Profile | Route                  | TTFB | Largest contentful paint | Layout shift |
| ------- | ---------------------- | ---- | ------------------------ | ------------ |
| Desktop | `/`                    | 5 ms | 392 ms                   | 0.000        |
| Desktop | `/app/willow/overview` | 7 ms | 260 ms                   | 0.029        |
| Desktop | `/app/willow/cases`    | 9 ms | 232 ms                   | 0.067        |
| Mobile  | `/`                    | 4 ms | 352 ms                   | 0.000        |
| Mobile  | `/app/willow/overview` | 8 ms | 904 ms                   | 0.064        |
| Mobile  | `/app/willow/cases`    | 8 ms | 756 ms                   | 0.123        |

These are local paint/navigation timings, not Lighthouse scores or a remote-deployment simulation. Lighthouse accessibility 90+ and performance 85+ remain unmeasured goals. Mobile cases' 0.123 layout shift remains an improvement opportunity during the loading-to-card transition; it exceeds the usual 0.1 good-CLS threshold. Measure again on the chosen host and actual devices before making performance claims.

## Remaining limits

- At the initial-build stage only SQLite was wired. The Neon adapter and successful hosted database verification are described above; public website deployment remains separate.
- Docker source is prepared but was not built; Docker was unavailable here.
- Installation reported 16 moderate development-tool advisories, primarily in the ESLint/minimatch chain. The production dependency audit reported zero. Forced incompatible tooling upgrades were not applied solely to suppress those advisories.
- The demo targets one persistent Node instance. Customer identity lifecycle, distributed abuse controls, real patient information, and clinical workflows remain outside scope.
- Browser coverage uses Chromium emulation rather than a multi-browser or physical-device lab.
