// One dispatcher for every notification tap: foreground (Notifee), background
// and terminated (FCM), and inbox items. The backend sends a full navigator
// path in `target_route` (e.g. ["App","Home","ProductModule","Home"]); only
// paths in ALLOWED_ROUTES are ever navigated to, with validated params.
import { CommonActions, createNavigationContainerRef } from "@react-navigation/native";
import api from "../auth/api/axios";

export const navigationRef = createNavigationContainerRef<any>();

export type PushData = Record<string, string | undefined>;
export type TapSource = "foreground" | "background" | "terminated" | "inbox";
type Route = { path: string[]; params: Record<string, unknown> };

const num = (value: unknown) => (/^\d{1,12}$/.test(String(value ?? "")) ? Number(value) : undefined);
const str = (value: unknown) => (typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : undefined);

// Route path -> params it may carry (anything else is dropped). Mirrors the
// app's navigators (RootNavigator AppStack, MainLayout ModuleStack, stacks).
const ALLOWED_ROUTES: Record<string, (params: Record<string, unknown>) => Record<string, unknown> | null> = {
  "App>Dashboard": () => ({}),
  "App>Notification": () => ({}),
  "App>MyTickets": () => ({}),
  "App>Profile": () => ({}),
  "App>Cart": () => ({}),
  "App>Orders": () => ({}),
  "App>Quiz": () => ({}),
  "App>TodoList": () => ({}),
  "App>WalletHistory": () => ({}),
  "App>ProductDetails": (p) => (num(p.productId) ? { productId: num(p.productId) } : null),
  "App>RewardStack>Dashboard": () => ({}),
  "App>Chat>ChatInbox": () => ({}),
  "App>Home>ProductModule>Home": () => ({}),
  "App>Home>ProductModule>Category": (p) => (num(p.categoryId) ? { categoryId: num(p.categoryId), title: typeof p.title === "string" ? p.title.slice(0, 80) : "" } : null),
  "App>Home>ServicesModule>Home": () => ({}),
  "App>Home>ServicesModule>MyOrder": () => ({}),
  "App>Home>ServicesModule>ServiceDescription": (p) => (num(p.serviceId) ? { serviceId: num(p.serviceId) } : null),
  "App>Home>ServicesModule>ServiceOrderDetail": (p) => (str(p.parent_order_id) ? { parent_order_id: str(p.parent_order_id) } : null),
  "App>Home>PaymentsModule>Home": () => ({}),
  "App>Home>DineOutModule>BookingHomeScreen": () => ({}),
  "App>Home>DineOutModule>BusOrdersScreen": () => ({}),
  "App>Home>DineOutModule>BusOrderDetailScreen": (p) => (str(p.orderRef) ? { orderRef: str(p.orderRef) } : null),
};

const INBOX: Route = { path: ["App", "Notification"], params: {} };

/** Parse and validate a route (JSON string or object). Unknown paths -> null. */
export function parseRoute(raw: unknown): Route | null {
  let value: any = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw); } catch { return null; }
  }
  if (!value || !Array.isArray(value.path)) return null;
  const key = value.path.join(">");
  const validate = ALLOWED_ROUTES[key];
  if (!validate) return null;
  const params = validate(value.params && typeof value.params === "object" ? value.params : {});
  return params ? { path: [...value.path], params } : null;
}

// navigate("App", { screen: "Home", params: { screen: "ProductModule", params: { screen: "Home", params } } })
function nestedAction({ path, params }: Route) {
  let nested: Record<string, unknown> | undefined = Object.keys(params).length ? params : undefined;
  for (let index = path.length - 1; index >= 1; index -= 1) {
    nested = { screen: path[index], ...(nested ? { params: nested } : {}) };
  }
  return CommonActions.navigate({ name: path[0], params: nested });
}

// Two listeners can report the same tap (e.g. FCM + Notifee initial
// notification). Suppress repeats briefly, never permanently; inbox taps are
// always honoured.
const DEDUPE_MS = 30_000;
const recentTaps = new Map<string, number>();
function isRepeatTap(key: string | undefined) {
  if (!key) return false;
  const now = Date.now();
  for (const [tapKey, at] of recentTaps) if (now - at > DEDUPE_MS) recentTaps.delete(tapKey);
  if (recentTaps.has(key)) return true;
  recentTaps.set(key, now);
  return false;
}

let pending: { data: PushData; source: TapSource; tapKey?: string } | null = null;

// "App" exists only after login + accepted terms (RootNavigator).
function appReady() {
  return navigationRef.isReady() && Boolean(navigationRef.getRootState()?.routeNames?.includes("App"));
}

export function openFromNotification(data: PushData | undefined, source: TapSource, tapKey?: string) {
  if (!data) return;
  if (!appReady()) {
    pending = { data, source, tapKey }; // replayed after login/terms by flushPendingNotification
    return;
  }
  if (source !== "inbox" && isRepeatTap(data.notification_id || tapKey)) return;

  // Params come only from the validated route; reference_id is never merged in.
  const target = parseRoute(data.target_route);
  const route = target || parseRoute(data.fallback_route) || INBOX;
  navigationRef.dispatch(nestedAction(route));

  const notificationId = num(data.notification_id);
  if (notificationId && source !== "inbox") {
    api.put(`/v1/notification/read/${notificationId}`).catch(() => {});
  }
  if (notificationId) {
    api.post(`/v1/notification/${notificationId}/opened`, {
      app_state: source,
      outcome: target ? "opened_target" : "fallback",
      destination_type: data.destination_type,
    }).catch(() => {});
  }
}

/** Call from NavigationContainer onReady/onStateChange (e.g. right after login). */
export function flushPendingNotification() {
  if (!pending || !appReady()) return;
  const next = pending;
  pending = null;
  openFromNotification(next.data, next.source, next.tapKey);
}
