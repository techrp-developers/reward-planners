# Service Manager P0 remediation — local review package

17 November 2026. Source of truth: `service-manager-audit.md` and read-only checks of local MariaDB 10.4.32, `rewardplanners_db`. Backend: localhost:5000; Vite: localhost:5173. Existing uncommitted work was preserved. No production access, commits, pushes, historical financial reconciliation or business classification was performed.

**Safe code fixes are implemented and tested locally. Production financial activation is not ready.** Migrations 03/04 remain review-only and have not been applied to the application database. Both financial activation flags default to false. The real-database tests applied those exact migration files only inside an isolated disposable schema.

## Findings and changes

| P0 | Confirmed cause | Implemented behavior | Approval/pending work |
| --- | --- | --- | --- |
| Customer pricing | Queries unconditionally joined missing `campaign_service_items`; `campaigns.module` and service redirect enum values were also absent | Detect schema capability; when no service campaign bindings table exists, use real CMS/base pricing. Reject partial installations rather than quietly ignoring persisted campaign bindings. Exact paise arithmetic for checkout, bundle splitting and percentage rewards | Review migration 03; classify existing campaigns separately. No existing campaign module was inferred |
| Wallet | Service reason codes absent from enum; weak SQL mode permits empty enum values; ignored financial writes could diverge from balances | Plain checked ledger inserts, stable non-NULL order references, scoped idempotency, existing unique index retained, transactionally coupled reward/status updates, strict activation/schema checks | Review migration 04; approve policy and ledger reconciliation separately. Settlement stays off |
| Addresses | 91 historical orders reference missing rows; original deletion/migration origin cannot be proven | Owned active address and active catalogue validation inside checkout transactions; common address deletion becomes soft deletion; purge skips accounts with service orders | Reconcile using authoritative historical evidence. No historical links changed and no order/address FK added |
| Refunds | Concurrent approval/retry/provider execution lacked a durable submission claim; wallet refund lookup was not customer/module-specific | Durable fenced claim/lease, immutable saved payment/amount used for submissions, uncertain-state quarantine after timeout/crash, provider reference reconciliation, transactionally scoped coin restoration | Review claim columns/unique keys in migration 04; provider sandbox verification and historical refund review before enabling execution |
| Classification | All five categories/eighteen services NULL; legacy variant-section writes lacked workspace checks | Admin-reviewed initial assignment endpoint, approval reference/version check, category/bundle consistency, immutable assigned scope; scoped legacy guards | Business approval for every assignment. Existing NULL values stay unchanged |

Campaign schema was recovered from `serviceOffers.js`, the campaign models/controllers and existing service campaign configuration tests. Mapping columns are campaign ID, service ID, variant ID and optional DECIMAL offer price, with unique campaign/variant membership and new-table relational constraints. Migration 03 preserves the six existing redirect values and appends `service`, `service_category`, `service_bundle`. Existing campaign rows retain NULL module; product behavior is not reclassified automatically.

## Wallet investigation and compatibility

The current enum contains exactly: `ORDER_REWARD`, `REFERRAL_BONUS`, `ADMIN_ADJUSTMENT`, `REDEEM`, `EXPIRY`, `ORDER_REFUND`, `SHIPMENT_REWARD_REFUND`, `ORDER_REWARD_REVERSAL`, `SHIPMENT_REWARD_REVERSAL`. Migration 04 preserves them and appends `SERVICE_REWARD`, `SERVICE_REDEEM`, and `SERVICE_REFUND`. The third namespace prevents a service restoration from colliding with an unrelated module's adjustment. It does not create another wallet or replace `uniq_wallet_order_reward(user_id,transaction_type,reason_code,reference_id)`.

| Existing transaction | Direction / coins | Service reference | Evidence / proposed interpretation only |
| --- | --- | --- | --- |
| 147 | debit / 10 | 105 | Title `Coins used for service`; matching service customer; candidate SERVICE_REDEEM |
| 151 | credit / 4 | 105 | Title `Coins earned from completed service`; matching service customer; candidate SERVICE_REWARD |
| 218 | credit / 100 | 111 | Same earning title; matching service customer; candidate SERVICE_REWARD |

These three empty reasons were not changed. A new matching operation is blocked for manual reconciliation so it cannot credit twice after the enum is repaired. The audit also found 403 historical NULL reference IDs; none were rewritten. New positive service ledger writes require stable positive references. Redemption records use the minimum saved child order ID for an existing unique parent reservation after validating the saved child redemption sum. Retry of an identical operation is idempotent; a different amount under the same key is a conflict.

`INSERT IGNORE` is removed from the service financial ledger path. Shared ecommerce helpers retain their own behavior; the service path no longer calls them. Balance, ledger and completion/cancellation changes use the caller's transaction and verify affected rows/warnings. Existing integer-coin policy remains a calculation compatibility rule, not a new business approval. `SERVICE_WALLET_SETTLEMENT_ENABLED` and `SERVICE_REFUND_EXECUTION_ENABLED` remain false by default; `.env.example` documents them. Existing reserved coins may still be released safely on a failed checkout without creating a new settlement.

## Refund behavior and limits

An approval locks the cancellation/order, checks paid status and saved prices, restores service coins under the correct customer and module namespace, and inserts the original-payment refund record in the same transaction. External submission is performed after commit using a durable `ready -> submitting` claim with a UUID fencing token and 120-second lease. Competing callers return processing. A persisted provider reference is fetched/reconciled instead of posted again. A timeout or expired submitting lease becomes `uncertain`; historical rows default to `review_required`. Neither state automatically resubmits. Stable receipts support tracing but are not treated as a provider idempotency guarantee.

Webhook reconciliation validates payment ID and exact integer paise against the saved refund before a terminal update. A webhook that wins the HTTP response race cannot be overwritten by the losing claimant. Existing provider references and refund records are retained. Cancellation responses preserve actionable 409/503 errors when policy or schema checks block execution.

The real MariaDB concurrency tests use a simulated provider adapter. **No live or gateway sandbox refund was executed.** Provider timeout and webhook races are covered against real durable database state, but gateway credentials, signature delivery and provider-side behavior need an approved sandbox exercise. Separate `external_service_*` / MPS refund code was not redesigned by this internal-customer-service remediation and needs its own review before extending these guarantees to that channel. This is an outstanding financial scope risk, not partner functionality.

## Migration and backup handoff

Files:

- `server/migrations/checks/service_manager_p0_pre_check.sql` — read-only version, schema, index, malformed-ledger, duplicate-refund, address and classification checks.
- `server/migrations/20261117_03_service_campaign_compatibility.sql` — minimal missing campaign schema/redirect additions.
- `server/migrations/20261117_04_service_financial_compatibility.sql` — enum extension, refund claim metadata and unique refund keys.

A private local backup was created at `server/files/service-manager-p0/backups/local-before-p0-2026-11-17T11-05-14-246Z.sql` (20,552,591 bytes). Dump exited successfully; a restore rehearsal has not been performed. Backup helper: `node scripts/backup-service-manager-p0.js` from `server`; credentials stay in the child environment and are not printed. The helper refuses production/non-local hosts. Sensitive backups and CSV reports are gitignored and must not be published.

Before any approved application-database migration:

1. Confirm the exact local/staging target and obtain explicit approval for the statements. Production is outside this execution scope.
2. Take a fresh backup, verify restore on a separate staging instance, and run the precheck SQL. MariaDB DDL auto-commits; wrapping these files in a transaction does not make them rollback-safe.
3. Compare enum definitions, integer signedness, engines, existing columns/tables and indexes to the audited schema. Preserve any additional deployed enum values. Skip existing additions after verifying their definitions; do not blindly rerun these one-time SQL files. Stop on unexpected or partial schemas.
4. Require zero duplicate order/refund-method and non-NULL provider-refund keys before adding unique indexes. Do not delete conflicting historical records to make DDL succeed. Review blank provider IDs as well.
5. Apply only absent approved additions in order, rerun checks and staged API/SQL tests. Keep settlement/execution flags false until policy, provider and historical-record review is complete.

Rollback guidance: turn the financial flags off and roll back the application first. Retain populated campaign bindings, added module values, service ledger reasons, claims and provider references. Do not narrow enums after service writes, drop populated tables/columns or remove the existing wallet unique index. Any later structural removal needs an export, dependency check and separate approval. No automatic data-down migration is supplied because that could destroy financial history.

## Actual HTTP verification

| Endpoint | Before (completed audit) | After (local live request) |
| --- | --- | --- |
| GET `/v1/service/all-services?limit=1` | 500: campaign_service_items missing | 200; real CMS/base pricing fallback |
| GET `/v1/service/details/1` | Missing schema affected common offer resolution; no separate baseline response claimed | 200 |
| GET `/v1/service-variant/find/1` | No separate baseline response claimed | 200 |
| GET `/api/crm/v1/service-manager/dashboard/summary` | 200 | 200 direct and Vite |
| GET `/api/crm/v1/service-manager/in-house/summary` | 200 | 200 direct and Vite |
| GET `/api/crm/v1/service-manager/catalog/categories` | 200 | 200 direct and Vite |
| GET `/api/crm/v1/service-manager/catalog/services` | 200 | 200 direct and Vite |
| GET `/api/crm/v1/service-manager/catalog/variants` | 200 | 200 direct and Vite |
| GET `/api/crm/v1/service-enquiry` | 200 | 200 direct and Vite |
| GET `/api/crm/v1/service-orders/admin-orders` | 200 | 200 direct and Vite |
| Anonymous manager summary | Auth required | 401 |
| Manager PATCH classification | New approval API | 403 |
| Manager POST legacy create-service | Guarded legacy API | 403 |

`node scripts/verify-service-manager-p0.js` wrote actual HTTP results to private `server/files/service-manager-p0/http-verification.json`. Public routes are unauthenticated; manager GETs use an existing verified local Service Manager token held in memory. Catalogue workspace rows are empty because existing scopes remain NULL, not because failed requests were converted to zeros. No live customer checkout, refund or wallet mutation was used as an API probe. Checkout and offer resolution were verified against real MariaDB fixtures through the actual controller/model below.

## Regression evidence

- `npm test` in server: **381 passed, 0 failed, 3 skipped** (384 tests). Includes shared ecommerce/payment regression suites. One CMS fixture initially lacked `execute`/schema metadata handling; its adapter now represents the missing-schema case and the rerun passed.
- `npm run test:service-manager`: **35 passed, 0 failed, 1 optional DB suite skipped**. Includes role/prefix enforcement and manager rejection from classification approval on both prefixes.
- `$env:RUN_SERVICE_P0_SQL_TESTS='1'; npm run test:service-p0`: **18 passed, 0 failed, 0 skipped** on real MariaDB/InnoDB. Creates a uniquely owned scratch schema, applies exact migration 03/04 SQL there and removes that schema in finally. The application database is never seeded or migrated by this suite.
- SQL cases: pre-migration CMS fallback; post-migration lowest offer 400.10 versus CMS 450; enum/index preservation and historical review default; empty-reason protection; concurrent redemption/no overdraft; idempotent consume/release; simultaneous completion/one credit; trigger-injected ledger failure rolls back status/balance; disabled settlement; concurrent cancellation approval/one customer-scoped restoration; refund claim exclusion; timeout quarantine; webhook race and mismatched amount rejection; expired-lease quarantine; classification approval constraints; wrong-owner/inactive-variant checkout rejection; actual checkout saves 400.10 without modifying a historical order.
- Live requests: all 14 manager GET checks, 3 public GETs and 3 rejected authorization probes passed on the running backend/proxy.
- `node scripts/report-service-manager-p0.js`: post-test order financial, wallet balance, ledger and service-scope count/checksum fingerprints equal the initial baseline. 91 missing-address orders and 3 invalid reasons remain unchanged.

Logs are private in `server/files/service-manager-p0/{backend-tests.log,manager-tests.log,p0-sql-tests.log}`. No new frontend UI changes were made in this remediation stage. TypeScript/build/lint results from previous stages are not represented as fresh checks here.

## Exact remediation file inventory

Runtime edits:

- `server/app/service/v1/utils/serviceOffers.js`
- `server/app/service/v1/utils/serviceRewards.js`
- `server/app/service/v1/utils/serviceMoney.js` (new)
- `server/app/service/v1/utils/checkoutGuards.js` (new)
- `server/app/service/v1/utils/managerOrderStatus.js` (existing uncommitted implementation updated)
- `server/app/service/v1/controllers/serviceCheckoutController.js`
- `server/app/service/v1/controllers/serviceOrderController.js`
- `server/app/service/v1/models/serviceCartModel.js`
- `server/app/service/v1/models/serviceOrderModel.js`
- `server/app/service/v1/models/serviceClassificationModel.js` (new)
- `server/app/service/v1/middlewares/managerScope.js` (existing uncommitted implementation updated)
- `server/app/service/v1/routes/serviceManagerRoute.js` (existing uncommitted implementation updated)
- `server/app/service/v1/routes/serviceVariantRoute.js`
- `server/app/common/models/addressModel.js`
- `server/controllers/orderController.js`
- `server/services/rewards/serviceWalletService.js`
- `server/services/rewards/serviceLedger.js` (new)
- `server/services/rewards/serviceRefundClaims.js` (new)
- `server/services/Razorpay/retryCron.js`
- `server/services/Todo/accountPurgeCron.js`
- `server/.env.example`
- `server/package.json`

Verification/review additions and test updates:

- `server/app/service/v1/tests/p0Safety.db.test.js` (new)
- `server/app/service/v1/tests/managerRoute.test.js`
- `server/app/service/v1/tests/managerWorkspace.test.js`
- `server/app/service/v1/tests/serviceOffers.test.js`
- `server/tests/contentMotion.test.js`
- `server/scripts/report-service-manager-p0.js` (new)
- `server/scripts/backup-service-manager-p0.js` (new)
- `server/scripts/verify-service-manager-p0.js` (new)
- The three migration/precheck files listed above
- This report, `docs/service-manager-p0-address-reconciliation.md`, and `docs/service-manager-p0-classification.md`

Other existing working-tree changes predate this stage, including the user's bus controller edit, and were preserved.

## Outstanding readiness gates

Obtain explicit migration approval; restore-test the backup; review schema differences on the intended target; approve coin policy and service classification; investigate three malformed ledger reasons without altering historical balances; reconcile 91 missing historical addresses from evidence; perform gateway sandbox refund/webhook checks; review MPS/external-channel refunds separately; plan immutable historical address snapshots. No production readiness claim is made while these remain open. Dashboard and Partner Services expansion should wait for the corresponding approvals and financial acceptance checks.
