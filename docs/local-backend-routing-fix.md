# Local backend routing and cron repair

Verified 2026-10-16. No migration was applied to rewardplanners_db. Backend remains running on port 5057 with local scheduled jobs and the WhatsApp worker explicitly disabled for verification.

## Root causes and verified mounts

| Request formerly returning 404 | Exact cause | Fixed Express registration |
|---|---|---|
| /api/crm/health | Public Flea Market health router mounted at / only | /api/crm + /health |
| /api/crm/companies | CRM router had /company (singular); Flea Market /companies existed only at root | /api/crm + /companies |
| /api/crm/schedules | Flea Market /schedules existed only at root | /api/crm + /schedules |
| /api/crm/dashboard/summary | New dashboard router was registered inside Flea Market, but its parent was mounted only at root | /api/crm + /dashboard + /summary |

server/package.json starts node app.js; that is the active Express entry point. The main CRM router does not supply these Flea Market paths. Vite preserves /api/crm and proxies to localhost:5057; the client base /api/crm was already correct and was not changed. No proxy rewrite or duplicate prefix is needed. Both modules now share a router mounted at /api/crm; legacy root aliases remain. The 404 fallback runs after these mounts. Public health stays unauthenticated; manager routes retain authenticateToken/authorizeRoles and CSRF checks. CORS now permits X-Schedule-Id, which billing already sends.

The original Node app.js process was a plain process started hours before the edits; it was not a reloading nodemon child. Its cwd matched this server directory. Restarted that local process to load the changes. Verified Express and Vite paths after restart; no production process was restarted.

## Actual running-server results

Identical results through Express (5057) and Vite (5173):

| Path | Anonymous | flea_market_manager | Other verified role |
|---|---:|---:|---:|
| /api/crm/health | 200 | 200 | 200 |
| /api/crm/companies | 401 | 200 | 403 |
| /api/crm/schedules | 401 | 200 | 403 |
| /api/crm/dashboard/summary | 401 | 500: missing schema | 403 |

See local-backend-route-verification.json. The dashboard's remaining 500 is distinct from the repaired route 404: the currently selected business database has none of the five new tables. We did not mask that failure with mock data or bypass authentication.

## Authentication

No change to the existing refresh/security algorithm was needed. An expired access cookie returning 401, followed by refresh 200 and retried /auth/me 200, is the expected refresh path. The shared frontend client already retries the original request once and coalesces concurrent refreshes. Flea Market uses that same client.

Real HTTP tests with synthetic staging accounts exercised login, deliberately expired access cookie, refresh rotation, /auth/me, subsequent protected requests, anonymous 401, wrong-role 403, and rejected cookie-authenticated POST without CSRF (403). All passed. No business login credentials or tokens are stored in the verification artifact.

## Additional workflow defect found

Vendor search returned ER_WRONG_ARGUMENTS (Incorrect arguments to mysqld_stmt_execute) at LIMIT ? on the installed MySQL/mysql2 combination. Reproduced through real HTTP against staging. The same numeric prepared-statement pagination pattern was present in customer search, catalogue search, All Products pagination, and the legacy pool search. These calls now use mysql2 query() with escaped value placeholders; request data is not concatenated into SQL. Vendor selection, customer search, product creation, stock top-up, assignment and billing search/scan passed afterward.

## Database requirements and migration safety

Read SHOW CREATE TABLE from the configured database. Confirmed these are absent:

- flea_market_event_vendors
- flea_market_event_products
- flea_market_session_managers
- flea_market_checkout_bindings
- flea_market_payments
- busbooking_refunds

Also confirmed missing busbooking_orders.booking_error, busbooking_orders.booking_attempted_at and busbooking_cancellations.refund_amount. Current busbooking_orders.status lacks booking_in_progress and booking_review.

Required migration files:

1. server/flea-market/migrations/20261016_01_event_assignments.sql (previously prepared).
2. server/migrations/20261016_02_busbooking_reconciliation.sql (new, source-derived repair).

The existing server/migrations/20260926_busbooking_production_safety.sql supplies the cancellation table and Razorpay module enum, but does NOT supply the refund table or booking reconciliation columns. No matching refund/booking-state migration was found elsewhere in this repository. The new migration documents those gaps; refund fields/statuses come from existing refundService.js reads/writes, booking fields/statuses from bookingService.js, and FK types from the inspected order/cancellation definitions. It does not create refunds, payments or stock history.

Integration tests created a generated fm_test_* staging schema, copied table definitions from the intended database, copied invoices 34–36 into staging, applied both migrations there, and compared all copied invoice fields before/after. They then used synthetic fixtures for workflows and deleted only the generated staging database. The source invoices remain present with source=flea_market and invoice_status=generated. They were not declared paid.

Do not run these migration files automatically against rewardplanners_db or production. Review the exact target DDL first. The Bus Booking ALTER statements are a once-only migration for the inspected old schema, not a blindly repeatable repair for arbitrary partially upgraded schemas. MySQL DDL is not transactionally rolled back; use a copied staging database and a deployment backup/review process.

## Cron failures and missed execution warning

Bus reconciliation is imported at startup and runs every minute. Its escalation query selects booking_error and filters booking_attempted_at; the configured database predates both. Refund retry selects busbooking_refunds, which does not exist. Those are code/schema version mismatches, not Flea Market routing failures.

Before this repair RUN_SCHEDULED_JOBS only gated shipment/status cleanup. Eleven other cron modules, including Bus Booking, still loaded regardless. Local development now requires ENABLE_LOCAL_SCHEDULED_JOBS=true and RUN_SCHEDULED_JOBS not false. The switch applies only to NODE_ENV=development/test. Production/other environments retain registration; the pre-existing RUN_SCHEDULED_JOBS exception for shipment/status remains. Production reconciliation was not globally disabled.

Bus reconciliation retains its in-process overlap guard and now also uses node-cron noOverlap with a named task. It reports successful heartbeats only when all steps succeed, and warns on runs longer than one minute. Todo reminders also use noOverlap, and their idle checking message requires diagnostics. Multi-process leader election is not implemented; this change does not claim distributed scheduler locking.

Inspected the installed node-cron runner: it emits the generic blocking-I/O/high-CPU warning whenever the wall-clock tick is late, without identifying the cause. Existing logs include long timestamp gaps; laptop sleep/process suspension is a plausible inference, not a proven diagnosis. A short live process sample did not show sustained high CPU. Scheduler SQL/provider calls inspected are asynchronous; no specific synchronous hot path was proven. Do not conflate awaited slow I/O/overlap with measured event-loop blocking.

SCHEDULER_DIAGNOSTICS=true enables monitorEventLoopDelay samples and wall-clock drift warnings. The timer is unref'd and stopped on shutdown; default is off. Use these measurements during a reproduction to distinguish real lag from host suspension. No warning was suppressed or relabelled as definitively fixed CPU behavior.

Local verification startup used:

```sh
START_WA_WORKER=false ENABLE_LOCAL_SCHEDULED_JOBS=false npm start
```

The system Homebrew node binary has an unrelated missing simdjson dependency; verification used the installed Node v22.23.1 binary. No system installation was modified.

## Changed files

- server/app.js — shared mount, scheduler registration, CORS header, accurate startup URL, diagnostics shutdown.
- server/routes/mountCrmRoutes.js — one shared CRM prefix and legacy aliases.
- server/config/scheduledJobs.js — development-only scheduler opt-in; preserved production behavior.
- server/services/BusBooking/reconcileCron.js — named non-overlapping task.
- server/services/BusBooking/reconcileRunner.js — testable overlap/heartbeat/duration behavior.
- server/services/schedulerDiagnostics.js — optional event-loop measurements.
- server/services/Todo/todoReminderCron.js — overlap protection and quieter idle logging.
- server/flea-market/models/vendorModel.js, customerModel.js, productModel.js, poolStockModel.js — pagination compatibility fix.
- server/migrations/20261016_02_busbooking_reconciliation.sql — unapplied repair migration.
- server/tests/scheduledJobs.test.js — scheduler regression tests.
- server/flea-market/tests/eventWorkflow.integration.test.js — copied-history, migration, HTTP auth/refresh/route/workflow tests.
- server/package.json — scheduler tests included in npm test.

Focused implementation diff: local-backend-routing-fix.patch. Earlier Flea Market upgrade changes and the user's package-lock modifications remain intact. Frontend API base, proxy target and auth policy were not arbitrarily changed.

## Tests executed

- npm test (backend): 77 passed, 0 failed.
- Copied-staging integration test: 17 passed, 0 failed, including actual HTTP requests.
- npm run build (frontend, TypeScript + Vite): passed.
- git diff --check: passed.
- Staging HTTP workflows: login/refresh; dashboard; companies; schedules; event creation; existing/external vendor selection; catalogue/customer search; quick product creation; stock loading/top-up; event assignment; billing product search/scan; CSRF denial.
- Bus migration: existing escalation/refund SQL and all four reconciliation functions executed on empty staging booking/refund tables without real provider calls.
- Running-process smoke test: Express and Vite responses recorded separately in JSON.

## Remaining blockers

1. The real local process still uses DB_NAME=rewardplanners_db by design. Dashboard, event assignments and manager-owned billing sessions require a reviewed migrated staging copy and an intentional local DB_NAME change. No migration was applied to the protected schema.
2. Bus reconciliation should remain off locally until the reviewed repair migration is applied to the chosen staging copy. The business schema is still incompatible; disabling local scheduling does not repair its tables.
3. Browser clicks, responsive layouts and billing navigation were not exercised by browser automation. The frontend builds, and their backend contracts were exercised through real HTTP. There is no claim of browser end-to-end completion.
4. The specific historical missed-tick cause remains unproven until reproduced with diagnostics enabled. Provider/refund live behavior was deliberately not exercised against real payments.
