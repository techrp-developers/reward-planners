# CMS tables

10 tables and 2 views, 110 columns, generated from the working local database. Deploy with `cms-schema.sql`; verify with `cms-schema-check.sql`.

## Deploying to the live server

1. Back up the live database.
2. Run `cms-schema.sql` against it (for example `mysql -h <host> -u <user> -p <database> < database/cms-schema.sql`).
   It creates missing tables, adds only missing columns and indexes, and never changes or deletes data. Running it twice is harmless.
   The two views are recreated each run (a view holds no data) without a `DEFINER`, so they do not depend on a `root@localhost` account.
3. Run `cms-schema-check.sql`. No rows means the live schema matches. A `DIFFERENT TYPE` row is an existing column with an older definition; it is listed, not changed.

The splash screen tables alone can also be installed with `migrations/20261103_02_create_cms_splashscreens.sql` and checked with `node scripts/verify-splashscreen-schema.js` (read-only).

Requires the core tables the CMS links to, which the live app already has: `eproducts`, `product_variants`, `services`, `service_variants`, `service_bundles`.

CMS content (banners, slider images, offer prices, dashboard layout, module icons, app icon campaigns, splash placements and defaults) is data managed in the CMS; this file creates the structure only.

## Splash screens and page campaigns

Dynamic Splash Screen Management is available only to authorized Vendor Managers.

A splash screen, popup or page banner is an ordinary CMS entry in `content_zone_entries`: its artwork, title, CTA, target, schedule (`start_at`, `end_at`), `priority` and `is_published` are edited with the existing `/content/entries` screens and APIs. Two tables decide where and when it shows:

- `cms_splashscreen_placements`: the entry is shown on a page/slot, for a platform and audience, with a frequency and duration. One entry can be placed on many pages without being copied. Deleting the entry deletes its placements (`ON DELETE CASCADE`).
- `cms_splashscreen_defaults`: what a page/slot/platform shows when no campaign is live. Deleting the default entry clears the link (`ON DELETE SET NULL`) and the slot then shows nothing.

New splash artwork: create an entry with module `mobile_dashboard`, zone `promotional_banner`, content type `image`, display mode `single`, then place it. Artwork must be a JPG, PNG or WebP on `cdn.rewardplanners.com`, at least 600×300 px, not animated; it is downloaded and checked when it is placed or made a default. Recommended: 1080×1920 for splash/popup, landscape for banners.

### Pages and slots

| Page key | Slots |
|---|---|
| app_launch | promo_splash |
| dashboard | hero_banner, entry_popup |
| products | hero_banner, entry_popup |
| services | hero_banner, entry_popup |
| bus_booking | hero_banner, entry_popup |
| payments | hero_banner |
| step_counter | inline_banner |
| investments | inline_banner |
| insurance | inline_banner |
| rewards | hero_banner, entry_popup |

`promo_splash` and `entry_popup` are overlays: they close after `display_seconds` (1-10, default 3) or when dismissed, and follow `frequency_rule` (default `once_per_day`). `hero_banner` and `inline_banner` are part of the page: always `every_visit`, never time out. Any other page or slot is refused. Page keys are CMS names; the app maps each to its own screen (see `utils/splashRegistry.js`).

### Which campaign is shown

At the moment of the request (database clock):

1. Placements for the page and slot that are enabled, for `all` or the app's platform, and for `all` or the user's audience (signed in = `authenticated`, otherwise `guest`, taken from the verified token only).
2. The entry is published, is an image, and is live: `start_at` empty or already reached (inclusive), `end_at` empty or not yet reached (exclusive).
3. Order: higher `priority`; then a platform-specific placement before `all`; then an audience-specific one before `all`; then the later `start_at`; then the newer entry; then the older placement. The first one with usable artwork wins; a campaign whose image is missing is skipped.
4. If none: the platform-specific default, else the `all` default. `skip` shows nothing; `show_content` shows its entry only while it is published, live, an image and has artwork, re-checked on every request.
5. Otherwise nothing (`source: none`).

Expiry needs no cron: an entry stops resolving the second its `end_at` passes, and "Deactivate" in the CMS (which sets `end_at` to now) takes effect on the next request. Defaults must be evergreen: published, already started, and without an end date.

Times: `content_zone_entries` keeps `start_at`/`end_at` as the database session's local time, as the existing CMS always has; nothing is rewritten. The API converts them and returns UTC ISO 8601. Admin times sent to the API must include a zone (`2026-11-10T09:00:00+05:30`); a bare local time is refused.

### Management API (Vendor Managers only, dashboard login)

| Method and path | Purpose |
|---|---|
| `GET /content/splashscreens/pages` | Pages, slots, platforms, audiences, frequency rules, display limits |
| `GET /content/splashscreens/placements` | List; filters `status` (`live`, `scheduled`, `draft`, `expired`, `disabled`), `search` (title), `page_key`, `slot_key`, `platform`, `audience`, `is_enabled`, `content_id`; `page`, `pageSize` (max 100). Each placement has `effective_status`, `content.image_url` and `showing_now` (the platforms/audiences it actually wins right now, from the same resolver as the app); `summary` counts each status for the same filters |
| `POST /content/splashscreens/placements` | Place an entry: `content_id`, `page_key`, `slot_key`, optional `platform`, `audience`, `frequency_rule`, `display_seconds`, `is_enabled`. 409 if the same placement exists; 422 if the artwork fails its check |
| `PATCH /content/splashscreens/placements/:id` | Change `platform`, `audience`, `frequency_rule`, `display_seconds`, `is_enabled`. To move it, remove it and place again |
| `DELETE /content/splashscreens/placements/:id` | Remove the placement only; the entry stays |
| `GET /content/splashscreens/defaults` | List defaults |
| `PUT /content/splashscreens/defaults` | Create or replace one: `page_key`, `slot_key`, `platform`, `fallback_policy`, `default_content_id`. With `publish_content: true` an unpublished entry is published in the same transaction that makes it the default |
| `POST /content/splashscreens/preview` | What the app would get at `at` (ISO with zone) for `page_key`, `slot_key`, `platform`, `audience` |

Every route above requires a dashboard login with the `vendor_manager` role: admins and every other role get 403, and requests without a login get 401.

**Content used by a campaign.** An entry that is placed (`cms_splashscreen_placements`) or set as a default (`cms_splashscreen_defaults`) can be edited, published, deactivated, deleted, have its images or offer prices changed only by a Vendor Manager. Anyone else gets 403 with `code: "SPLASH_CAMPAIGN_CONTENT"`; reading it, and every entry not used by a campaign, keeps its usual permissions. A write by anyone else holds a per-entry database lock (`rp_cms_entry_<id>`) for the whole request, and placing an entry or making it a default takes the same lock, so an entry cannot become a campaign in the middle of someone else's edit. These locks use their own small connection pool (`CMS_LOCK_POOL_SIZE`, default 4).

**Splash content stays out of its CMS zone.** An entry used by a campaign is shown only through `/content/splashscreens/resolved`: it never becomes its zone's banner in `/content/resolved/*`, never counts as an overlapping entry when another banner is published, and is left out of the ordinary content lists (it is managed on the Dynamic Splash Screens page). Until the splash tables exist nothing is excluded. The CRM therefore places a **copy** when existing content is reused, and unpublishes campaign content when its last placement is removed, so it does not reappear as an ordinary banner.

In the CMS update API an empty `start_at` or `end_at` clears it (used for "No expiry").

**CRM.** Vendor Manager sidebar → Content → Dynamic Splash Screens (`/manager/content/splashscreens`), inside the vendor-manager layout; the Admin dashboard has no entry and no route.

### App API (public)

`GET /content/splashscreens/resolved?page_key=app_launch&slot_key=promo_splash&platform=android`

Send the app's access token when signed in; without it the user is a guest.

```json
{
  "success": true,
  "data": {
    "source": "scheduled_campaign",
    "page_key": "app_launch", "slot_key": "promo_splash", "platform": "android", "audience": "authenticated",
    "server_time": "2026-11-10T05:00:00.000Z",
    "expires_at": "2026-11-10T18:29:59.000Z",
    "next_change_at": null,
    "cache_ttl_seconds": 300,
    "campaign": {
      "content_id": 42, "placement_id": 7, "title": "Diwali Dhamaka", "cta_text": "Shop now",
      "image_url": "https://cdn.rewardplanners.com/public/content-zone-entries/42/splash.jpg",
      "display_mode": "single",
      "motion": { "effect": "falling_petals", "intensity": "medium", "speed": "normal" },
      "navigation": { "destination": "product_details", "targetId": 1125, "contentId": 42 },
      "link": null,
      "priority": 10,
      "starts_at": "2026-11-09T18:30:00.000Z", "expires_at": "2026-11-10T18:29:59.000Z",
      "display": { "frequency_rule": "once_per_day", "display_seconds": 3, "auto_dismiss": true, "dismissible": true }
    }
  }
}
```

`source` is `scheduled_campaign`, `default` or `none` (then `campaign` is `null`). `navigation` uses the same destinations as CMS banners; `link` is only an HTTPS link on `rewardplanners.com` (or `SPLASH_LINK_HOSTS`), otherwise `null`. Responses are `no-store`; the app may reuse one for `cache_ttl_seconds` (at most 300, shorter when the campaign ends or another starts).

### What the mobile app must do

- Call the endpoint for each page/slot it shows, with its platform and, when signed in, its token. Do not block login or startup on it: show nothing if it is slow or fails.
- Map page keys to its own screens.
- Enforce `frequency_rule` itself (session memory for `once_per_session`, persistent storage keyed by `placement_id`/`content_id` and date for `once_per_day`). The server returns the rule; it does not track what a device has seen.
- Close overlays after `display_seconds` and allow dismissing; never time out banners.
- Handle `navigation` with its existing CMS banner routing; open `link` only if present.
- If the image fails to load, show nothing.

### Rollback

Remove the eight `/splashscreens` routes (or deploy the previous build); the app then gets 404 and shows nothing. The two tables can stay, or be dropped with `DROP TABLE cms_splashscreen_placements, cms_splashscreen_defaults;` (this deletes placement and default settings only, never CMS entries).

## content_zone_entries

Every CMS banner/entry: zone, image or colour, title, CTA, target (products, category, services), schedule, priority, discount, motion.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| content_id | bigint unsigned | no |  | primary key; auto_increment |
| module | enum('product','service','payment','dineout','mobile_dashboard') | no |  |  |
| zone | enum('navbar_background','promotional_banner','offers_banner','brand_promotional_banner') | no |  |  |
| content_type | enum('color','image') | no |  |  |
| display_mode | enum('single','carousel','grid_2','grid_3') | no | carousel |  |
| color_value | text | yes |  |  |
| text_color | varchar(9) | yes |  |  |
| image_url | text | yes |  |  |
| title | varchar(255) | no |  |  |
| cta_text | varchar(255) | yes |  |  |
| redirect_link | text | yes |  |  |
| target_type | enum('product','category','subcategory','service','service_category','service_bundle') | yes |  |  |
| target_id | bigint unsigned | yes |  |  |
| target_ids | longtext | yes |  |  |
| start_at | datetime | yes |  |  |
| end_at | datetime | yes |  |  |
| priority | int | no | 0 |  |
| is_default | tinyint(1) | no | 0 |  |
| is_published | tinyint(1) | no | 0 |  |
| created_by_name | varchar(255) | yes |  |  |
| created_at | timestamp | no | CURRENT_TIMESTAMP |  |
| updated_at | timestamp | no | CURRENT_TIMESTAMP | on update CURRENT_TIMESTAMP |
| motion_effect | enum('none','falling_petals','twinkle','shine_sweep','glow_pulse','slow_zoom') | no | none |  |
| motion_intensity | enum('low','medium','high') | no | medium |  |
| motion_speed | enum('slow','normal','fast') | no | normal |  |
| discount_type | enum('none','percentage','fixed') | no | none |  |
| discount_value | decimal(12,2) | no | 0.00 |  |

Indexes: idx_content_default (is_default), idx_content_entry_target (target_type,target_id), idx_content_module_zone (module,zone), idx_content_priority (priority), idx_content_published (is_published), idx_content_schedule (start_at,end_at), PRIMARY (content_id)

## content_zone_entry_images

Slider images of an entry, each with its own optional target.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| image_id | bigint unsigned | no |  | primary key; auto_increment |
| content_id | bigint unsigned | no |  |  |
| image_url | text | no |  |  |
| sort_order | int | no | 0 |  |
| is_active | tinyint(1) | no | 1 |  |
| target_type | enum('product','category','subcategory','service','service_category','service_bundle') | yes |  |  |
| target_id | bigint unsigned | yes |  |  |
| target_ids | longtext | yes |  |  |

Indexes: idx_content_offer_target (target_type,target_id), idx_entry_images_active (content_id,is_active), idx_entry_images_content_id (content_id), idx_entry_images_sort (content_id,sort_order), PRIMARY (image_id)

## content_product_offers

Fixed offer prices for product variants inside a promotion.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| content_id | bigint unsigned | no |  | primary key |
| product_id | int | no |  |  |
| variant_id | int | no |  | primary key |
| offer_price | decimal(12,2) | no |  |  |
| created_at | timestamp | no | CURRENT_TIMESTAMP |  |
| updated_at | timestamp | no | CURRENT_TIMESTAMP | on update CURRENT_TIMESTAMP |

Indexes: fk_content_offer_variant (variant_id), idx_content_offer_product (product_id,variant_id), PRIMARY (content_id,variant_id)

## content_service_offers

Fixed offer prices for service variants inside a promotion.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| content_id | bigint unsigned | no |  | primary key |
| service_id | int | no |  |  |
| variant_id | int | no |  | primary key |
| offer_price | decimal(12,2) | no |  |  |
| created_at | timestamp | no | CURRENT_TIMESTAMP |  |
| updated_at | timestamp | no | CURRENT_TIMESTAMP | on update CURRENT_TIMESTAMP |

Indexes: fk_content_service_offer_variant (variant_id), idx_content_service_offer_service (service_id,variant_id), PRIMARY (content_id,variant_id)

## content_bundle_offers

Fixed offer prices for service bundles inside a promotion.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| content_id | bigint unsigned | no |  | primary key |
| bundle_id | int | no |  | primary key |
| offer_price | decimal(12,2) | no |  |  |
| created_at | timestamp | no | CURRENT_TIMESTAMP |  |
| updated_at | timestamp | no | CURRENT_TIMESTAMP | on update CURRENT_TIMESTAMP |

Indexes: fk_content_bundle_offer_bundle (bundle_id), PRIMARY (content_id,bundle_id)

## cms_splashscreen_placements

Where a CMS entry is shown as a splash, popup or banner: page, slot, platform, audience, frequency, duration.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | bigint unsigned | no |  | primary key; auto_increment |
| content_id | bigint unsigned | no |  |  |
| page_key | varchar(64) | no |  |  |
| slot_key | varchar(64) | no |  |  |
| platform | enum('all','android','ios') | no | all |  |
| audience | enum('all','authenticated','guest') | no | all |  |
| frequency_rule | enum('once_per_session','once_per_day','every_visit') | no | once_per_day |  |
| display_seconds | smallint unsigned | yes |  |  |
| is_enabled | tinyint(1) | no | 1 |  |
| created_at | timestamp | yes | CURRENT_TIMESTAMP |  |

Indexes: idx_screen_lookup (page_key,slot_key,is_enabled), PRIMARY (id), UNIQUE uq_campaign_placement (content_id,page_key,slot_key,platform,audience)

## cms_splashscreen_defaults

What a page/slot shows when no scheduled campaign is live: evergreen content, or nothing.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | bigint unsigned | no |  | primary key; auto_increment |
| page_key | varchar(64) | no |  |  |
| slot_key | varchar(64) | no |  |  |
| platform | enum('all','android','ios') | no | all |  |
| fallback_policy | enum('show_content','skip') | no | skip |  |
| default_content_id | bigint unsigned | yes |  |  |

Indexes: fk_screen_default_content (default_content_id), PRIMARY (id), UNIQUE uq_screen_default (page_key,slot_key,platform)

## cms_dashboard_layouts

Mobile dashboard section layout (order and visibility).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| layout_key | varchar(32) | no |  | primary key |
| version | int unsigned | no | 1 |  |
| status | enum('draft','published') | no | published |  |
| config_json | longtext | no |  |  |
| updated_by | bigint unsigned | yes |  |  |
| created_at | timestamp | no | CURRENT_TIMESTAMP |  |
| updated_at | timestamp | no | CURRENT_TIMESTAMP | on update CURRENT_TIMESTAMP |

Indexes: idx_cms_dashboard_status (status), PRIMARY (layout_key)

## module_icons

Dashboard module icons and labels.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| icon_id | bigint unsigned | no |  | primary key; auto_increment |
| module_key | varchar(50) | no |  |  |
| placement | enum('both','dashboard','navbar') | no | both |  |
| icon_type | varchar(50) | no | image |  |
| icon_url | text | yes |  |  |
| active_icon_url | text | yes |  |  |
| dashboard_icon_url | text | yes |  |  |
| normal_color | varchar(9) | yes |  |  |
| active_color | varchar(9) | yes |  |  |
| gradient_start_color | varchar(9) | yes |  |  |
| gradient_end_color | varchar(9) | yes |  |  |
| route_key | varchar(255) | yes |  |  |
| label | varchar(255) | no |  |  |
| sort_order | int | no | 0 |  |
| is_active | tinyint(1) | no | 1 |  |
| created_by_name | varchar(255) | yes |  |  |
| created_at | timestamp | no | CURRENT_TIMESTAMP |  |
| updated_at | timestamp | no | CURRENT_TIMESTAMP | on update CURRENT_TIMESTAMP |

Indexes: idx_module_icons_active (is_active), idx_module_icons_placement (placement), idx_module_icons_sort (sort_order), PRIMARY (icon_id), UNIQUE uk_module_icons_module_key (module_key)

## app_icon_campaigns

Seasonal app icon campaigns.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | int unsigned | no |  | primary key; auto_increment |
| platform | enum('ios','android') | no |  |  |
| icon_key | enum('default','diwali','eid','christmas','holi','independence_day','navratri','dasera') | no |  |  |
| starts_at | datetime(3) | no |  |  |
| ends_at | datetime(3) | no |  |  |
| priority | int | no | 0 |  |
| is_active | tinyint(1) | no | 1 |  |
| created_at | timestamp | no | CURRENT_TIMESTAMP |  |
| updated_at | timestamp | no | CURRENT_TIMESTAMP | on update CURRENT_TIMESTAMP |

Indexes: idx_app_icon_resolution (platform,is_active,starts_at,ends_at,priority), PRIMARY (id)

## content_effective_product_offers (view)

Live offer price per product variant from active promotions (fixed price, or percentage/fixed discount).

Columns: content_id (bigint unsigned), product_id (int), variant_id (int), offer_price (decimal(22,2))

## content_effective_service_offers (view)

Live offer price per service variant from active promotions.

Columns: content_id (bigint unsigned), service_id (int), variant_id (int), offer_price (decimal(22,2))
