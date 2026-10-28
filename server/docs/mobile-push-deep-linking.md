# Rich push notifications & deep linking — mobile implementation spec

Audience: React Native developers of the Reward Planners app (`C:\Projects\RewardsPlanners`).
Status: **backend and dashboard implemented; nothing below is implemented or tested in the app yet.**
Navigator verified against the repo on 2026-10-27 (`App.tsx`, `src/navigation/RootNavigator.tsx`,
`src/navigation/MainLayout.tsx`, module stacks). Re-check before shipping if navigation changed.

## 1. The real navigator (what routes must target)

```
NavigationContainer (App.tsx, linking prefixes rewardplanners:// rewardapp://)
└─ RootStack (conditional): Splash | Auth | TermsGate | App      ← "App" exists only when logged in,
   └─ App = AppStack                                               terms accepted (and biometric cleared)
      ├─ Dashboard, Notification (inbox), ProductDetails{productId}, Cart, Orders, Profile, Quiz,
      │  TodoList, WalletHistory, MyTickets, HelpForm, RewardStack, Chat, ServiceStack, ...
      ├─ RewardStack → Dashboard (RP Move)
      ├─ Chat → ChatInbox, ChatConversation{conversation}
      └─ Home = MainLayout → ModuleStack
         ├─ ProductModule  (ecommerce HomeStack): Home, Category{categoryId,title}, ProductDescription{productId}, Cart, MyOrder, ...
         ├─ ServicesModule (ServiceHomeStack):     Home, ServiceDescription{serviceId}, ServiceOrderDetail{parent_order_id}, MyOrder, ...
         ├─ PaymentsModule (BBPSHomeStack):        Home, BillDetailsScreen, ...
         └─ DineOutModule  (BusBookingStack):      BookingHomeScreen, BusOrdersScreen, BusOrderDetailScreen{orderRef}, ...
```

Note: the inbox screen is `Notification` (singular). The current `PushNotificationManager.tsx`
always opens it and ignores the payload; that keeps working until the dispatcher below ships.

## 2. Payload contract (FCM `data`, all values are strings)

| Key | Example | Notes |
|---|---|---|
| `target_route` | `{"path":["App","Home","ProductModule","Home"],"params":{}}` | **Primary.** Full navigator path + params (JSON). Present on campaigns and, derived from `screen`, on system notifications. |


| `fallback_route` | `{"path":["App","Notification"],"params":{}}` | Open when the target is missing/unavailable (JSON). |
| `screen` / `target_screen` | `Home` | Leaf name only; kept for old builds. Do not navigate with it. |
| `destination_type` | `product` | Registry key (§3). |
| `target_params` | `{"productId":42}` | Flat params (also inside `target_route`). |
| `notification_id` | `12345` | Inbox row id: de-duplicate, mark read, report the tap. |
| `campaign_id`, `media_type`, `image_url`, `language`, `deep_link`, `module`, `type`, `reference_type`, `reference_id` | | `deep_link` (`rp://…`) is informational only. |

## 3. Routing table (backend registry → real paths)

| destination_type | path | params | status |
|---|---|---|---|
| home | App › Dashboard | – | verified |
| notifications | App › Notification | – | verified |
| support | App › MyTickets | – | verified |
| ecommerce_home | App › Home › ProductModule › Home | – | verified |
| product | App › ProductDetails | productId (number) | verified |
| product_category | App › Home › ProductModule › Category | categoryId, title | verified |
| cart | App › Cart | – | verified |
| order_details (owner only) | App › Orders | – | verified (list) |
| service_home | App › Home › ServicesModule › Home | – | verified |
| service | App › Home › ServicesModule › ServiceDescription | serviceId (number) | verified |
| service_order (owner only) | App › Home › ServicesModule › ServiceOrderDetail | parent_order_id | verified |
| bus_search | App › Home › DineOutModule › BookingHomeScreen | – | verified |
| bus_my_bookings | App › Home › DineOutModule › BusOrdersScreen | – | verified |
| bus_booking (owner only) | App › Home › DineOutModule › BusOrderDetailScreen | orderRef | verified |
| bbps_home | App › Home › PaymentsModule › Home | – | verified |
| fitness_dashboard | App › RewardStack › Dashboard | – | verified |
| games_home, quiz | App › Quiz | – | verified |
| wallet | App › WalletHistory | – | verified |
| todo_list | App › TodoList | – | verified |
| chat_home | App › Chat › ChatInbox | – | verified |
| announcements, events, product_collection, service_category, bbps_transaction | – | – | **not in app** → backend sends the module fallback route |

System notifications: `screen` values map to routes (`EcommerceHome`→ProductModule Home,
`ServiceOrderDetails`→ServicesModule MyOrder, `Notifications`→Notification, …).

## 4. Shared notification dispatcher (reference implementation, corrected)

Fixes over the earlier draft: (1) no de-dupe key built from missing fields; (2) route params are never
overwritten by `reference_id`; (3) de-duplication expires instead of suppressing a notification forever;
(4) nested routes are navigated through their parents and checked against the mounted tree.

```ts
// src/modules/common/notifications/notificationRouting.ts
import { CommonActions, createNavigationContainerRef } from "@react-navigation/native";
export const navigationRef = createNavigationContainerRef<any>();

type Data = Record<string, string | undefined>;
type Route = { path: string[]; params?: Record<string, unknown> };
const INBOX: Route = { path: ["App", "Notification"] };

// Allow-list of first segments + leaf screens the app really has (§3). A route
// outside it is never navigated to.
const ALLOWED_LEAVES = new Set([
  "Dashboard", "Notification", "MyTickets", "ProductDetails", "Cart", "Orders", "Quiz", "TodoList",
  "WalletHistory", "Profile", "Home", "Category", "ServiceDescription", "ServiceOrderDetail", "MyOrder",
  "BookingHomeScreen", "BusOrdersScreen", "BusOrderDetailScreen", "ChatInbox",
]);

function parseRoute(raw?: string): Route | null {
  try {
    const value = JSON.parse(raw || "null");
    if (!value || !Array.isArray(value.path) || value.path[0] !== "App" || value.path.length > 4) return null;
    if (!value.path.every((part: unknown) => typeof part === "string" && /^[A-Za-z]+$/.test(part))) return null;
    if (!ALLOWED_LEAVES.has(value.path[value.path.length - 1])) return null;
    return { path: value.path, params: value.params && typeof value.params === "object" ? value.params : {} };
  } catch { return null; }
}

// Fix (4): build navigate("App", {screen:"Home", params:{screen:"ProductModule", params:{screen:"Home", params}}}).
function toNestedAction({ path, params }: Route) {
  let nested: Record<string, unknown> | undefined = params;
  for (let index = path.length - 1; index >= 1; index -= 1) nested = { screen: path[index], params: nested };
  return CommonActions.navigate({ name: path[0], params: nested });
}

// Fix (1)+(3): only real ids, and only for a short window (two listeners can
// deliver the same tap); later taps of the same notification work again.
const recent = new Map<string, number>();
const DEDUPE_MS = 30_000;
function isDuplicate(key: string | undefined) {
  if (!key) return false;
  const now = Date.now();
  for (const [k, at] of recent) if (now - at > DEDUPE_MS) recent.delete(k);
  if (recent.has(key)) return true;
  recent.set(key, now);
  return false;
}

let pending: { data: Data; appState: string } | null = null;

export function openFromNotification(data: Data, appState: "foreground" | "background" | "terminated" | "inbox", opts: { messageId?: string; isLoggedIn: () => boolean }) {
  // "App" is only mounted after login + terms (+ biometric): wait for it.
  const appMounted = navigationRef.isReady() && navigationRef.getRootState()?.routeNames?.includes("App");
  if (!opts.isLoggedIn() || !appMounted) { pending = { data, appState }; return; }
  if (appState !== "inbox" && isDuplicate(data.notification_id || opts.messageId)) return;

  // Fix (2): params come only from target_route, which the backend fills with
  // the correct id for that screen (productId, parent_order_id, orderRef...).
  // reference_id is never merged in, so it can never overwrite them.
  const target = parseRoute(data.target_route);
  const route = target || parseRoute(data.fallback_route) || INBOX;
  navigationRef.dispatch(toNestedAction(route));

  if (data.notification_id) {
    api.post(`/v1/notification/${data.notification_id}/opened`, {
      app_state: appState, outcome: target ? "opened_target" : "fallback", destination_type: data.destination_type,
    }).catch(() => {});
  }
}

// Call from <NavigationContainer onReady> and whenever auth/terms state becomes ready.
export function flushPendingNotification(isLoggedIn: () => boolean) {
  if (!pending) return;
  const next = pending;
  pending = null;
  openFromNotification(next.data, next.appState as any, { isLoggedIn });
}
```

Rules:
- Every handler calls `openFromNotification`: `onNotificationOpenedApp` (background), `getInitialNotification`
  (terminated, pass `remoteMessage.messageId`), Notifee `onForegroundEvent`/`onBackgroundEvent` PRESS, inbox taps (`"inbox"`, never de-duplicated).
- Readiness = `NavigationContainer onReady` + `App` in `routeNames`; **no `setTimeout`** (the current file uses 250 ms timers).
- Target screens load data through their normal authenticated APIs; a 403/404 (not owner, product delisted)
  must show the screen's empty state or navigate to `Notification`.
- Keep the existing chat handling (`chatSocket.requestResync()` on `chat_message`).
- Register Notifee `onBackgroundEvent` and `setBackgroundMessageHandler` in `index.js` before `AppRegistry.registerComponent`.

## 5. Android

- Background/terminated: FCM displays the notification (incl. image). Do **not** also display it with Notifee.
- Foreground (`onMessage`): display once with Notifee; when `data.image_url` is present use
  `style: { type: AndroidStyle.BIGPICTURE, picture: data.image_url }` and `largeIcon`. Text-only otherwise.
- Channel `reward_planners_general` (HIGH) and `POST_NOTIFICATIONS` on Android 13+ already exist in the app.

## 6. iOS

- Images need a **Notification Service Extension** using `[[FIRMessaging extensionHelper] populateNotificationContent:… withContentHandler:…]`.
  One NSE only. Backend already sends `mutable-content: 1` and `fcm_options.image` (`.jpg`, `image/jpeg`, ≤ 300 KB).
- APNs key uploaded to Firebase project `reward-planners-2324d`; Push + Background Modes capabilities; physical device.

## 7. Language and consent

Call `PUT /v1/notification/preferences` when the user changes language, and expose marketing/engagement
opt-in toggles. The backend treats **no preference row as no consent**: until the app saves opt-ins,
employees receive no marketing/engagement pushes (cart, price-drop, RP Move nudges, birthday prompts,
promotional campaigns). Transactional notifications are unaffected.

## 8. Device test matrix (to be executed on real devices; none run yet)

| Case | Android | iOS |
|---|---|---|
| Foreground with image (one notification) | ☐ | ☐ |
| Background / terminated tap opens target | ☐ | ☐ |
| Broken image → text only | ☐ | ☐ |
| EN / HI / MR text | ☐ | ☐ |
| Product, category, service, bus, BBPS, quiz, wallet, chat routes | ☐ | ☐ |
| Logged out / terms gate → after login lands on target | ☐ | ☐ |
| Not owner / delisted product → fallback | ☐ | ☐ |
| Same tap via two handlers → navigates once; same notification from inbox later → opens | ☐ | ☐ |
| Chat, inbox and unread badge unchanged | ☐ | ☐ |
