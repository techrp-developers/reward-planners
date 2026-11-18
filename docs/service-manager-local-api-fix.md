# Local service API routing fix

The React API client uses `/api/crm`, and Vite preserves that prefix when forwarding
to localhost:5000. The service router had only been mounted at `/v1`, which made
requests such as `/api/crm/v1/service-manager/catalog/categories` return 404.

`server/routes/mountServiceRoutes.js`, called by `server/app.js`, now mounts the
same router at `/api/crm/v1` and `/v1`. Existing customer API URLs continue working;
no frontend environment switch or proxy rewrite is required. Local nodemon reloaded
the running backend after the route change.

Authenticated verification then exposed missing workspace schema (503). Applied
the reviewed additive migrations to the verified **localhost development database**
using `node scripts/migrate-service-manager-local.js --apply`:

- Category/service scope, missing category metadata, and workspace indexes.
- Manager audit table with employee foreign key.
- Nullable order flash-sale reference and original-price snapshot columns already
  required by existing order queries.

No production migration, record classification, historical price backfill, wallet
change, or new financial-mode activation was performed. This supersedes the earlier
handoff's statement that no persistent local migration had been applied.

The local migration runner checks localhost and non-production mode, previews by
default, and skips columns/indexes already present. It is never run by API startup.
The original SQL files remain one-time scripts; use the runner for local retries.

`node scripts/check-service-manager-local.js` verified HTTP 200 for:

- localhost:5000 `/api/crm/v1/service-manager/catalog/categories`
- localhost:5000 `/api/crm/v1/service-manager/in-house/summary`
- localhost:5000 `/api/crm/v1/service-orders/admin-orders`
- localhost:5000 `/v1/service-manager/in-house/summary`
- localhost:5173 `/api/crm/v1/service-manager/catalog/categories` (Vite proxy)
- localhost:5173 `/api/crm/v1/service-manager/in-house/summary` (Vite proxy)
- localhost:5173 `/api/crm/v1/service-orders/admin-orders` (Vite proxy)

The diagnostic only reads data, uses the existing verified manager account, keeps
its diagnostic Bearer token in memory, and prints no token or customer details.

Unclassified records are intentionally absent from In-House lists. Review categories,
then services through `/crm/service/classification`. This is separate from API
reachability; do not automatically assume every legacy service belongs In-House.

Regression coverage: `tests/serviceRouteMount.test.js` exercises CRM and legacy
paths, query strings, order/enquiry/variant routes. The protected manager-route
tests also exercise the exact CRM URLs reported by the user, including auth and
missing-schema handling. Both tests passed (7 assertions/subtests reported).
The complete service test command passed with 34 tests and one optional SQL test
skipped. A second migration preview confirmed zero pending additive statements.
