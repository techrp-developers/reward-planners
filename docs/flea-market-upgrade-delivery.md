# Flea Market upgrade delivery — first implementation bundle

This is an incremental implementation, not completion of all phases A–J. No migration was applied to the configured business database. Temporary schemas used by integration tests were deleted after execution.

## Phase status

| Phase | Inspected/reused | Implemented in this bundle | Remaining |
|---|---|---|---|
| A | Routes, services/models, middleware, migration history, shared auth/rewards, React screens, scripts, live DDL and timezone | Audit and schema snapshot | Broader gateway/accounting contract review |
| B | vendors/eusers/catalogue and persistent pools | Event participants; external vendor creation/reuse; private quick-created products; ownership checks; locked event reservations; history-preserving release/deactivation | Reservation quantity editing; richer external onboarding UI |
| C | Existing schedule service/model and form/cards | Transaction-safe same-location/date checks; preserved status transitions; atomic unused-reservation release; event assignments panel and counts; explicit configurable local offset | Financial reconciliation close gate once pending payments/refunds exist |
| D | invoices/items, pool logs, reporting models | Authenticated GET /dashboard/summary; separate invoice/item/reservation/payment aggregates; company/event/date validation; trend/vendors/invoices/alerts/payment sections | Refund-adjusted totals when refund lifecycle is implemented |
| E | Shared API client, TanStack Query, portal styles | Replaced all mock dashboard data; filters/charts/KPIs/error/retry/empty states; query invalidation after mutations | Browser end-to-end validation after reviewed migration deployment |
| F | Existing checkout/idempotency; unrelated Razorpay integrations | Cashier-confirmed cash with actual amount; explicitly configured manual external card/UPI; per-vendor recipients/audit; key/session/cart/event/operator binding; failed-attempt status recovery | Trusted provider orders/webhooks; pending-payment holds, expiry, reconciliation and crash recovery; payment finalization is currently a synchronous transaction |
| G | Reward rules, wallet locking, vendor invoice split | Selected event/company/location/time; assigned products; locked quantities; backend pricing/points; OTP gate; wallet debit once; vendor invoices once; combined receipt and receipt API | Provider payment state machine and financial policy configuration |
| H | Existing return-to-vendor operation | Kept separate and unchanged in purpose; protected active reservations against stock reduction | Customer refunds/returns, settlement ledger, commission/funding/issuer/tax policy UI are NOT implemented |
| I | Existing authenticateToken/authorizeRoles and CSRF/session refresh | Server manager role gate on module routes; manager-owned customer sessions; invoice source/customer/location checks; operator IDs on sales/top-up/damage/adjustment | Per-manager company ACLs and separate cashier/settlement privileges need an explicit access model |
| J | Existing npm scripts | Unit tests and isolated real-MySQL tests; existing server suite; client build/type check; targeted lint | Provider/refund/settlement tests and browser E2E remain unimplemented |

## Migration

`server/flea-market/migrations/20261016_01_event_assignments.sql`

Creates only the missing event/vendor/product associations and bookkeeping: flea_market_event_vendors, flea_market_event_products, flea_market_session_managers, flea_market_checkout_bindings, flea_market_payments. Uses actual target ID signedness, session collation and generated-stock semantics. Existing invoices, catalogue, vendors, pools, stock logs and rewards are untouched. Verified the CREATE TABLE IF NOT EXISTS definitions in a scratch schema. The snapshot of historical invoices 34–36 remains in the database audit document; no application writes were made to those records.

Apply this reviewed migration to the intended deployment database before deploying the new backend/frontend together. Do not run it against another schema without checking its referenced ID types/collations. Historical invoices are not backfilled with invented assignments or payments. Existing customer billing sessions must be selected/verified again because they have no manager ownership binding.

## API changes

- Manager authentication and role authorization on existing Flea Market routes (health remains public).
- GET /dashboard/summary?companyId=&scheduleId=&fromDate=&toDate= (event-date filters).
- GET/POST /schedules/:scheduleId/manage/vendors.
- PATCH/DELETE /schedules/:scheduleId/manage/vendors/:vendorId (configure collection/deactivate).
- POST /schedules/:scheduleId/manage/external-vendors.
- GET/POST /schedules/:scheduleId/manage/products.
- DELETE /schedules/:scheduleId/manage/products/:assignmentId (release outstanding reservation).
- Billing product search, scan and reward eligibility require X-Location-Id AND X-Schedule-Id and return assigned inventory/prices only.
- POST /checkout now requires scheduleId and payment {method, amount, confirmed, reference?}, authenticated manager, owned customer session, and Idempotency-Key. The actual amount must equal backend-recalculated net total. Cash confirmation is an authorized cashier declaration, not gateway verification.
- GET /checkout/:checkoutId/status is manager scoped; only failed/not-started attempts permit starting a fresh edited bill.
- GET /checkout/:checkoutId/receipt returns invoice references and separately recorded payment collections for that manager.

## Configuration and policy boundaries

- FLEA_MARKET_TIMEZONE_OFFSET defaults to +05:30, matching the audited IST database and existing client operations. This fixed-offset implementation does not yet support per-location IANA/DST timezones.
- FLEA_MARKET_LOW_STOCK_THRESHOLD defaults to 5 units.
- FLEA_MARKET_ALLOW_MANUAL_ELECTRONIC is disabled unless exactly true. If enabled, require an actual transaction reference and record verification_source=manual_external, never provider. It is not a substitute for the pending provider integration.
- Every event/vendor collection_model starts unconfigured unless explicitly chosen; billing is blocked until configured. Reward Planners and direct vendor collections remain distinguishable in payment records.
- Commission and discount_funder columns remain unconfigured. No vendor payable amount is invented, and coin redemption is not automatically treated as a vendor-funded discount.
- Manager roles currently have organization-wide access to active companies; tenant-specific grants and distinct cashier permissions are not inferred from nonexistent account mappings.
- Reservations conservatively consume unreserved pool inventory across all open assignments; sequential future events do not reuse the same physical units speculatively.
- A process crash after claiming an idempotency key can still require operator reconciliation; automatic lease takeover is deliberately not implemented without durable payment/order recovery.

## Validation executed

- Existing server suite plus new policy tests: **74 passed, 0 failed**.
- Dedicated unit + isolated MySQL integration tests: **19 passed, 0 failed**.
- Integration tests copied table definitions only into a generated fm_test_* schema, created synthetic fixtures, applied the migration there, exercised transactions/concurrency, and removed only that test schema.
- Cases include concurrent reservations; schedule conflict races; external vendor reuse; unassigned product rejection; OTP enforcement; competing checkouts and one wallet debit; idempotent replay/mismatch; multi-vendor invoices and separate collectors; historical generated invoice versus real collection totals; closing releases; role and session ownership rejection.
- Client production build (TypeScript + Vite): passed.
- All Flea Market JavaScript syntax checks: passed.
- Targeted new/rewritten frontend files: lint passed.
- Full client lint: failed with **133 errors / 18 warnings**. Compared touched legacy components to HEAD: AllocationsTable retains the same 7 static-component errors, BillingPage retains the same 1 set-state-in-effect error, InvoiceView has zero errors. No claim that repository-wide lint passes.
- Tests used the installed Node v22.23.1 binary because the system Homebrew Node executable currently references a missing simdjson dylib. No system tooling was changed.

## Exact implementation files

- `client/src/modules/flea_market/api/fleaMarketCheckoutApi.ts`
- `client/src/modules/flea_market/api/fleaMarketClient.ts`
- `client/src/modules/flea_market/api/fleaMarketDashboardApi.ts`
- `client/src/modules/flea_market/api/fleaMarketEventApi.ts`
- `client/src/modules/flea_market/api/fleaMarketReportsApi.ts`
- `client/src/modules/flea_market/component/allocations/AllocationsTable.tsx`
- `client/src/modules/flea_market/component/allocations/StockPage.tsx`
- `client/src/modules/flea_market/component/billing/BillingPage.tsx`
- `client/src/modules/flea_market/component/billing/InvoiceView.tsx`
- `client/src/modules/flea_market/component/invoices/InvoiceDetailPage.tsx`
- `client/src/modules/flea_market/component/reports/PurchaseHistoryPage.tsx`
- `client/src/modules/flea_market/component/reports/VendorSalesSummaryCards.tsx`
- `client/src/modules/flea_market/component/schedule/EventAssignmentsPanel.tsx`
- `client/src/modules/flea_market/component/schedule/SchedulePage.tsx`
- `client/src/modules/flea_market/dashboard/FleaMarketDashboard.tsx`
- `server/flea-market/controllers/checkoutController.js`
- `server/flea-market/controllers/customerController.js`
- `server/flea-market/controllers/invoiceController.js`
- `server/flea-market/controllers/poolStockController.js`
- `server/flea-market/controllers/productController.js`
- `server/flea-market/controllers/scanController.js`
- `server/flea-market/controllers/scheduleController.js`
- `server/flea-market/middlewares/requireFleaMarketLocation.js`
- `server/flea-market/middlewares/requireFleaMarketSession.js`
- `server/flea-market/migrations/20261016_01_event_assignments.sql`
- `server/flea-market/models/checkoutModel.js`
- `server/flea-market/models/productModel.js`
- `server/flea-market/models/scheduleModel.js`
- `server/flea-market/routes/checkoutRoute.js`
- `server/flea-market/routes/customerRoute.js`
- `server/flea-market/routes/dashboardRoute.js`
- `server/flea-market/routes/eventAssignmentRoute.js`
- `server/flea-market/routes/indexRoute.js`
- `server/flea-market/routes/poolStockRoute.js`
- `server/flea-market/routes/productRoute.js`
- `server/flea-market/routes/rewardRuleRoute.js`
- `server/flea-market/routes/scheduleRoute.js`
- `server/flea-market/services/checkoutService.js`
- `server/flea-market/services/dashboardService.js`
- `server/flea-market/services/eventAssignmentService.js`
- `server/flea-market/services/poolStockService.js`
- `server/flea-market/services/scheduleService.js`
- `server/flea-market/tests/checkoutPolicy.test.js`
- `server/flea-market/tests/eventWorkflow.integration.test.js`
- `server/flea-market/utils/checkoutPolicy.js`
- `server/package.json`
