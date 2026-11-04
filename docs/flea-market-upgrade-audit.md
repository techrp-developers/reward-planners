# Flea Market upgrade audit

## Phase A — inspected before implementation

Reviewed the existing module routes, controllers, services, SQL models, migrations, authentication/session/CSRF middleware, frontend API client, schedule/stock/billing screens, dashboard, report queries, and package scripts. Live SHOW CREATE TABLE definitions and MySQL timezone are recorded in flea-market-upgrade-database-audit.md.

Reuse: eusers manager authentication; companies/locations/schedules; vendors and catalogue; persistent vendor stock pools; reward rules/wallet transactions; vendor invoices and invoice items; TanStack Query and shared API client.

Gaps:
- No equivalent event-vendor/product reservation tables exist in the target database.
- Billing searches global pools; checkout guesses today's event from location and selects a pool by variant alone.
- Master stock is transferred at top-up, so checkout must only move pooled stock.
- Schedule creation checks conflicts outside a transaction; status transitions are also susceptible to races.
- Customer sessions are not bound to the manager login; manager routes lack role authentication.
- Completed idempotency keys can disclose/replay another session's invoices; no cart/event binding; validation before the try block can strand processing keys.
- Payment mode exists only in the UI. Generated invoices are not verified collections.
- Razorpay exists for other business modules; its order/payment records are not tied to Flea Market checkout. Reusing unrelated payment IDs is unsafe.
- Dashboard is mocked. Report aggregates must keep invoice, item, payment and reservation totals separate.
- Customer refunds and vendor settlements need their own accounting lifecycle; return-to-vendor inventory operations are not customer refunds.

Database session/global timezone is SYSTEM and system timezone IST (+05:30). New event-time checks must explicitly use the configured local offset instead of depending on the host clock.

Invoices 34, 35 and 36 exist, source flea_market, status generated. Preserve them without fabricating payments or assignments.

## Delivery/deployment boundaries

Additive migrations are prepared for review, not silently applied to the connected database. Existing historical records must not be backfilled as paid. No commission, settlement funding, tax or invoice issuer policy is inferred. Electronic manual confirmation must be labelled manual; provider verification needs a trusted provider adapter.

Existing verification commands: server npm test; client npm run build and npm run lint. Financial/concurrency behavior additionally needs isolated database integration tests; never exercise destructive fixtures against the connected business database.
