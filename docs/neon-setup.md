# Neon Free setup

The application now supports Neon through `@neondatabase/serverless`. `DATABASE_URL` selects the hosted PostgreSQL adapter; leaving it empty preserves the existing local SQLite development database. Existing local demo records are not deleted or uploaded automatically.

## Account connection

Connected November 2, 2026 to the user-created, Vercel-managed project **neon-indigo-zebra** (`billowing-morning-78982436`), branch **main**, database **neondb**, in **AWS us-east-1**. The organization is on **Free**, with compute minimum and maximum both 0.25 CU. No paid upgrade was requested. [Open the project](https://console.neon.tech/app/projects/billowing-morning-78982436).

The pooled application URL and direct migration URL are stored in the ignored `.env.local`; the existing session secret was preserved. The schema migration and idempotent synthetic seed succeeded against hosted Neon. Default Neon Auth tables were left intact. Never paste the database password or full connection URL into source, GitHub, a screenshot, or this document.

## Connect the application

1. In Neon, use **Connect**, select the database and role, and enable **Connection pooling**.
2. Store the pooled `postgresql://…` URL as `DATABASE_URL` and the direct URL as `DATABASE_URL_UNPOOLED` in the ignored `.env.local`. Keep their SSL settings. Do not prefix either variable with `NEXT_PUBLIC_`. Migration tooling prefers the direct URL.
3. Keep `SESSION_SECRET` set to a persistent random secret of at least 32 characters. Set `APP_ORIGIN` to the app's exact origin.
4. Run:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

`db:migrate` applies the executable PostgreSQL schema, including `btree_gist` and the appointment exclusion constraint. It preserves existing records and serializes concurrent migration attempts with a transaction advisory lock. `db:seed` is idempotent for its named fixture. Browser demo entry creates its own isolated workspace instead of sharing the CLI fixture.

For Vercel, set `DATABASE_URL`, `SESSION_SECRET`, and `APP_ORIGIN` as server environment variables. Keep `DATABASE_URL_UNPOOLED` available to migration tooling. Apply the migration before the first hosted demo request. A Vercel process without `DATABASE_URL` fails explicitly rather than silently writing to an ephemeral SQLite file.

The website is now deployed at [health-care-kim.vercel.app](https://health-care-kim.vercel.app/), Vercel project `health-care-kim`, with Node.js 24.x. The Neon integration supplies both database connection variables. Production has a dedicated session Secret and `APP_ORIGIN=https://health-care-kim.vercel.app`. Database schema initialization preceded deployment; `npm run build` does not migrate or seed automatically. Preview session/origin configuration and database isolation require separate setup.

## Free-plan resource behavior

- Pool size is limited to three connections per Node instance; idle connections are released after one second.
- The app does not ping the database to keep it awake. A first request after an idle period may take longer.
- Demo records are generated in batches inside one transaction. Creating 450 cases does not require thousands of individual network round trips.
- Workspaces expire after 24 hours, are cleaned on demo entry or `npm run db:cleanup`, and are capped at 100 active workspaces. Creation uses a transaction advisory lock so concurrent entries cannot bypass the cap.
- There are no real patient uploads or stored images in the database. Screenshots are repository artifacts.

These settings aim to keep a small demo within free usage; they do not override provider quotas or guarantee unlimited traffic. Check the [current Neon Free limits](https://neon.com/pricing) and usage dashboard. Do not upgrade automatically if a free quota is reached.

## Validation

```sh
npm test
npm run test:postgres
npm run typecheck
npm run lint
npm run build
```

The PostgreSQL test command runs the real PostgreSQL engine in PGlite with `btree_gist`; it does not connect to or modify the hosted account. SQLite tests use separate processes to check competing writes. PGlite tests check competing asynchronous requests in its single embedded engine.

Hosted verification first passed six browser scenarios at `http://127.0.0.1:3001`: demo entry through assignment/status/audit/refresh/clinic isolation, API roles/persona switching, appointment creation/conflict/reschedule/cancellation, stale-edit recovery, reset isolation, and competing HTTP edits/bookings. Concurrent transactions over separate pooled Neon connections produced exactly one success and one HTTP 409 for each competing pair. Repeating the seed preserved the same fixture.

After deployment, the same six workflows passed against the public Vercel origin in **27.6 seconds**. Vercel reported the production deployment READY. See [verification results](verification.md) for the exact deployment and the boundary between local, hosted-database, and public-site checks.
