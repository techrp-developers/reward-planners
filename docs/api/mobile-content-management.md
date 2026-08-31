# Mobile Content Management API

Use this API from the mobile app to fetch all CMS-driven display content in one call:

```http
GET /v1/cms/mobile-content
```

No auth is required.

## Optional Filters

Fetch every supported mobile module:

```http
GET /v1/cms/mobile-content
```

Fetch one module:

```http
GET /v1/cms/mobile-content?module=product
```

Fetch selected modules:

```http
GET /v1/cms/mobile-content?modules=mobile_dashboard,product,service
```

Supported CMS content modules are:

- `mobile_dashboard`
- `product`
- `service`
- `payment`
- `dineout`

## Response Shape

```json
{
  "success": true,
  "message": "Mobile content fetched successfully",
  "data": {
    "modules": [
      {
        "moduleKey": "product",
        "label": "Product",
        "iconUrl": "https://api.example.com/uploads/module-icons/product-icon.png",
        "activeIconUrl": "https://api.example.com/uploads/module-icons/product-active.png",
        "normalColor": "#6B7280",
        "activeColor": "#852BAF",
        "gradientStartColor": "#852BAF",
        "gradientEndColor": "#FF6B00",
        "routeKey": "ProductModule",
        "sortOrder": 0
      }
    ],
    "content": {
      "product": {
        "navbar_background": {
          "contentId": 1,
          "module": "product",
          "zone": "navbar_background",
          "type": "color",
          "title": "Default Navbar",
          "ctaText": null,
          "redirectLink": null,
          "colorValue": "#852BAF",
          "imageUrl": null,
          "status": "default",
          "priority": 0,
          "startAt": null,
          "endAt": null
        },
        "promotional_banner": {
          "contentId": 8,
          "module": "product",
          "zone": "promotional_banner",
          "type": "image",
          "title": "Festival Sale",
          "ctaText": "Shop Now",
          "redirectLink": "rewardplanners://product/offers",
          "colorValue": null,
          "imageUrl": "https://api.example.com/uploads/content-zone-entries/8/content.jpg",
          "status": "active",
          "priority": 10,
          "startAt": "2026-08-01T00:00:00.000Z",
          "endAt": "2026-09-01T00:00:00.000Z"
        },
        "offers_banner": {
          "contentId": 9,
          "module": "product",
          "zone": "offers_banner",
          "type": "image",
          "title": "Top Offers",
          "ctaText": null,
          "redirectLink": null,
          "colorValue": null,
          "imageUrl": null,
          "status": "active",
          "priority": 5,
          "startAt": "2026-08-01T00:00:00.000Z",
          "endAt": "2026-09-01T00:00:00.000Z",
          "images": [
            {
              "imageId": 21,
              "imageUrl": "https://api.example.com/uploads/content-zone-entries/9/offer-1.jpg",
              "sortOrder": 0
            }
          ]
        }
      }
    },
    "fetchedAt": "2026-08-29T10:00:00.000Z"
  }
}
```

## Mobile Rendering Mapping

- `data.modules`: render the module icon navbar. Use `iconUrl` for inactive icons and `activeIconUrl` when present for the selected module.
- `content.<module>.navbar_background`: render the navbar/header background. If `type` is `color`, use `colorValue`; if `type` is `image`, use `imageUrl`.
- `content.<module>.promotional_banner`: render the main promotional banner. It is `null` when no active campaign is published.
- `content.<module>.offers_banner.images`: render the offer carousel/list. It is `null` when no active offers campaign is published.

Images are returned as absolute URLs. For physical mobile device testing on a local network, set `PUBLIC_BASE_URL` on the backend to the machine's LAN URL, for example:

```env
PUBLIC_BASE_URL=http://192.168.1.10:5000
```
