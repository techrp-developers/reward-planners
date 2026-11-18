# Service Manager architecture audit and implementation plan

Audit date: 2026-11-17. Local MySQL metadata was inspected read-only using
`node server/scripts/inspect-service-manager-schema.js`. No data or DDL was executed.

## Existing architecture

- React 19 / TypeScript / Vite / Tailwind 4, Axios cookie/CSRF API client, Lucide,
  Chart.js, SweetAlert and Sonner already installed. No new dependencies required.
- `ServiceLayout` protects `service_manager` and reuses `PremiumPortalShell` (mobile
  sidebar, header and theme). `/service/dashboard`, `/service/catalog/:section?`,
  enquiry/order/cancellation list and detail routes already exist.
- Express `/v1` mounts the service module. `middleware/auth` re-reads `eusers`,
  verifies roles and handles cookie CSRF. Managers are employees; orders belong to
  `customer`, never to `eusers.user_id`.
- Existing catalogue APIs use active-only public reads and role-protected writes.
  This prevents managers from restoring inactive variants/categories. New protected
  management reads should include inactive records and use server pagination.
- Category fields: name (100), icon, status, created_at, display_type,
  direct_service_id, slug. No description/order/update timestamp on local schema.
- Service fields already include description, DECIMAL(10,2) price, estimated_days,
  sort_order, is_featured, created_at/updated_at. Reuse them.
- Variants already contain DECIMAL price/original_price and fixed/percentage earn
  and redemption settings, caps, image, status and created_at. No update timestamp.
- Services/categories/variants mostly have indexes without enforced parent FKs;
  validate parents in transactions. `service_enquiries.user_id` references customer.
- Additional dependencies: bundle_items, variant_sections, service_sections,
  enquiry_fields, invoices, CMS effective offers/campaigns, customer addresses.
- Order prices/rewards are snapshots; catalogue edits must never rewrite them.
- Enquiry statuses are `new/contacted/converted/closed`, not an invented in-progress
  state. Existing status mutation exists; bundle enquiries are lost by its inner
  services join. Fix to a left join and scope bundles by all their items.
- Order statuses include payment_done in schema; manager fulfilment must only move
  paid documents_uploaded -> in_progress -> completed. Cancellation uses the
  existing approval/refund workflow, never a direct arbitrary status write.
- Existing completion reward credit locks the order and uses wallet adjustments.
  Local `wallet_transactions.reason_code` does NOT support SERVICE_REWARD; schema
  also lacks flash_sale_campaign_id referenced by some existing order queries.
  These are deployment prerequisites, not permission to modify historical data.
- Checkout picks lowest live CMS/flash offer. Offer disables redemption. Existing
  fixed/percentage calculator floors coins and subtracts one rupee per redeemed
  coin. This is current code behavior, not confirmation of an approved conversion
  policy. New conversion, inheritance, direct RP price stacking, expiry, tax,
  approvals and scheduled price policies require business confirmation.
- Cancellations use service_order_cancellations/refunds/timeline, customer_wallet,
  wallet_transactions and service_wallet_reservations. Preserve that implementation.
- `external_service_*` tables represent API-client sales channels using the same
  catalogue; they are NOT evidence of partner-owned catalogue. Never label them as
  Partner Services or import their counts into that workspace.
- Partner/Partner Manager mock API files use module arrays and setTimeout. Remove
  their production entry points from this portal; do not present these as live data.
- Existing tests: Node test runner for service rewards/offers/payment states,
  wallet/order policies elsewhere; Vitest/Testing Library for client. No browser or
  production integration verification has yet been performed.

## Proposed changes (before database implementation)

1. Add protected `/v1/service-manager` summary, catalogue, pricing, reward-preview
   and history APIs. Preserve existing URLs and common components.
2. Add nullable `service_scope` to categories/services. NULL means unclassified,
   not in-house. New in-house records get explicit scope. Classification is an
   explicit manager action; no automatic historical backfill. Disallow changing
   scope after orders/bundles/enquiries refer to a service.
3. Add category description, sort order and updated timestamp, reusing existing
   equivalent service fields. Audit actor belongs in an append-only audit table.
4. Reuse variant prices and reward columns. A single audit structure stores
   before/after snapshots including pricing/reward changes and manager identity;
   no duplicate wallet, dashboard or price ledger.
5. Review-only migration scripts; no automatic startup DDL or production writes.
   Missing migration returns an actionable 503. Reads must not invent zeros.
6. Build global/in-house views, collapsible navigation, accessible catalogue
   drawer, pricing editor/history, existing-rule editor and backend preview.
   Partner workspace remains isolated and clearly unavailable until ownership and
   commercial policy are specified. Unclassified catalogue gets a review screen.
7. Reuse order/cancellation pages with server scope enforcement; preserve account
   routes. Add explicit readiness notices for unsupported financial configuration.

## Financial and permission boundaries

Sakshi's role authorizes in-house operations, not approval privilege or partner
cost access. No inferred per-manager assignment exists. Scope is workspace-wide
for authenticated internal service managers, not a filter on order.user_id.
Revenue is labelled paid completed order value, not net profit or gateway receipts;
refund amounts are separately disclosed. Reward coins issued must come from actual
SERVICE_REWARD credits, not the potential reward stored on unfinished orders.

Business decisions still required: partner ownership/assignment, conversion policy,
tax/fees, price approval thresholds, scheduled price semantics, broader reward
inheritance/stacking, direct RP price eligibility. Keep unsupported controls absent
or explicitly unavailable. Production readiness requires reviewed migrations,
classification, policy decisions and integration testing.
