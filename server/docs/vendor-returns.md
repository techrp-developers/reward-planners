# Vendor returns and replacements

Apply `migrations/20261029_01_vendor_returns.sql` before deploying the new product model.
The migration adds `eproducts.open_box_delivery` (default off) and the request table.

Vendor product add/edit/view supports open-box delivery. When `is_replaceable=1`,
damaged-product video evidence is mandatory for replacement requests. This is a
product policy flag, not automatic courier booking for open-box service.

## Customer app integration

The customer app must wire its request form to these authenticated endpoints:

- `POST /v1/orders/items/:orderItemId/return-request`: multipart fields
  `request_type` (`return` or `replacement`), `reason` (1–2000 characters),
  and `video` (required for replacement; MP4/MOV/WebM, maximum 50 MB).
- `GET /v1/orders/return-requests`: customer's own requests and review status.
- `GET /v1/orders/items/:orderItemId/return-request`: one request with a
  short-lived signed `video_url`.

`GET /v1/orders/order-details/:orderId` returns `open_box_delivery` and a
`return_request` block per item (`can_return`, `can_replace`, `window_ends_at`,
`video_required`, and the existing request's `status`/`vendor_note`) so the app
can decide which actions to show. Code lives in `app/ecommerce/v1`
(`models/returnRequestModel.js`, `utils/returnRequestPolicy.js`).

Requests cover the full order-item quantity. One request per order item is allowed.
The API verifies customer ownership, active fulfillment, delivery, enabled product
policy and the return window before accepting a request. Video keys are stored
under a private prefix and vendor details issue short-lived signed playback URLs.
The storage bucket/CDN must keep this prefix private.

## Vendor portal

Orders → Returns & replacements lists the authenticated vendor's requests with
pagination and status filters. Details show the reason and video. Vendors can
approve or reject pending requests; rejection needs a note. Concurrent reviews
cannot overwrite a prior decision. Approval does not move money, reserve stock,
book return pickup or dispatch a replacement; those operations are separate.

Routes under `/api/crm/order`: `GET /return-requests`, `GET /return-requests/:id`,
`PATCH /return-requests/:id` with `{ status: 'approved' | 'rejected', note }`.

Run `node --test tests/returnRequests.test.js` for request policy and ownership checks.
