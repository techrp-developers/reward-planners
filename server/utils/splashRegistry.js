// Pages and display slots that can carry a CMS splash/campaign. Only these
// keys are accepted. Page keys are CMS identifiers, not React Navigation route
// names: the mobile app maps each key to its own screen.

// overlay: full-screen splash or popup, shown for a few seconds or until dismissed.
// banner: part of the page; never times out and is shown on every visit.
const SLOTS = {
  promo_splash: { kind: "overlay", label: "Promotional splash" },
  entry_popup: { kind: "overlay", label: "Entry popup" },
  hero_banner: { kind: "banner", label: "Hero banner" },
  inline_banner: { kind: "banner", label: "Inline banner" },
};

const PAGES = {
  app_launch: { label: "App launch", slots: ["promo_splash"] },
  dashboard: { label: "Dashboard", slots: ["hero_banner", "entry_popup"] },
  products: { label: "Products", slots: ["hero_banner", "entry_popup"] },
  services: { label: "Services", slots: ["hero_banner", "entry_popup"] },
  bus_booking: { label: "Bus booking", slots: ["hero_banner", "entry_popup"] },
  payments: { label: "Payments", slots: ["hero_banner"] },
  step_counter: { label: "Step counter", slots: ["inline_banner"] },
  investments: { label: "Investments", slots: ["inline_banner"] },
  insurance: { label: "Insurance", slots: ["inline_banner"] },
  rewards: { label: "Rewards", slots: ["hero_banner", "entry_popup"] },
};

const PLATFORMS = ["all", "android", "ios"];
const AUDIENCES = ["all", "authenticated", "guest"];
const FREQUENCY_RULES = ["once_per_session", "once_per_day", "every_visit"];
const FALLBACK_POLICIES = ["show_content", "skip"];
const DISPLAY_SECONDS = { default: 3, min: 1, max: 10 };
// Overlays with no placement setting (e.g. a default) show once a day.
const DEFAULT_OVERLAY_FREQUENCY = "once_per_day";

function isValidPageSlot(pageKey, slotKey) {
  return Object.hasOwn(PAGES, pageKey) && PAGES[pageKey].slots.includes(slotKey);
}

function slotKind(slotKey) {
  return SLOTS[slotKey]?.kind || null;
}

/**
 * Display behaviour the app should apply. Banners never time out and show on
 * every visit; overlays use the placement's frequency and duration.
 */
function displaySettings(slotKey, { frequencyRule = null, displaySeconds = null } = {}) {
  if (slotKind(slotKey) === "banner") {
    return { frequency_rule: "every_visit", display_seconds: null, auto_dismiss: false, dismissible: false };
  }
  return {
    frequency_rule: frequencyRule || DEFAULT_OVERLAY_FREQUENCY,
    display_seconds: displaySeconds == null ? DISPLAY_SECONDS.default : Number(displaySeconds),
    auto_dismiss: true,
    dismissible: true,
  };
}

function pagesForApi() {
  return {
    pages: Object.entries(PAGES).map(([key, page]) => ({
      key, label: page.label,
      slots: page.slots.map((slot) => ({ key: slot, label: SLOTS[slot].label, kind: SLOTS[slot].kind })),
    })),
    platforms: PLATFORMS,
    audiences: AUDIENCES,
    frequency_rules: FREQUENCY_RULES,
    fallback_policies: FALLBACK_POLICIES,
    display_seconds: DISPLAY_SECONDS,
  };
}

module.exports = {
  AUDIENCES, DISPLAY_SECONDS, FALLBACK_POLICIES, FREQUENCY_RULES, PAGES, PLATFORMS, SLOTS,
  displaySettings, isValidPageSlot, pagesForApi, slotKind,
};
