# Software Requirements Specification — E-commerce Module (Backend v1)

| Document field | Value |
|---|---|
| System | Reward React App — E-commerce module |
| Component | Customer-facing backend API |
| API version | v1 |
| Document version | 1.0 (implementation-derived draft) |
| Status | Draft for stakeholder review |
| Source baseline | `server/app/ecommerce/v1/` as reviewed on 20 July 2026 |

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification (SRS) defines the behavior of the v1 e-commerce backend. It documents the requirements evidenced by the current implementation and provides a baseline for product review, frontend integration, QA, maintenance, and future development.

### 1.2 Scope

The module enables customers to discover products and campaigns, search the catalog, manage a wishlist and cart, preview and place orders, redeem and earn reward coins, pay through Razorpay, track shipments through Xpressbees, request cancellations, download invoices, and submit product reviews.

The API is mounted at `/v1`. The module provides customer-facing capabilities; catalog administration, vendor administration, campaign authoring, warehouse operations, and manual refund administration are outside the reviewed v1 route set.

### 1.3 Source-of-truth convention

Requirements marked **Implemented** are derived from the reviewed backend. Requirements marked **Proposed** are recommended quality constraints or decisions requiring stakeholder confirmation. When this SRS conflicts with current code, the discrepancy must be resolved explicitly before treating the SRS as contractual.

### 1.4 Definitions

| Term | Meaning |
|---|---|
| Customer | Authenticated end user purchasing products |
| Optional authentication | Endpoint may serve anonymous users and enrich results for an authenticated user |
| Variant | Purchasable product configuration with its own price and stock |
| Vendor order | Vendor-specific portion of a customer order |
| Shipment | Vendor-specific logistics record associated with an order |
| Reward coin | Wallet unit that may be earned or redeemed according to configured rules |
| NDR | Non-delivery report |
| RTO | Return to origin |
| Drain mode | Middleware control that temporarily rejects new state-changing checkout/payment traffic |

## 2. Overall Description

### 2.1 Product perspective

The module is an Express/Node.js REST API backed by a relational database. It integrates with shared customer authentication, addresses, notifications, reward configuration and wallet services. External integrations include Razorpay for payments/refunds, Xpressbees for serviceability/shipping/tracking, CDN-hosted product media, and order notifications through configured email/WhatsApp services.

### 2.2 Actors

| Actor | Responsibilities |
|---|---|
| Anonymous visitor | Browse catalog, categories, campaigns, product detail, recommendations and reviews; check stock; use search suggestions |
| Authenticated customer | Perform all visitor actions plus manage cart/wishlist/history, checkout, payment, orders, shipment tracking, cancellations and reviews |
| Payment gateway | Create/capture payment state and send payment lifecycle events |
| Logistics provider | Check serviceability, book/cancel shipments and provide shipment status updates |
| Scheduled/background services | Expire unpaid orders, synchronize shipment states, issue rewards/refunds and retry recoverable operations |
| Operations team | Receive alerts for integration or lifecycle failures |

### 2.3 Assumptions and dependencies

- Each purchasing customer is associated with a valid company.
- Customer addresses are managed by the shared common module and must belong to the authenticated customer.
- Products offered for purchase have approved status and active category hierarchy.
- Inventory is maintained at variant level.
- One order may contain items belonging to multiple vendors and therefore multiple vendor orders and shipments.
- Reward rules, vendor pickup addresses, payment credentials, logistics credentials and notification providers are configured externally.
- Monetary calculations use the application's database currency; the Razorpay integration implies INR/paise conversion at the gateway boundary.

## 3. Functional Requirements

### 3.1 Catalog and product discovery

| ID | Requirement | Status |
|---|---|---|
| FR-CAT-01 | The system shall list approved products with pagination, search and sorting. | Implemented |
| FR-CAT-02 | The system shall list products filtered by category or subcategory. | Implemented |
| FR-CAT-03 | The system shall return product detail including variants, attributes and media. | Implemented |
| FR-CAT-04 | The system shall expose active categories, subcategories and their hierarchy. | Implemented |
| FR-CAT-05 | Product responses shall expose customer-specific wishlist state when optional authentication resolves a user. | Implemented |
| FR-CAT-06 | Viewing product detail shall update the authenticated customer's recently viewed history. | Implemented |
| FR-CAT-07 | The system shall provide similar, recent, recommended, new-arrival, customers-also-bought, trending, best-selling, most-viewed and top-rated product feeds. | Implemented |
| FR-CAT-08 | Recommendations shall use available customer signals including orders, wishlist, cart and views; the API shall still return usable results when personalization data is unavailable. | Implemented |

### 3.2 Search

| ID | Requirement | Status |
|---|---|---|
| FR-SRH-01 | The system shall return product search suggestions for a supplied search term. | Implemented |
| FR-SRH-02 | The system shall return paginated products matching a search term. | Implemented |
| FR-SRH-03 | An authenticated customer shall be able to save, retrieve and clear search history. | Implemented |
| FR-SRH-04 | Anonymous use of history endpoints shall not create customer-owned history. | Implemented |

### 3.3 Campaigns

| ID | Requirement | Status |
|---|---|---|
| FR-CAM-01 | The system shall provide campaigns intended for the home screen. | Implemented |
| FR-CAM-02 | The system shall list active customer-visible campaigns and provide campaign detail. | Implemented |
| FR-CAM-03 | The system shall list products associated with a campaign and enrich wishlist status for authenticated customers. | Implemented |

### 3.4 Wishlist

| ID | Requirement | Status |
|---|---|---|
| FR-WIS-01 | An authenticated customer shall be able to add a valid product variant to their wishlist without creating duplicates. | Implemented |
| FR-WIS-02 | A customer shall be able to remove an item and check whether a product variant is wishlisted. | Implemented |
| FR-WIS-03 | The system shall return the customer's wishlist with currently usable product, variant, price, stock and media information. | Implemented |
| FR-WIS-04 | The system shall return a wishlist badge count. | Implemented |
| FR-WIS-05 | A customer shall be able to move a wishlisted item into the cart, subject to stock validation. | Implemented |

### 3.5 Cart and pricing

| ID | Requirement | Status |
|---|---|---|
| FR-CRT-01 | An authenticated customer shall be able to add a product variant and positive quantity to the cart. | Implemented |
| FR-CRT-02 | Adding an existing variant shall update its cart quantity and shall not exceed available stock. | Implemented |
| FR-CRT-03 | A customer shall be able to list cart items, update quantity, remove an item and clear the cart. | Implemented |
| FR-CRT-04 | Updating quantity to zero shall remove the cart item; negative quantities shall be rejected. | Implemented |
| FR-CRT-05 | The system shall expose current variant stock and whether the variant is in stock. | Implemented |
| FR-CRT-06 | The system shall calculate product total, discount, reward eligibility, redeemable coins, reward discount and payable total from current server-side data. | Implemented |
| FR-CRT-07 | Cart mutations shall return or allow retrieval of a recalculated cart summary. | Implemented |

### 3.6 Rewards

| ID | Requirement | Status |
|---|---|---|
| FR-RWD-01 | The system shall evaluate only active reward rules within their configured date and order-value ranges. | Implemented |
| FR-RWD-02 | The system shall select the highest-priority applicable non-stackable rule and combine it with applicable stackable rules without double-applying a rule. | Implemented |
| FR-RWD-03 | Rewards may be fixed or percentage based and may be capped by rule-specific maximums. | Implemented |
| FR-RWD-04 | Redeemable coins shall not exceed the rule cap, wallet balance or applicable order amount and shall be rounded down to a whole coin. | Implemented |
| FR-RWD-05 | Reward balance used during checkout shall be locked and revalidated transactionally. | Implemented |
| FR-RWD-06 | Earned reward coins shall be treated as credited only after delivery. | Implemented |
| FR-RWD-07 | Reserved/redeemed coins shall be restored when an unpaid order expires or is cancelled, through the shared wallet lifecycle service. | Implemented |

### 3.7 Checkout

| ID | Requirement | Status |
|---|---|---|
| FR-CHK-01 | A customer shall be able to preview checkout for either the current cart or a buy-now product variant. | Implemented |
| FR-CHK-02 | Checkout preview shall accept reward usage and an optional customer address for delivery/serviceability calculations. | Implemented |
| FR-CHK-03 | Placing an order shall require a valid customer-owned address, valid customer company, available stock and a serviceable destination. | Implemented |
| FR-CHK-04 | Cart checkout shall reject an empty cart; buy-now checkout shall reject an invalid product/variant or quantity outside 1–100. | Implemented |
| FR-CHK-05 | The client shall submit `expected_total` and may submit `expected_redeemable`; the server shall reject stale or manipulated checkout values. | Implemented |
| FR-CHK-06 | Stock, wallet and checkout data shall be revalidated inside a database transaction before order creation. | Implemented |
| FR-CHK-07 | A successful checkout shall create the customer order, vendor orders, order items and vendor shipments, decrement stock, reserve rewards where applicable, and clear the cart for cart mode. | Implemented |
| FR-CHK-08 | A newly created order shall enter `pending_payment` and receive a unique order reference and expiry time. | Implemented |
| FR-CHK-09 | Shipment records created before payment shall remain `awaiting_payment`. | Implemented |
| FR-CHK-10 | The system shall support a read-only receipt for an order owned by the authenticated customer. | Implemented |
| FR-CHK-11 | Checkout creation shall be rate-limited and reject writes while drain mode is active. | Implemented |

### 3.8 Payment and refund

| ID | Requirement | Status |
|---|---|---|
| FR-PAY-01 | A customer shall be able to create a Razorpay payment order only for their own unexpired `pending_payment` order. | Implemented |
| FR-PAY-02 | Payment-order creation shall be idempotent for an existing usable gateway order and protected by transactional locking. | Implemented |
| FR-PAY-03 | The system shall verify the Razorpay payment signature before accepting client-side payment confirmation. | Implemented |
| FR-PAY-04 | Authoritative payment capture processing shall accept the first capture only while the order is `pending_payment`. | Implemented |
| FR-PAY-05 | Successful payment shall mark payment success, move the order to `paid`, release shipments for booking, generate invoices and trigger customer notifications/background fulfillment. | Implemented |
| FR-PAY-06 | Duplicate or late captures shall not produce duplicate fulfillment and shall be eligible for a scoped, idempotent refund. | Implemented |
| FR-PAY-07 | A customer shall be able to poll payment status for an order they own. | Implemented |
| FR-PAY-08 | A customer shall be able to explicitly cancel an owned unpaid order; the operation shall release associated reservations through lifecycle services. | Implemented |
| FR-PAY-09 | Refund processing shall persist initiated/completed/failed state, use deterministic idempotency keys and update payment state to partially or fully refunded. | Implemented |
| FR-PAY-10 | Payment creation and cancellation shall be rate-limited; creation shall respect drain mode. | Implemented |

### 3.9 Orders, cancellations and invoices

| ID | Requirement | Status |
|---|---|---|
| FR-ORD-01 | A customer shall be able to retrieve paginated order history, optionally filtered by status and search criteria. | Implemented |
| FR-ORD-02 | `pending_payment` orders shall not appear in normal customer order history/detail views. | Implemented |
| FR-ORD-03 | A customer shall be able to retrieve detail only for an order they own, including items, vendor shipments, tracking progress, totals and reward information. | Implemented |
| FR-ORD-04 | The system shall provide paginated buy-again products derived from previous eligible orders. | Implemented |
| FR-ORD-05 | The system shall expose active cancellation reasons. | Implemented |
| FR-ORD-06 | Cancellation requests shall be accepted only for owned orders in `paid` or `processing` state with no existing request. | Implemented |
| FR-ORD-07 | A cancellation request shall record its reason, optional comment, request record and timeline event, and set cancellation state to `requested`. | Implemented |
| FR-ORD-08 | The customer shall be able to retrieve cancellation request, timeline and refund details for their order. | Implemented |
| FR-ORD-09 | The customer shall be able to download invoices belonging to their order; multi-vendor invoices may be returned as an archive. | Implemented |

### 3.10 Logistics and tracking

| ID | Requirement | Status |
|---|---|---|
| FR-LOG-01 | An authenticated customer shall be able to check delivery serviceability for a six-digit pincode in cart or buy-now mode. | Implemented |
| FR-LOG-02 | Serviceability shall account for each applicable vendor origin and requested product quantity. | Implemented |
| FR-LOG-03 | Paid-order processing shall book eligible vendor shipments with Xpressbees and persist courier, AWB, label and booking result data. | Implemented |
| FR-LOG-04 | Shipment booking shall be retry-safe and shall track overall synchronization as in-progress, completed, partial or failed. | Implemented |
| FR-LOG-05 | A customer shall be able to track all shipments of an owned order and see normalized labels, milestones and exceptional states. | Implemented |
| FR-LOG-06 | Tracking shall recognize normal progression (`booked`, `picked_up`, `in_transit`, `out_for_delivery`, `delivered`) and exceptional states including `booking_failed`, `ndr`, `rto` and `cancelled`. | Implemented |
| FR-LOG-07 | A customer shall be able to request cancellation of an owned cancellable shipment, subject to provider acceptance. | Implemented |
| FR-LOG-08 | Vendor order status shall become `shipped` during shipment transit, `delivered` on delivery, `cancelled` for RTO/cancellation, and otherwise remain `processing`. | Implemented |

### 3.11 Reviews

| ID | Requirement | Status |
|---|---|---|
| FR-REV-01 | Only a customer with a delivered order containing the variant shall be eligible to review it. | Implemented |
| FR-REV-02 | A customer shall not submit more than one review for the same eligible order item/product context. | Implemented |
| FR-REV-03 | A review shall include a valid rating and may include review text and up to five uploaded media files. | Implemented |
| FR-REV-04 | Public review listing shall include approved reviews only and support pagination, rating filter and helpful/rating sorting. | Implemented |
| FR-REV-05 | The system shall return rating distribution, average rating, review count, media and the authenticated customer's helpful-vote state. | Implemented |
| FR-REV-06 | An authenticated customer shall be able to add or remove one helpful vote per approved review. | Implemented |
| FR-REV-07 | Product aggregate rating and count shall be updated consistently after review creation. | Implemented |

## 4. External Interface Requirements

### 4.1 API conventions

- API base path: `/v1`.
- Request and normal response bodies use JSON except review upload (`multipart/form-data`) and invoice download (PDF/ZIP response).
- Protected routes require the shared authentication middleware and use the resolved `req.user.user_id`.
- Optional-authentication routes return public data when no user is resolved.
- A typical JSON response contains `success`, with `message`, `data`, or resource-specific fields.
- Validation errors generally use HTTP 400; unauthorized access uses 401; missing owned resources use 404; stale checkout state uses 409; unexpected failures use 500.

### 4.2 Endpoint inventory

All paths below are relative to `/v1`.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/product/all-products` | Optional auth | Product listing |
| GET | `/product/by-category/:categoryId` | Optional auth | Products by category |
| GET | `/product/by-subcategory/:subcategoryId` | Optional auth | Products by subcategory |
| GET | `/product/product-details/:productId` | Optional auth | Product detail |
| GET | `/product/categories` | Public | Categories |
| GET | `/product/subcategories/:categoryId` | Public | Subcategories |
| GET | `/product/categories-with-subcategories` | Public | Category tree |
| GET | `/product/similar/:productId` | Optional auth | Similar products |
| GET | `/product/recent-products` | Optional auth | Recent products |
| GET | `/product/recommendations` | Optional auth | Personalized recommendations |
| GET | `/product/new-arrivals` | Optional auth | New arrivals |
| GET | `/product/:productId/customers-also-bought` | Optional auth | Co-purchased products |
| GET | `/product/trending` | Optional auth | Trending products |
| GET | `/product/best-sellers` | Optional auth | Best sellers |
| GET | `/product/most-viewed` | Optional auth | Most viewed products |
| GET | `/product/top-rated` | Optional auth | Top-rated products |
| GET | `/product/search/suggestions` | Public | Search suggestions |
| GET | `/product/search/products` | Optional auth | Search results |
| POST/GET/DELETE | `/product/search/history` | Optional auth | Save/get/clear search history |
| GET | `/campaign/home` | Public | Home campaigns |
| GET | `/campaign/list` | Public | Active campaigns |
| GET | `/campaign/details/:id` | Public | Campaign detail |
| GET | `/campaign/:id/products` | Optional auth | Campaign products |
| GET | `/cart/cart-items` | Auth | Cart items |
| GET | `/cart/cart-summary` | Auth | Pricing and rewards summary |
| POST | `/cart/cart-item` | Auth | Add to cart |
| GET | `/cart/cart-items/check-stock/:variantId` | Public | Variant stock |
| PUT/DELETE | `/cart/cart-items/:cart_item_id` | Auth | Update/remove cart item |
| DELETE | `/cart/cart-items` | Auth | Clear cart |
| GET | `/checkout/get-cart` | Auth | Cart checkout preview |
| GET | `/checkout/get-buy-now` | Auth | Buy-now preview |
| POST | `/checkout/cart` | Auth | Place cart order |
| POST | `/checkout/buy-now` | Auth | Place buy-now order |
| GET | `/checkout/order-receipt/:orderId` | Auth | Order receipt |
| POST | `/payment/create-order` | Auth | Create/reuse gateway order |
| POST | `/payment/verify-payment` | Auth | Verify payment signature/status |
| GET | `/payment/payment-status/:orderId` | Auth | Poll payment status |
| POST | `/payment/cancel-order/:orderId` | Auth | Cancel unpaid order |
| GET | `/orders/orders-history` | Auth | Order history |
| GET | `/orders/order-details/:orderId` | Auth | Order detail |
| GET | `/orders/buy-again` | Auth | Buy-again products |
| GET | `/orders/cancellation-reasons` | Public | Cancellation reasons |
| POST | `/orders/cancel/:orderId` | Auth | Request order cancellation |
| GET | `/orders/cancellation-details/:orderId` | Auth | Cancellation detail |
| GET | `/orders/invoice/:orderId` | Auth | Download invoice(s) |
| POST | `/logistics/check-serviceability` | Auth | Delivery serviceability |
| GET | `/logistics/track-status/:orderId` | Auth | Shipment tracking |
| POST | `/logistics/shipment-cancel/:shipmentId` | Auth | Cancel shipment |
| POST | `/wishlist/add-wishlist` | Auth | Add wishlist item |
| DELETE | `/wishlist/remove/:product_id/:variant_id` | Auth | Remove wishlist item |
| GET | `/wishlist/get-wishlist` | Auth | Wishlist contents |
| GET | `/wishlist/check/:product_id/:variant_id` | Auth | Wishlist status |
| POST | `/wishlist/move-to-cart` | Auth | Move item to cart |
| GET | `/wishlist/badge` | Auth | Wishlist count |
| GET | `/review/reviewable-order/:variant_id` | Auth | Review eligibility |
| POST | `/review/create-review` | Auth | Submit multipart review |
| GET | `/review/all-reviews/:product_id` | Optional auth | Approved reviews |
| POST/DELETE | `/review/:reviewId/helpful` | Auth | Add/remove helpful vote |

### 4.3 External systems

| System | Required interaction |
|---|---|
| Razorpay | Create payment order, validate signature, process capture/failure events and issue refunds |
| Xpressbees | Check pincode serviceability, book/cancel shipments, obtain AWB/labels and synchronize tracking |
| CDN/media storage | Serve product, wishlist and review media through public URLs |
| Email/WhatsApp/notification services | Deliver order and lifecycle notifications without blocking the primary transaction |
| Relational database | Provide transactional persistence and row-level locking for checkout/payment lifecycle |

## 5. Data Requirements

### 5.1 Principal entities

| Entity | Important relationships/purpose |
|---|---|
| Customer, company, address | Identity, tenant/company association and delivery destination |
| Product, variant, image, video, attribute | Catalog and purchasable stock-keeping configuration |
| Category, subcategory, sub-subcategory | Product classification and discovery |
| Campaign | Time/status-controlled merchandising collection |
| Cart item, wishlist item | Customer intent before purchase |
| Reward rule/mapping, customer wallet, wallet ledger | Reward qualification, balance, reservation, debit and credit |
| Order, order item | Customer-level purchase and immutable item snapshot |
| Vendor order | Vendor-specific financial/fulfillment partition |
| Order shipment | Vendor origin, logistics booking and tracking state |
| Order payment, order refund | Gateway identifiers, amounts, statuses and idempotent refund records |
| Invoice, invoice item | Vendor/order billing documents |
| Cancellation reason/request/timeline | Customer cancellation workflow and audit trail |
| Product review, review media, helpful vote | Verified-purchase feedback and engagement |
| Recently viewed, search history | Customer discovery signals |

### 5.2 Integrity and retention requirements

| ID | Requirement | Status |
|---|---|---|
| DR-01 | Ownership checks shall constrain customer reads and writes by authenticated user ID. | Implemented |
| DR-02 | Checkout shall atomically persist order structures, inventory changes and reward reservation or roll back all changes. | Implemented |
| DR-03 | Item/order records shall preserve transactional prices and totals independently of later catalog changes. | Implemented |
| DR-04 | Gateway order/payment IDs, wishlist membership, cart variant membership and helpful votes shall be protected against duplicate logical records. | Implemented/DB-dependent |
| DR-05 | Financial, wallet, shipment and cancellation transitions shall maintain an auditable record. | Implemented |
| DR-06 | Formal retention periods for orders, invoices, reviews, search history, media and webhook payloads shall be approved and documented. | Proposed |

## 6. Lifecycle Requirements

### 6.1 Order states

The implementation recognizes the following order lifecycle states: `pending_payment`, `paid`, `processing`, `partially_shipped`, `shipped`, `delivered`, `rto`, `delivery_failed`, and `cancelled`.

Primary transition expectations:

1. Checkout creates `pending_payment` and reserves stock/rewards.
2. First accepted payment capture moves the order to `paid`.
3. Fulfillment/booking may move a paid order to `processing`.
4. Shipment aggregation may move the order through partial/shipped/delivery terminal states.
5. Explicit cancellation/expiry before payment releases reservations and moves the order to `cancelled`.
6. Customer cancellation is request-based for `paid` and `processing`; later approval/fulfillment behavior is handled by downstream operational services.

### 6.2 Shipment states

Recognized shipment states include `awaiting_payment`, `pending`, `booking_failed`, `booked`, `picked_up`, `in_transit`, `out_for_delivery`, `delivered`, `ndr`, `rto`, and `cancelled`.

### 6.3 Payment and refund states

- Payment states include `created`, `pending`, `success`, `failed`, `partially_refunded`, and `refunded`.
- Refund states include `initiated`, `completed`, and `failed`.
- Replayed payment/shipment events shall be idempotent and shall not repeat stock, wallet, invoice, shipment, notification, or refund effects.

## 7. Non-functional Requirements

| ID | Requirement | Status |
|---|---|---|
| NFR-SEC-01 | Protected endpoints shall reject requests without valid authentication. | Implemented |
| NFR-SEC-02 | The server shall derive customer identity from authentication, never from a client-supplied user ID. | Implemented |
| NFR-SEC-03 | Payment signatures shall be cryptographically verified and gateway secrets shall remain server-side. | Implemented |
| NFR-SEC-04 | Uploaded review media shall be restricted by configured upload validation, count and storage policy. | Partially implemented; policy confirmation required |
| NFR-SEC-05 | Logs and API errors shall not expose secrets, payment signatures, internal SQL, stack traces or sensitive personal data. | Proposed verification requirement |
| NFR-REL-01 | Checkout/payment/wallet/inventory operations shall use transactions and locks where concurrent writes can cause over-selling or double spending. | Implemented |
| NFR-REL-02 | External callbacks and retries shall be idempotent. | Implemented |
| NFR-REL-03 | Non-critical notifications shall not roll back a successful payment or order transaction. | Implemented |
| NFR-REL-04 | External-provider failures shall be recorded, retried where safe and escalated to operations where manual action is required. | Implemented |
| NFR-PERF-01 | All unbounded product, review, order and history collections shall use validated pagination with server-defined maximum limits. | Mostly implemented; verify every list endpoint |
| NFR-PERF-02 | Product media shall be served via CDN-compatible public URLs. | Implemented |
| NFR-AVL-01 | State-changing checkout/payment traffic shall support controlled drain mode during maintenance or incidents. | Implemented |
| NFR-OBS-01 | Failures shall include sufficient contextual logging/correlation to trace order, payment, shipment and refund lifecycles. | Proposed enhancement/verification |
| NFR-API-01 | API response field naming and error envelopes shall be standardized across all v1 resources. | Proposed; current implementation varies |
| NFR-API-02 | Breaking contract changes shall require a new API version. | Proposed |

## 8. Business Rules

| ID | Rule |
|---|---|
| BR-01 | Only approved products and approved public reviews are discoverable. |
| BR-02 | Quantity must be positive for addition/checkout, may be zero to remove during cart update, and buy-now/serviceability quantity is capped at 100. |
| BR-03 | Current server price, stock, delivery and wallet state always override stale client state. |
| BR-04 | Checkout totals supplied by the client are optimistic-concurrency checks, not authoritative prices. |
| BR-05 | An address used for checkout must belong to the authenticated customer. |
| BR-06 | Inventory and wallet funds are reserved before payment and must be released exactly once on expiry/cancellation/failure paths that terminate the order. |
| BR-07 | Only `pending_payment` accepts a first payment capture. |
| BR-08 | Only `paid` or `processing` orders accept customer cancellation requests. |
| BR-09 | Reviews require a delivered purchase and public listing requires approval. |
| BR-10 | Fulfillment and invoices are partitioned by vendor for multi-vendor orders. |

## 9. Acceptance Criteria

The release shall be accepted when the following critical scenarios pass automated integration or end-to-end tests:

1. Anonymous catalog browsing returns approved products and no customer-specific data leakage.
2. Concurrent add/update/checkout requests cannot produce cart quantity or sold stock above available inventory.
3. Cart and buy-now previews match server-calculated placement totals when state is unchanged.
4. A changed price, stock, shipping cost or wallet balance causes placement rejection and no partial order artifacts.
5. Successful multi-vendor checkout creates one customer order with correct vendor orders, items and awaiting-payment shipments.
6. First valid capture marks the order paid exactly once; replayed and duplicate captures do not duplicate fulfillment and trigger the appropriate refund path when necessary.
7. Unpaid cancellation/expiry restores stock and reward reservation exactly once.
8. Shipment booking supports complete, partial and failed outcomes without losing the paid order.
9. Shipment status synchronization correctly updates vendor order, customer order, rewards and refund effects without duplicating them on replay.
10. An unauthorized customer cannot access another customer's cart, address checkout, order, receipt, invoice, cancellation, payment status or tracking data.
11. Cancellation is accepted only for eligible pre-shipment states and creates a request plus timeline entry.
12. Only a delivered purchaser can submit one review; only approved reviews appear publicly; helpful voting remains one vote per customer.

## 10. Traceability to Code

| Requirement area | Primary implementation |
|---|---|
| Route contract | `server/app/ecommerce/v1/routes/` |
| Catalog/search | `controllers/productController.js`, `models/productModel.js` |
| Campaigns | `controllers/campaignController.js`, shared `campaignModel` |
| Cart | `controllers/cartController.js`, `models/cartModel.js` |
| Checkout/rewards | `controllers/checkoutController.js`, `models/checkoutModel.js`, `utils/rewardCalculate.js` |
| Payment/refund | `controllers/paymentController.js`, `models/paymentModel.js`, `utils/webhook.js`, shared Razorpay services |
| Orders/invoices/cancellation | `controllers/orderController.js`, `models/orderModel.js` |
| Logistics | `controllers/logisticsController.js`, `utils/webhook.js`, Xpressbees services/cron |
| Reviews | `controllers/reviewController.js`, `models/reviewModel.js` |
| Wishlist | `controllers/wishListController.js`, `models/wishlistModel.js` |
| Lifecycle policies/tests | `utils/lifecyclePolicy.js`, `tests/lifecycleSafety.test.js` |

## 11. Open Decisions and Implementation Gaps

These items should be resolved before the document is approved as a contractual SRS:

1. Confirm the business currency, tax/GST calculation rules, rounding rules and whether displayed totals are tax-inclusive.
2. Confirm shipping-charge rules, free-shipping thresholds, COD support (currently not exposed), delivery estimates and split-shipment presentation.
3. Define SLA targets for API latency, uptime, provider retries, shipment booking, cancellation decisions and refunds.
4. Define order/payment expiry duration and customer-facing behavior after an expired Razorpay checkout.
5. Define data retention, deletion/export, review moderation, media moderation and privacy requirements.
6. Standardize response naming (`snake_case` versus `camelCase`) and error codes; messages alone are not a stable client contract.
7. Decide whether the public stock endpoint should remain unauthenticated and whether it should expose exact quantities.
8. Wire or remove the currently unused NDR validation flow; no customer NDR-resolution route is exposed in the reviewed router.
9. Confirm whether shipment cancellation is intended as a customer-facing action or only as an internal/operations action.
10. Expand lifecycle tests beyond policy helpers to cover transaction rollback, webhook replay, duplicate capture/refund, expiry, multi-vendor partial booking, RTO and reward restoration.

## 12. Approval

| Role | Name | Decision | Date |
|---|---|---|---|
| Product owner |  |  |  |
| Engineering lead |  |  |  |
| QA lead |  |  |  |
| Security/operations |  |  |  |

