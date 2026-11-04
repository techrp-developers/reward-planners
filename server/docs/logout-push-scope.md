# Logout and push tokens: `push_scope`

`POST /v1/auth/logout` used to deactivate **every** device of an employee when
`fcm_token` was missing. The optional `push_scope` field makes the intent explicit.

## Contract

```json
{ "refreshToken": "<refresh-token>", "fcm_token": "<token-or-null>", "push_scope": "device" }
```

The user always comes from the verified access token or the refresh session.
`user_id` or `role` in the body are ignored. Token values are never audited.

| `push_scope` | Session | Push tokens |
|---|---|---|
| `device` | Revokes this refresh session | Deactivates only the reported token of this user. No token, or the placeholder, deactivates nothing |
| `all_devices` | Revokes all of the user's refresh sessions | Deactivates all of the user's devices |
| not sent | Revokes this refresh session | Unchanged legacy behaviour (see below) |
| anything else | Nothing changes | Nothing changes (`400 INVALID_PUSH_SCOPE`) |

`device` response:

```json
{ "success": true, "message": "Logged out successfully", "push_scope": "device", "session_revoked": true, "device_token_deactivated": false }
```

`all_devices` response adds `sessions_revoked` and `devices_deactivated`.

### Refusals

Nothing is changed by any of these.

| Status | Code | When |
|---|---|---|
| 401 | `AUTH_REQUIRED` | `all_devices` without a verified Bearer access token |
| 403 | `SESSION_REQUIRED` | `all_devices` without a live refresh session of that same user |
| 403 | `SESSION_MISMATCH` | `device` with an access token and a refresh session of different users |

`all_devices` is meant for a separate "log out of all devices" control, never
for the normal logout button. Access tokens already issued stay valid until they
expire (15 minutes), because access tokens are not checked against sessions.

`device` works without a valid access token, as logout must: the refresh session
identifies the user. With no usable session, the FCM token alone may deactivate
itself, because holding that unguessable token proves the device.

## Requests without `push_scope`

Kept exactly as released, so no installed app changes behaviour:

| Client sends | Result |
|---|---|
| A real `fcm_token` | That device only |
| `fcm_token: "no-device-token"` (current app) | Matches no row, so no device is deactivated |
| No `fcm_token` (older builds) | **Every device of the employee is deactivated** |

The last row is the original problem, kept on purpose for now. The server cannot
tell which phone sent such a request (`customer.fcm_token` only holds the most
recently registered device), so skipping the deactivation would leave a
logged-out old build receiving that account's pushes. Retire it only once the
audit below shows it is safe.

## Measuring old builds

Every unscoped logout writes a `logout_unscoped` row to
`notification_campaign_audit_logs`, with `token_state` (`token`, `placeholder`
or `none`) and the user agent.

```sql
SELECT JSON_VALUE(details, '$.token_state') AS token_state,
       JSON_VALUE(details, '$.user_agent') AS user_agent,
       COUNT(*) AS logouts, MAX(created_at) AS latest
FROM notification_campaign_audit_logs
WHERE action = 'logout_unscoped' AND created_at >= NOW() - INTERVAL 30 DAY
GROUP BY token_state, user_agent
ORDER BY logouts DESC;
```

## Rollout

Order matters: each step is safe only after the one before it.

1. **Deploy this backend.** Installed apps are unaffected, because they do not send `push_scope`.
2. **Release the mobile apps**, sending `push_scope: "device"` on every logout. Keep `getLogoutFCMToken()` falling back to the placeholder in this release: an app could otherwise reach a backend that has not been deployed yet.
3. **After the backend is confirmed live everywhere**, change the app to send `fcm_token: null` instead of `no-device-token`, and delete the placeholder. With `push_scope: "device"` this is safe, and an older backend would not be. Do not remove the placeholder before this point.
4. **Watch `logout_unscoped`** until `token_state = none` has stopped, with a minimum-version prompt for remaining old builds if needed.
5. **Then decide what unscoped requests do**, for example treating them as `device`. That is a separate, deliberate change.

The server keeps recognising the placeholder under `device` scope and will
deactivate nothing for it, so older releases from step 2 stay safe after step 3.
