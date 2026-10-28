// Approved in-app destinations for notifications. The dashboard only offers
// these keys, the backend validates them, and the push payload carries the
// resolved route + params + fallback. Nothing navigates to a free-form URL.
//
// Routes are full React Navigation paths from the mobile app's navigator tree
// (C:\Projects\RewardsPlanners, read 2026-10-27):
//   Root (Splash | Auth | TermsGate | App)
//   App  = AppStack: Dashboard, Home(MainLayout), ProductDetails, Cart, Orders,
//          Profile, Quiz, TodoList, WalletHistory, Notification, MyTickets,
//          HelpForm, RewardStack, Chat, ServiceStack, BBPSHomeStack, ...
//   Home = ModuleStack: ProductModule (ecommerce HomeStack), ServicesModule
//          (ServiceHomeStack), PaymentsModule (BBPSHomeStack), DineOutModule
//          (BusBookingStack)
// mobileRoute "verified" = the screen exists in that tree; "not_in_app" = no
// such screen yet, so the app opens `fallback`.
//
// campaignAllowed=false marks private, per-owner destinations (orders,
// bookings, transactions): only backend events for the owner may use them.

const APP = "App";
const PRODUCT = [APP, "Home", "ProductModule"];
const SERVICES = [APP, "Home", "ServicesModule"];
const PAYMENTS = [APP, "Home", "PaymentsModule"];
const BUS = [APP, "Home", "DineOutModule"];

const route = (path, params) => ({ path, params: params || (() => ({})) });

const MODULE_FALLBACK_ROUTES = {
  common: [APP, "Notification"],
  ecommerce: [...PRODUCT, "Home"],
  service: [...SERVICES, "Home"],
  bbps: [...PAYMENTS, "Home"],
  busbooking: [...BUS, "BookingHomeScreen"],
  fitness: [APP, "RewardStack", "Dashboard"],
  games: [APP, "Quiz"],
  wallet: [APP, "WalletHistory"],
  todo: [APP, "TodoList"],
  birthday: [APP, "Notification"],
  chat: [APP, "Chat", "ChatInbox"],
};

const DESTINATIONS = [
  // Common
  { key: "home", module: "common", label: "Home", route: route([APP, "Dashboard"]), deepLink: "rp://home" },
  { key: "notifications", module: "common", label: "Notification inbox", route: route([APP, "Notification"]), deepLink: "rp://notifications" },
  { key: "announcements", module: "common", label: "Announcements", route: null, deepLink: "rp://announcements" },
  { key: "events", module: "common", label: "Events", route: null, deepLink: "rp://events" },
  { key: "support", module: "common", label: "Support", route: route([APP, "MyTickets"]), deepLink: "rp://support" },

  // E-commerce
  { key: "ecommerce_home", module: "ecommerce", label: "Shop home", route: route([...PRODUCT, "Home"]), deepLink: "rp://shop" },
  { key: "product", module: "ecommerce", label: "Product details", entity: "product", route: route([APP, "ProductDetails"], ({ id }) => ({ productId: Number(id) })), deepLink: "rp://product/{id}" },
  { key: "product_category", module: "ecommerce", label: "Product category", entity: "category", route: route([...PRODUCT, "Category"], ({ id, title }) => ({ categoryId: Number(id), title: title || "" })), deepLink: "rp://category/{id}" },
  { key: "product_collection", module: "ecommerce", label: "Selected products (collection)", entity: "product_list", route: null, deepLink: "rp://collection?ids={ids}" },
  { key: "cart", module: "ecommerce", label: "Cart", route: route([APP, "Cart"]), deepLink: "rp://cart" },
  { key: "order_details", module: "ecommerce", label: "My orders (owner only)", route: route([APP, "Orders"]), deepLink: "rp://order/{id}", campaignAllowed: false },

  // Services
  { key: "service_home", module: "service", label: "Services home", route: route([...SERVICES, "Home"]), deepLink: "rp://services" },
  { key: "service_category", module: "service", label: "Service category", entity: "service_category", route: null, deepLink: "rp://services/category/{id}" },
  { key: "service", module: "service", label: "Service details", entity: "service", route: route([...SERVICES, "ServiceDescription"], ({ id }) => ({ serviceId: Number(id) })), deepLink: "rp://service/{id}" },
  { key: "service_order", module: "service", label: "Service order (owner only)", route: route([...SERVICES, "ServiceOrderDetail"], ({ id }) => ({ parent_order_id: String(id) })), deepLink: "rp://service-order/{id}", campaignAllowed: false },

  // Bus booking (the app's DineOutModule hosts the bus booking stack)
  { key: "bus_search", module: "busbooking", label: "Bus search", route: route([...BUS, "BookingHomeScreen"]), deepLink: "rp://bus" },
  { key: "bus_my_bookings", module: "busbooking", label: "My bus bookings", route: route([...BUS, "BusOrdersScreen"]), deepLink: "rp://bus/bookings" },
  { key: "bus_booking", module: "busbooking", label: "Booking details (owner only)", route: route([...BUS, "BusOrderDetailScreen"], ({ id }) => ({ orderRef: String(id) })), deepLink: "rp://bus-booking/{id}", campaignAllowed: false },

  // BBPS
  { key: "bbps_home", module: "bbps", label: "Bill payments home", route: route([...PAYMENTS, "Home"]), deepLink: "rp://bills" },
  { key: "bbps_transaction", module: "bbps", label: "Transaction details (owner only)", route: null, deepLink: "rp://bill-payment/{id}", campaignAllowed: false },

  // RP Move, games, wallet, to-do, chat
  { key: "fitness_dashboard", module: "fitness", label: "RP Move dashboard", route: route([APP, "RewardStack", "Dashboard"]), deepLink: "rp://move" },
  { key: "games_home", module: "games", label: "Games (quiz)", route: route([APP, "Quiz"]), deepLink: "rp://games" },
  { key: "quiz", module: "games", label: "Quiz", entity: "published_quiz", route: route([APP, "Quiz"]), deepLink: "rp://quiz" },
  { key: "wallet", module: "wallet", label: "Wallet / rewards", route: route([APP, "WalletHistory"]), deepLink: "rp://wallet" },
  { key: "todo_list", module: "todo", label: "To-do list", route: route([APP, "TodoList"]), deepLink: "rp://todo" },
  { key: "chat_home", module: "chat", label: "Chats", route: route([APP, "Chat", "ChatInbox"]), deepLink: "rp://chat" },
];

const BY_KEY = Object.fromEntries(DESTINATIONS.map((destination) => [destination.key, {
  campaignAllowed: true,
  ...destination,
  mobileRoute: destination.route ? "verified" : "not_in_app",
  screen: destination.route ? destination.route.path.at(-1) : null,
}]));

const fallbackPath = (module) => MODULE_FALLBACK_ROUTES[module] || MODULE_FALLBACK_ROUTES.common;

// Screen names the backend already sends on system notifications
// (SCREEN_BY_MODULE / inferScreen) mapped to real routes, so system pushes get
// correct navigation from new app builds without changing the `screen` key.
const LEGACY_SCREEN_ROUTES = {
  Notifications: [APP, "Notification"],
  Dashboard: [APP, "Dashboard"],
  EcommerceHome: [...PRODUCT, "Home"],
  ServiceHome: [...SERVICES, "Home"],
  BbpsHome: [...PAYMENTS, "Home"],
  FitnessDashboard: [APP, "RewardStack", "Dashboard"],
  GamesHome: [APP, "Quiz"],
  TodoList: [APP, "TodoList"],
  Wallet: [APP, "WalletHistory"],
  Support: [APP, "MyTickets"],
  Profile: [APP, "Profile"],
  Cart: [APP, "Cart"],
  OrderDetails: [APP, "Orders"],
  ServiceOrderDetails: [...SERVICES, "MyOrder"],
};

function legacyRouteForScreen(screen) {
  const path = LEGACY_SCREEN_ROUTES[screen];
  return path ? { path, params: {} } : null;
}

function getDestination(key) {
  return BY_KEY[key] || null;
}

/** Destinations a campaign in `module` may open (its own + common ones). */
function destinationsForModule(module, { campaign = true } = {}) {
  return DESTINATIONS.map((destination) => BY_KEY[destination.key])
    .filter((destination) => destination.module === module || destination.module === "common")
    .filter((destination) => !campaign || destination.campaignAllowed);
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Structural validation (the entity's existence is checked against the DB by
 * the caller). Returns { destination, errors }.
 */
function validateDestination({ module, destinationType, destinationId, productIds = [] }, { campaign = true } = {}) {
  if (!destinationType) return { destination: null, errors: [] };
  const destination = getDestination(destinationType);
  if (!destination) return { destination: null, errors: ["Choose a destination from the list."] };
  if (campaign && !destination.campaignAllowed) {
    return { destination, errors: [`"${destination.label}" is private to one employee and cannot be used in a campaign.`] };
  }
  if (destination.module !== "common" && destination.module !== module) {
    return { destination, errors: [`"${destination.label}" belongs to a different module.`] };
  }
  if (destination.entity === "product_list") {
    if (!productIds.length) return { destination, errors: ["Select at least one product for the collection."] };
  } else if (destination.entity && destination.entity !== "published_quiz") {
    if (!destinationId || !ID_PATTERN.test(String(destinationId))) return { destination, errors: [`Select the ${destination.label.toLowerCase()} to open.`] };
  }
  return { destination, errors: [] };
}

/**
 * Resolve to payload fields. target_route is the full navigator path and its
 * params; fallback_route is used when the target is missing or unavailable.
 * FCM data values must be strings, so buildPushMessage JSON-encodes objects.
 */
function resolveDestination({ module, destinationType, destinationId, productIds = [], title = "" }) {
  const destination = getDestination(destinationType);
  if (!destination) return null;

  const fallback = { path: fallbackPath(module), params: {} };
  const target = destination.route
    ? { path: destination.route.path, params: destination.route.params({ id: destinationId, ids: productIds, title }) }
    : fallback;
  const deepLink = destination.deepLink
    .replace("{id}", encodeURIComponent(String(destinationId || "")))
    .replace("{ids}", productIds.map((id) => encodeURIComponent(String(id))).join(","));

  return {
    destination_type: destination.key,
    screen: target.path.at(-1),
    target_id: destinationId ? String(destinationId) : productIds.length ? productIds.map(String).join(",") : "",
    // Kept for apps that read flat params (e.g. the selected product ids).
    target_params: destination.key === "product_collection" ? { productIds: productIds.map(String) } : target.params,
    target_route: target,
    fallback_route: fallback,
    fallback_screen: fallback.path.at(-1),
    deep_link: deepLink,
  };
}

module.exports = {
  DESTINATIONS: DESTINATIONS.map((destination) => BY_KEY[destination.key]),
  LEGACY_SCREEN_ROUTES,
  MODULE_FALLBACK_ROUTES,
  destinationsForModule,
  getDestination,
  legacyRouteForScreen,
  resolveDestination,
  validateDestination,
};
