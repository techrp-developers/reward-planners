# Android notification permission & channels: handoff (2026-10-30)

For the React Native team. Not applied to `RewardsPlanners`, and not compiled or run against
it. Checked by reading the app's working tree on 2026-10-30.

## 1. Defect: Android 13+ is never asked for permission

`requestNotificationPermission()` in `src/modules/common/notifications/pushPermission.ts` is
exported, but nothing calls it. Android 13 and later deny `POST_NOTIFICATIONS` until the app
asks for it, so on those phones every push (system tray or Notifee) is silently dropped.
Android 12 and lower are unaffected, because notifications are on by default there.

### Fix
1. Copy `new-files/NotificationPermissionSheet.tsx` to `src/modules/common/notifications/`.
2. In `pushPermission.ts`, let the caller supply the explanation instead of `Alert.alert`:
   ```ts
   export const requestNotificationPermission = async ({
     confirm = confirmRationale,
   }: { confirm?: () => Promise<boolean> } = {}) => { /* unchanged, but call confirm() */ };
   ```
3. In `PushNotificationManager.tsx`, once the user is logged in, has accepted the terms and the
   dashboard has rendered (not at app launch, and not on the login screen):
   ```tsx
   const [askVisible, setAskVisible] = useState(false);
   const answer = useRef<(ok: boolean) => void>();
   useEffect(() => {
     if (!dashboardReady) return;
     getNotificationPermissionState().then((state) => {
       if (state !== "not_requested") return;            // asked once already, or granted
       requestNotificationPermission({
         confirm: () => new Promise((resolve) => { answer.current = resolve; setAskVisible(true); }),
       }).then(() => registerPushToken());                 // existing registration
     });
   }, [dashboardReady]);
   // ...
   <NotificationPermissionSheet visible={askVisible}
     onEnable={() => { setAskVisible(false); answer.current?.(true); }}
     onNotNow={() => { setAskVisible(false); answer.current?.(false); }} />
   ```
   The existing `PROMPTED_KEY` already ensures the user is asked once at most.
   After that, the Notification settings screen (which already rechecks on resume) is the way
   back, through "Open Notification Settings".
4. Granting the OS permission must **not** change `marketing_enabled` or `engagement_enabled`.
   The sheet says that offers stay off until the user turns them on.

On Android 12 and lower, `getNotificationPermissionState()` returns `granted` or `denied` and
never `not_requested`, so the sheet does not appear; "denied" there means the user switched
notifications off in Settings.

## 2. Channels and heads-up (server side is live in the backend working tree)

The backend (`server/app/common/utils/notificationPayload.js`) now picks the channel and priority
from the notification's category. Both `android.notification.channel_id` (used when Android renders
the notification itself in the background) and `data.android_channel_id` (for the foreground
Notifee display) carry the **same** id.

| Category | Android channel id | Importance (app creates) | FCM priority | iOS `apns-priority` | iOS `interruption-level` | Sound |
|---|---|---|---|---|---|---|
| Operational: orders, payments, bookings, chat, account, other system events | `reward_planners_general` | HIGH (existing) | high | 10 | active | yes |
| `engagement`, `announcement` | `reward_planners_updates` | DEFAULT | normal | 5 | active | yes |
| `marketing` | `reward_planners_offers` | LOW | normal | 5 | passive | no |

iOS also gets `thread-id` set to the same id, so each kind groups together in Notification Centre.
`passive` delivers quietly (no sound, no banner, no screen wake) and needs no entitlement. We
don't use `time-sensitive`, because it needs the Time Sensitive Notifications capability.

### App changes needed
- In `ensureNotificationChannels()`, also create:
  - `reward_planners_updates`, named "Updates & announcements", DEFAULT importance.
  - `reward_planners_offers`, named "Offers & promotions", LOW importance.

  Don't change or recreate `reward_planners_general`. Android keeps whatever settings the user
  chose for a channel, and an app can't raise them.
- `buildLocalNotification`: use `message.data.android_channel_id` if the app created that channel,
  otherwise `GENERAL_CHANNEL_ID`.
- Older builds that don't have the new channels: Android shows those notifications on the
  manifest default channel (`reward_planners_general`), so nothing is lost. Promotions will just
  look more prominent there until users update.
- iOS: request authorization with `alert`, `badge` and `sound`. No provisional or
  time-sensitive entitlement is needed. Passive offers land in Notification Centre without a
  banner.

Heads-up banners appear only if: the channel's effective importance is HIGH, the app's
notifications are allowed, the channel isn't blocked, Do Not Disturb or focus mode isn't
suppressing it, and the manufacturer lets the app float notifications. On vivo this is a
separate per-app "Floating notifications" / "Banner" switch. The app can't force any of these
on.

## 3. QA checklist (physical device)
1. Android 13+: a fresh install, then log in. The sheet appears once on the dashboard. "Enable"
   shows the system dialog. Kill and reopen the app: no second prompt.
2. Choose "Not Now", then open Settings → "Open Notification Settings". It goes to the app's
   Android page. Enable notifications there, return, and the status shows Enabled.
3. vivo V2030 (Android 12): there's no prompt. Check Settings → Notifications → Reward
   Planners → General notifications, including Floating/Banner.
4. Token registration: the device appears in `user_push_tokens` with
   `firebase_project_id = reward-planners-2324d`.
5. Do each of foreground, background and terminated with an **approved single-device
   transactional test send**, not a marketing campaign: exactly one notification appears, and
   tapping it opens the right screen, marks it read and updates the badge.
