# Service Manager implementation handoff

**Local setup update:** API aliases were corrected and additive schema migrations
were subsequently applied to localhost development only. See
[local API fix](service-manager-local-api-fix.md) for current status and verification.
The migration statements below describe the original handoff and production
review requirements; production has not been migrated.

Implemented in the existing React/Express repository. No new application, stack,
dependency, wallet ledger, or dashboard table. No commits, pushes, deployment,
persistent database migrations, or customer-data changes were performed.
The pre-existing busController.js working-tree edit was left untouched.

## Delivered behavior

| Area | Result |
| --- | --- |
| Navigation/layout | Existing responsive portal shell, Lucide icons, collapsible persisted groups, profile/logout footer, purple active links |
| Global/In-House overview | Backend KPIs, UTC date ranges, revenue/status bars, actual issued coins, top services, pending follow-ups, recent orders/services/activity, retry/loading/empty states |
| Catalogue | Protected paginated reads including inactive records, category/service/variant create/edit/activate/deactivate, soft removal through inactive status, search/filter/sort, featured service setting, image preview/upload |
| Classification | NULL scope is explicitly unclassified; classify categories before services, require confirmation/reason, retain audit history; no inferred backfill |
| Pricing | Immediate base variant regular/selling price edits using decimal strings, backend validation, locked transactions, optimistic conflict detection, before/after history; historical orders unchanged |
| Rewards | Existing variant rules and backend preview, caps/whole-coin validation, adjustment/disable of existing enabled rules. New activation and reward-type changes blocked pending policy review |
| Documents | Scoped requirement list/add/edit, stable unique keys per service, mandatory/expiry flags, audit history. Changes blocked while service has active orders |
| Enquiries | Existing UI/APIs, scoped backend reads/detail/status changes, bundle-aware filtering, transactional status audit |
| Orders | Existing list/detail/UI. Scope checks reject out-of-workspace and mixed-scope parent detail access. Paid fulfilment sequence and atomic completion/reward/audit transaction for Service Managers |
| Cancellations | Existing review/refund logic retained. Scoped list/detail/decisions and transactional manager audit on approve/reject; original gateway recovery remains unchanged |
| Partner foundation | Independent routes with honest unavailable states. Legacy mock page URLs redirect to the appropriate real/foundation page |
| Reports/settings | Reports reuse real summary data; settings communicate actual access and pending policy capabilities |

Revenue means **paid completed service-item price**, grouped by order creation
date. It includes the redeemed portion of the price, excludes cancelled items,
and is not gateway receipts, net refund accounting, margin, or profit. Actual
SERVICE_REWARD wallet credits provide issued-coin counts. Catalogue totals and
the activity feed remain current independently of the selected date range.

## Files created

- `docs/service-manager-audit.md`, this handoff.
- `client/src/modules/service/serviceManager/CommercialPage.tsx`
- `client/src/modules/service/serviceManager/ServiceDocumentsPage.tsx`
- `client/src/modules/service/serviceManager/WorkspaceFoundationPage.tsx`
- `client/src/modules/service/serviceManager/shared/WorkspaceUI.tsx`
- `client/src/modules/service/serviceManager/shared/workspaceApi.ts`
- `client/src/modules/service/serviceManager/__tests__/ServiceDashboard.test.tsx`
- `server/app/service/v1/middlewares/managerScope.js`
- `server/app/service/v1/models/managerWorkspaceModel.js`
- `server/app/service/v1/routes/serviceManagerRoute.js`
- `server/app/service/v1/utils/managerPolicy.js`
- `server/app/service/v1/utils/managerOrderStatus.js`
- `server/app/service/v1/tests/managerWorkspace.test.js`
- `server/app/service/v1/tests/managerWorkspace.db.test.js`
- `server/app/service/v1/tests/managerRoute.test.js`
- `server/app/service/v1/tests/managerCancellationAudit.test.js`
- `server/scripts/inspect-service-manager-schema.js`
- `server/migrations/20261117_01_service_manager_workspace.sql`
- `server/migrations/20261117_02_service_order_schema_compatibility.sql`
- `server/migrations/checks/service_manager_pre_check.sql`

## Files modified

- Client `App.tsx`, `routes.ts`, ServiceLayout, ServiceSidebar,
  dashboard/pages/ServiceDashboard, serviceListings/pages/ServiceCatalogPage,
  serviceManager.css and shared products/inHouseServices/ServiceOrderView.
- Backend service/v1 controllers: serviceEnquiryController, serviceOrderController.
- Backend service/v1 models: serviceEnquiryModel, serviceOrderModel.
- Backend service/v1 routes: indexRoute, serviceCategoryRoute, serviceRoute,
  serviceVariantRoute, serviceEnquiryRoute, serviceOrderRoute.
- Backend controllers/orderController, routes/orderRoutes and package.json
  (`test:service-manager` script).

## API contract

All new paths start `/v1/service-manager`, authenticate through existing
cookie/Bearer/CSRF middleware, authorize service_manager/admin, and check migration
readiness. Mutations are rate limited by authenticated employee ID.

| Method/path | Behavior |
| --- | --- |
| GET `/dashboard/summary`, `/in-house/summary` | `{success,data:{metrics,performance,trend,top,recentOrders,recentEnquiries,recentServices,activity,definitions}}`; optional UTC from/to YYYY-MM-DD |
| GET `/catalog/:kind` | kind categories/services/variants; `{success,data:{rows,total,page,limit}}`; scope in_house/unclassified, search, status, sort, category_id/service_id |
| POST `/catalog/:kind` | JSON or multipart; verified fields, change reason, optional image; new records explicitly in_house |
| PATCH `/catalog/:kind/:id` | Full verified editor fields, reason and returned version token; classification also requires classify=in_house |
| PATCH `/pricing/:id` | Variant ID, original_price, price as decimal strings, version, reason; immediate future base quotes |
| PATCH `/reward-rules/:id` | Existing variant reward fields, mode, version, reason and existing-policy acknowledgment; new activation/type changes refused |
| POST `/reward-rules/preview` | Variant ID, existing-rule fields, sample wallet/requested coins. Existing calculator; not a checkout quote |
| GET `/audit-logs` | Paginated history, optional action/entity_type/entity_id |
| GET/POST `/services/:id/documents` | Requirements for explicitly classified service |
| PATCH `/services/:id/documents/:documentId` | Requirement edit; active-order lock and stable key |

Commercial and catalogue writes lock rows, reject stale versions, and persist
audit rows in the same transaction. Image bytes are re-encoded as WebP. Failed
database saves attempt cleanup of the newly uploaded object; old media is retained.

Legacy enquiry/order/cancellation URLs remain. Service Manager catalogue mutations
through old unscoped URLs now return 403 directing callers to the audited API.
This is intentional security tightening; update any additional internal consumers
using that role before rollout. Other roles retain their existing API behavior.
Classification is workspace-wide; there is no invented per-manager assignment.

## Database rollout and rollback

1. Review the audit, run `checks/service_manager_pre_check.sql`, back up the target
   schema, inspect deployment-specific enums/indexes and table types.
2. Review and apply migration 01 in a controlled environment. DDL auto-commits;
   script is one-time, not automatically rerunnable. It adds nullable scope,
   missing category metadata and the audit table/indexes. Existing rows stay NULL.
3. Review migration 02 ONLY if the existing order snapshot/flash-sale columns are
   absent. It does not reconstruct or change historical prices.
4. Reconcile wallet `SERVICE_REWARD` enum support and idempotency constraints with
   the deployed wallet migration. This is deliberately not auto-altered. Reward
   activation and rewarded completion reject incompatible schema atomically.
5. Classify records explicitly through Classification Review, categories first.
   Keep mixed/unknown records out of both workspaces until reviewed.
6. Validate real service quotes, document uploads, completion, refund recovery and
   authentication in staging. The session-only SQL fixture tests do not replace this.

Until migration 01 is reviewed/applied, new management APIs return actionable 503
and the UI shows an error/retry state instead of fabricated metrics.

Rollback application routes first. Export and retain audit history. Remove only
new columns/indexes after confirming no downstream references. Keep new order
snapshot columns if any new order populated them. Never drop existing business
tables or rewrite prices, wallet balances, rewards or refunds to roll back a UI.

## Validation results

| Command/check | Actual result |
| --- | --- |
| `node server/scripts/inspect-service-manager-schema.js` | Passed: read-only local schema/key inspection |
| Server `npm run test:service-manager` with SERVICE_MANAGER_DB_TEST=true | 33 passed, 0 failed; includes auth HTTP checks, cancellation audit regressions and actual MySQL TEMPORARY tables |
| Client targeted ServiceDashboard Vitest file | 4 passed |
| ESLint on all new/rewritten Service Manager React files | Passed |
| Client TypeScript `tsc -b` | Passed |
| Client `npm run build` | Passed, including final TypeScript and Vite production build |
| Server existing `npm test` | 381 passed, 3 skipped, 0 failed (before final optional cancellation audit addition) |
| Client full `vitest run` | 93 passed, 4 failed across unchanged notification/splash tests |
| Isolated notification sendButtons test file | 13 passed, 1 timeout; another full-run timeout passed in isolation |
| `git diff --check` | Passed |

The two deterministic full-client failures expect `Dynamic Splash Screens` and
`Push Notification Manager`; unchanged sidebars use `Dynamic splash screens` and
`Push notifications`. The other failures are 5-second sendButtons timeouts. These
unrelated modules/tests were not rewritten to make this feature's checks pass.
The backend suite emits existing Firebase credential/database diagnostic warnings;
passing unit tests do not verify live push delivery.

No browser/device screenshots, real R2 upload, real gateway refund, live wallet
issuance, or production integration testing was performed. No messages were sent
as part of Service Manager verification.

## Deliberately disabled / remaining work

Per the user's policy-review decision, keep new financial modes disabled: new
reward activations/type changes, conversion changes, inherited/stacked rules,
Direct RP price eligibility, scheduled prices and approval workflows. Partner
ownership/assignment/permissions, confidential costs, margins and commissions also
need approved requirements. There is no invented partner ledger or mock production
data. Existing immediate base-price edits remain supported.

Bulk price import/export, tax configuration, service gallery/code/fulfilment
metadata, versioned document requirements for active orders, enquiry assignment/
notes/follow-up scheduling, automated polling, and detailed net-revenue/refund
reconciliation were not implemented. Dashboard updates on load, filter and Refresh.
Existing shared enquiry list uses client-side filtering; order/cancellation flows
retain their existing pagination and financial implementation. Test actual legacy
refund concurrency/gateway recovery before production; it was not rewritten here.

Production readiness: **not ready for unattended rollout**. Review/apply schema,
classify catalogue, resolve wallet compatibility and policy decisions, and perform
staging browser/checkout/refund tests first. Work is saved locally and reviewable.
