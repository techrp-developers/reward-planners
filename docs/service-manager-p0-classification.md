# Service classification review list

Update, 28 November 2026: the business owner confirmed “All existing services are
In-House.” Applied the 5 categories and 18 services listed below to the local
development database using `scripts/classify-service-manager-local.js --apply
--actor=35`. The repair reused classification validation, saved 23 audit entries,
and committed as one transaction. A subsequent preview found zero pending changes.
The NULL scopes below describe the original investigation, not the current local state.

Cookie-authenticated checks against both the backend and Vite proxy returned HTTP
200: 5 categories, 18 services, 25 variants, 26 enquiries, 86 parent orders, 9
cancellations, and 23 audit entries. Dashboard totals include 123 individual order
items. Pricing and rewards use the verified variants endpoint. Partner tabs remain
unconfigured. No production database was changed. Service Manager tests: 35 passed,
one optional database test skipped.

Read from the local database on 17 November 2026. All entries below retain `service_scope = NULL`. No business assignments were inferred or applied.

| Category ID | Category | Current scope |
| --- | --- | --- |
| 1 | Tax Filing | NULL |
| 2 | Insurance | NULL |
| 3 | Government Documents | NULL |
| 4 | Mutual Fund | NULL |
| 5 | MSEB Name Change | NULL |

| Service ID | Service | Category ID | Current scope |
| --- | --- | --- | --- |
| 1 | PAN Card Services | 3 | NULL |
| 2 | Aadhaar Update & Correction | 3 | NULL |
| 3 | Two-Wheeler Driving License | 3 | NULL |
| 4 | Four-Wheeler Driving License | 3 | NULL |
| 5 | Two & Four-Wheeler License | 3 | NULL |
| 6 | Passport | 3 | NULL |
| 7 | Domicile Certificate | 3 | NULL |
| 8 | Marriage Certificate | 3 | NULL |
| 9 | Rent Agreement | 3 | NULL |
| 10 | Car Insurance | 2 | NULL |
| 11 | Two-Wheeler Insurance Assistance | 2 | NULL |
| 12 | Health Insurance | 2 | NULL |
| 13 | Income Tax Return Filing | 1 | NULL |
| 14 | Property Tax Name Change | 1 | NULL |
| 15 | Reply to Income Tax Notice | 1 | NULL |
| 16 | MSEB Name Change | 5 | NULL |
| 18 | Super Top-up | 2 | NULL |
| 19 | Personal Accident | 2 | NULL |

Service 17 is absent; no row was recreated. Mutual Fund currently has no service in this list. Private machine-readable exports are `server/files/service-manager-p0/classification-categories.csv` and `classification-services.csv`.

The admin-only `PATCH /api/crm/v1/service-manager/classification/:kind/:id` supports a reviewed initial assignment to `in_house` or `partner` (`kind` is `categories` or `services`). It requires `reason`, `review_reference`, and `version` matching the serialized current row. The category must be approved first, the service scope must match its category, and existing assigned bundle members cannot conflict. The transaction locks the record and writes an audit entry. An assigned scope cannot be reassigned through this endpoint. It does not update historical order prices, reward snapshots, customer IDs or order ownership fields.

Do not call the endpoint for existing records until the business owner approves an explicit assignment list. Its successful-write tests ran only against disposable fixtures. Live Service Manager classification attempts were rejected with 403. Legacy catalogue write APIs reject Service Manager requests with 403; legacy variant-section writes now check In-House ownership and use the correct section parameter.

Historical workspace visibility still follows the service's approved initial classification. Before applying an assignment, the reviewer must consider the associated orders and bundle membership. Financial settlement remains separately disabled. Partner fulfilment development remains a later stage; the existing `external_service_*` tables represent client sales channels and do not establish partner fulfilment ownership.
