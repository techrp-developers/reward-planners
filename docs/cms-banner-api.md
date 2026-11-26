# CMS banner API

Use `/api/crm/content` on the CRM host. The default local backend base is `http://localhost:5000/api/crm/content`. The backend also serves these routes under `/content`.

For admin requests, use an `admin` or `vendor_manager` account. Send `Authorization: Bearer <access_token>` or use the signed-in browser session. Cookie-authenticated writes require the `X-CSRF-Token` header.

## Get live banners for the app

```http
GET /api/crm/content/resolved/product
```

This public endpoint returns one resolved entry per zone. Read `data.promotional_banner`, `data.brand_promotional_banner`, and `data.offers_banner`. Each is `null` when the module has no live campaign for that zone. The response also includes `data.navbar_background`. Image campaigns can include an ordered `images` array.

Use `GET /api/crm/content/resolved/:module` for any supported module: `product`, `service`, `payment`, `dineout`, or `mobile_dashboard`. Call it once per module you display.

## Get all CMS banner entries

```http
GET /api/crm/content/entries?zone=promotional_banner&page=1&pageSize=20
GET /api/crm/content/entries?zone=brand_promotional_banner&page=1&pageSize=20
GET /api/crm/content/entries?zone=offers_banner&page=1&pageSize=20
```

Omit `module` to list the selected zone across all modules, or add `module=product` or another supported module. Omit `zone` to include every CMS content zone, including navbar backgrounds. The list returns `data.entries`, `data.total`, `data.page`, and `data.pageSize`. Fetch successive pages to get every entry.

Optional filters are `search` (title), `status` (`default`, `draft`, `scheduled`, `active`, `expired`), `sortBy` (`created_at`, `start_at`, `end_at`, `priority`, `title`), and `sortDir` (`ASC` or `DESC`). The API applies `status` after pagination, so `total` counts entries before that filter and a page can have zero matches. Use the detail endpoint for the full gallery, including inactive images.

## Entry methods

Prepend `/api/crm/content` to each path below. Use the returned `content_id` for `:id`.

| Method | Path | Purpose and input |
| --- | --- | --- |
| GET | `/entries` | List CMS entries using the query parameters above. |
| GET | `/entries/:id` | Get one entry and its gallery. |
| GET | `/targets` | Look up destinations with required `type` and optional `search` and `selected_id`. |
| POST | `/entries` | Create, schedule, or publish a campaign. |
| PUT | `/entries/:id` | Edit, schedule, or publish an existing campaign. |
| POST | `/entries/:id/duplicate` | Copy a campaign as a draft. |
| PATCH | `/entries/:id/deactivate` | End a campaign immediately. |
| DELETE | `/entries/:id` | Delete a campaign. |

Create with `module`, `zone`, `title`, and `content_type`. Send `multipart/form-data` for uploads, with one file in `image` or repeated files in `images[]` for a gallery. Set `content_type=image` for artwork. The API also supports `content_type=color` with `color_value`. Optional fields include `display_mode` (`single`, `carousel`, `grid_2`, `grid_3`), `cta_text`, `redirect_link`, `priority`, `start_at`, and `end_at`.

Send `is_published=false` to save a draft. Send `is_published=true` to publish or schedule using `start_at`. If a publish attempt overlaps a published campaign in that module and zone, the API returns `409` with `data.conflicts`. The form field `force_publish=true` permits the overlap.

Target types are `product`, `category`, `subcategory`, `service`, `service_category`, and `service_bundle`. When setting a destination, send `target_type` and a positive `target_id`. For a multi-product or multi-service destination, include `target_ids` as a JSON array, encoded as text in form data.

Example draft request with a bearer token:

```bash
curl -X POST "http://localhost:5000/api/crm/content/entries" \
  -H "Authorization: Bearer <access_token>" \
  -F "module=product" \
  -F "zone=brand_promotional_banner" \
  -F "title=Weekend collection" \
  -F "content_type=image" \
  -F "display_mode=carousel" \
  -F "is_published=false" \
  -F "images[]=@banner.jpg"
```

## Gallery image methods

These apply to all three banner zones. Use the `image_id` from the entry gallery for `:imageId`.

| Method | Path | Request body |
| --- | --- | --- |
| POST | `/entries/:id/images` | Multipart files under `images` or `images[]`. Up to 10 images per campaign. |
| PATCH | `/entries/:id/images/reorder` | JSON such as `{"images":[{"image_id":42,"sort_order":0}]}`. |
| PATCH | `/entries/:id/images/:imageId/target` | JSON such as `{"target_type":"product","target_id":12,"target_ids":[12,18]}`. |
| PATCH | `/entries/:id/images/:imageId/activate` | No body. |
| PATCH | `/entries/:id/images/:imageId/deactivate` | No body. |
| DELETE | `/entries/:id/images/:imageId` | No body. |

## Discount and price methods

These routes use the banner's module and linked destinations to determine eligible products, service variants, and bundles.

| Method | Path | Purpose and input |
| --- | --- | --- |
| GET | `/entries/:id/discount-rule` | Get the shared discount for a product or service banner. |
| PUT | `/entries/:id/discount-rule` | Send `{"discount_type":"percentage","discount_value":10}`. Types are `none`, `percentage`, and `fixed`. |
| GET | `/entries/:id/product-pricing` | List linked product variants and prices. |
| PUT | `/entries/:id/product-pricing/:variantId` | Set or clear a product variant price. |
| GET | `/entries/:id/service-pricing` | List linked service variants and prices. |
| PUT | `/entries/:id/service-pricing/:variantId` | Set or clear a service variant price. |
| GET | `/entries/:id/bundle-pricing` | List linked service bundles and prices. |
| PUT | `/entries/:id/bundle-pricing/:bundleId` | Set or clear a service bundle price. |

Send `{"offer_price":499.00}` to set an individual offer price or `{"offer_price":null}` to remove the override.

Source: [CMS routes](../server/routes/contentRoutes.js), [controller](../server/controllers/contentController.js), [model](../server/models/contentZoneModel.js), and [CRM route mounting](../server/routes/mountCrmRoutes.js).
