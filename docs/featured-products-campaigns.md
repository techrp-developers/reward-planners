# Featured product campaigns

The vendor-manager dashboard manages product featured campaigns through the existing `campaigns` and `campaign_featured_products` tables. The required columns and table are assumed to have been deployed already; this change does not add or run migrations.

## Manager APIs

These endpoints use the existing `/api/crm/campaign` mount and require an authenticated `vendor_manager` or `admin`.

- `POST /campaign/campaigns` and `PUT /campaign/campaigns/:id` save a `featured` product campaign. The background configuration fields are `background_type` (`solid`, `gradient`, or `image`), `background_color`, `gradient_end_color`, `text_color`, and `cta_text`. Upload the optional image in `banner_image` (JPG, PNG, or WebP; maximum 5 MB).
- `GET /campaign/featured-products/search?search=...` searches approved, visible, in-stock products by name, product ID, brand, or category.
- `GET /campaign/campaigns/:id/featured-products` returns the current selected products in display order.
- `PUT /campaign/campaigns/:id/featured-products` replaces the selection atomically. The array order is persisted as `display_order`:

```json
{ "product_ids": [501, 505, 509] }
```

Activation is rejected until the campaign has at least one currently available product and valid featured configuration.

## Mobile APIs

The public resolver is mounted under `/v1/campaigns`:

- `GET /v1/campaigns/home/featured` returns the first active campaign and up to 10 eligible products in manager-defined order. If none is eligible, it returns `{ "success": true, "data": null }`.
- `GET /v1/campaigns/:id/featured-products/public?page=1&limit=20` returns that active campaign’s ordered products with pagination. Limits are capped at 100; draft, archived, future, and expired campaigns are not public.

Product cards use the existing ecommerce response formatter for offer prices, reward data, and wishlist state. Ratings are only populated when approved reviews exist.

## Dashboard

Vendor managers can find **Featured products** under Sales in the manager dashboard. Create a draft, save its selected product order, preview the first 10 items, then activate it when ready.
