# Mobile push notification handoff (for the React Native team)

These are suggested changes for the separate React Native app (`RewardsPlanners`).
They were prepared alongside the backend work and are **not applied** to the app.
Full contract and routing table: `../mobile-push-deep-linking.md`.

## Contents
- `mobile-push-changes.patch` — edits to existing files: `App.tsx`, `index.js`,
  `AuthContext.tsx`, `PushNotificationManager.tsx`, `Notification.tsx`, `RootNavigator.tsx`.
- `new-files/` — files to add:
  - `notificationRouting.ts` → `src/modules/common/notifications/`
  - `NotificationSettings.tsx`, `notificationPreferencesAPI.ts` → `src/modules/dashboard/notification/`
  - `NotificationPermissionSheet.tsx` → `src/modules/common/notifications/` (see
    `notification-permission-and-channels.md`: Android 13+ is never asked for permission today)

## Apply (from the app repo root)
```
git apply --check path/to/mobile-push-changes.patch
git apply path/to/mobile-push-changes.patch
```
then copy the three new files into the folders above.

## What it does
- One tap dispatcher for foreground/background/terminated/inbox taps using the backend's
  `target_route` (allow-listed nested paths, waits for login + terms, safe fallback, marks read,
  reports `POST /v1/notification/:id/opened`).
- Sends `firebase_project_id` with `POST /v1/auth/update-fcm-token`; sends `fcm_token` on logout.
- Foreground big-picture image notifications with Notifee (no duplicates in background).
- Notification settings screen: language (en/hi/mr), marketing and engagement opt-ins
  (off by default), quiet hours → `PUT /v1/notification/preferences`.

Checked against the app as of 2026-10-28: TypeScript 0 errors, ESLint clean on changed files,
Gradle `processDebugGoogleServices` passed. Not tested on a device.
