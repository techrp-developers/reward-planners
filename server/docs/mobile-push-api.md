# Push notification APIs for the React Native app

Audience: Reward Planners React Native (Android) developers.
Postman: import `docs/postman/reward-planners-mobile-push.postman_collection.json`.
Payload format and screen routing: see `mobile-push-deep-linking.md`.

All paths are relative to the API host (local: `http://localhost:5000`). The app's
`BASE_API_URL` already ends in `/v1`, so `GET /v1/notification/my-notification`
is `${BASE_API_URL}/notification/my-notification`.

Every endpoint except login, refresh and logout needs the employee's access token:

```
Authorization: Bearer <accessToken>
```

A missing, expired, forged or wrongly signed token returns `401`. The app should
then call **refresh** once and retry.

## When the app calls what

| Moment in the app | Call |
|---|---|
| Login succeeds | `POST /v1/auth/login` then **immediately** `POST /v1/auth/update-fcm-token` (login does not take the device token) |
| App start while logged in, and on `onTokenRefresh` | `POST /v1/auth/update-fcm-token` |
| Access token expired (401) | `POST /v1/auth/refresh`, then retry |
| Inbox screen opens / pull to refresh | `GET /v1/notification/my-notification?limit=20` |
| Inbox scrolled to the end | `GET /v1/notification/my-notification?limit=20&before_id=<last id shown>` |
| Bell icon / app foreground | `GET /v1/notification/notification-badge` |
| Notification tapped (push or inbox) | `POST /v1/notification/:id/opened`, then `PUT /v1/notification/read/:id` |
| "Mark all read" | `PUT /v1/notification/read-all` |
| Swipe to delete | `DELETE /v1/notification/:id` |
| Settings screen opens / saves | `GET` / `PUT /v1/notification/preferences` |
| Logout | `POST /v1/auth/logout` with `refreshToken` **and** `fcm_token` |

## Android setup the backend relies on

- Notification channel id: **`reward_planners_general`** (the app already creates it).
- `POST_NOTIFICATIONS` runtime permission on Android 13+ (already requested).
- Every push carries `data.notification_id`; use it to mark read and report the tap.

---

## 1. Login

`POST /v1/auth/login` (no auth)

```json
{ "login": "employee@company.com", "password": "secret" }
```
`login` may be an email or phone; `email` or `phone` are accepted instead.

`200`
```json
{ "success": true, "accessToken": "eyJ...", "refreshToken": "f3a...", "firstLoginReward": { "awarded": false, "coins": 0 } }
```
Errors: `400` missing fields, `401` wrong credentials, `403` email not verified, `404` employee not found.

## 2. Refresh access token

`POST /v1/auth/refresh` (no auth)

```json
{ "refreshToken": "f3a..." }
```
`200` `{ "success": true, "accessToken": "...", "refreshToken": "..." }`. Store **both**; the
refresh token rotates. `401` means log the user out locally.

## 3. Register / update this device for push

`POST /v1/auth/update-fcm-token` (auth)

```json
{
  "fcm_token": "<token from messaging().getToken()>",
  "device_platform": "android",
  "firebase_project_id": "reward-planners-2324d"
}
```

| Field | Required | Rules |
|---|---|---|
| `fcm_token` | yes | string, at most 512 characters |
| `device_platform` | no | `android` or `ios` |
| `firebase_project_id` | recommended | the project id from the app's own `google-services.json`. Only known ids are stored; anything else is ignored |

`200`
```json
{ "success": true, "message": "FCM token updated", "firebase_project_id": "reward-planners-2324d" }
```
`firebase_project_id` is `null` when it was missing or unknown.
Errors: `400` (missing/too long token, bad platform), `401`.

Behaviour: one employee may have several devices. If the same token was registered by
another employee (shared phone), it is moved to the current employee.

## 4. Inbox list

`GET /v1/notification/my-notification?limit=20&before_id=12345` (auth)

| Query | Default | Rules |
|---|---|---|
| `limit` | 50 | 1 to 100 |
| `before_id` | none | optional. Returns notifications older than this `notification_id` (next page) |

`200`
```json
{
  "success": true,
  "data": [
    {
      "notification_id": 12345,
      "module": "ecommerce",
      "type": "order_confirmed",
      "title": "Order confirmed",
      "message": "Your order #42 is confirmed.",
      "icon": "bag",
      "reference_type": "order",
      "reference_id": "42",
      "action_url": "/orders/order-details/42",
      "metadata": { "target_route": { "path": ["App", "Orders"], "params": {} } },
      "priority": "normal",
      "is_read": 0,
      "created_at": "2026-10-29 10:15:00"
    }
  ]
}
```
Newest first. Fewer items than `limit` means there are no more pages.
Errors: `400` invalid `before_id`, `401`.

## 5. Unread badge

`GET /v1/notification/notification-badge` (auth)

`200` `{ "success": true, "count": 3 }`

## 6. Mark one as read

`PUT /v1/notification/read/:notification_id` (auth, no body)

`200` `{ "success": true, "message": "Notification marked as read" }`
`404` when the notification does not exist **or belongs to someone else**.

## 7. Mark all as read

`PUT /v1/notification/read-all` (auth, no body)

`200` `{ "success": true, "message": "All notifications marked as read" }`

## 8. Delete one

`DELETE /v1/notification/:notification_id` (auth)

`200` `{ "success": true, "message": "Notification deleted" }`, `404` if not the owner's.

## 9. Report a tap (analytics)

`POST /v1/notification/:notification_id/opened` (auth)

```json
{ "app_state": "background", "outcome": "opened_target", "destination_type": "product" }
```

| Field | Values |
|---|---|
| `app_state` | `foreground`, `background`, `terminated`, `inbox` |
| `outcome` | `opened_target` (default), `fallback`, `login_required` |
| `destination_type` | the `destination_type` from the push data, optional |

`200` `{ "success": true, "recorded": true }`. `recorded` is `false` for a repeated tap
(counted once). `404` if the notification is not the employee's. Fire and forget: never
block navigation on it.

## 10. Notification preferences

`GET /v1/notification/preferences` (auth)

`200`
```json
{
  "success": true,
  "data": {
    "language": "en",
    "marketing_enabled": false,
    "engagement_enabled": false,
    "quiet_hours_start": null,
    "quiet_hours_end": null,
    "stored": false
  }
}
```
`stored: false` means the employee never saved preferences (defaults shown).

`PUT /v1/notification/preferences` (auth). Send only the fields that changed:

```json
{ "language": "hi", "marketing_enabled": true, "quiet_hours_start": "22:00", "quiet_hours_end": "07:00" }
```

| Field | Rules |
|---|---|
| `language` | `en`, `hi`, `mr`. Pushes are rendered in it |
| `marketing_enabled`, `engagement_enabled` | `true` / `false`. Off by default: promotional pushes need opt-in |
| `quiet_hours_start`, `quiet_hours_end` | `HH:MM` or `null`; must be sent together |

`200` returns the same shape as GET. `400` with `errors` for invalid fields.
Transactional notifications (orders, payments, refunds) ignore these settings.

## 11. Logout

`POST /v1/auth/logout` (access token optional)

```json
{ "refreshToken": "f3a...", "fcm_token": "<this device's token>" }
```

Always send both:
- with `fcm_token`, only **this** device stops receiving pushes; the employee's other phones keep working
- without it (current app builds), **all** of the employee's devices are signed out of pushes
- an expired access token is fine: the employee is identified from `refreshToken`

`200` `{ "success": true, "message": "Logged out successfully" }`. Clear local storage
regardless of the response.

---

## Not for the mobile app

`/api/crm/v1/rm/notifications/*` and `/api/crm/v1/rm/assignments/*` are the CRM
dashboard (RM/admin) APIs. They use dashboard session auth and reject employee tokens.
