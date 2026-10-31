const PROVIDERS = { XPRESSBEES: "xpressbees", EKART: "ekart" };
const EKART_COURIER_PREFIX = "ekart:";
const DELIVERY_PREFERENCES = { CHEAPEST: "cheapest", FASTEST: "fastest" };
const DELIVERY_LABELS = {
  [DELIVERY_PREFERENCES.CHEAPEST]: "Standard delivery",
  [DELIVERY_PREFERENCES.FASTEST]: "Fastest delivery",
};
const BOOKING_UNCONFIRMED = "COURIER_BOOKING_UNCONFIRMED";
// These never reached the courier, so nothing can have been created there.
const REQUEST_NOT_SENT_CODES = ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"];

// Existing rows hold bare XpressBees ids, so only Ekart ids carry a prefix.
function getCourierProvider(courierId) {
  return String(courierId ?? "").startsWith(EKART_COURIER_PREFIX)
    ? PROVIDERS.EKART
    : PROVIDERS.XPRESSBEES;
}

function isXpressEnabled(value = process.env.XPRESS_ENABLED ?? "true") {
  return String(value).toLowerCase() !== "false";
}

function byCharges(a, b) {
  return Number(a.total_charges) - Number(b.total_charges);
}

// A provider that fails is skipped so the others can still serve the order.
// Only when every provider failed do we surface an error to the caller.
function mergeCourierQuotes(results) {
  const answered = results.filter((result) => result.status === "fulfilled");

  if (results.length > 0 && answered.length === 0) {
    throw new Error("Serviceability check failed");
  }

  const data = answered.flatMap((result) => result.value).sort(byCharges);
  return { status: data.length > 0, data };
}

function getDeliveryDays(courier) {
  return (
    Number(courier.estimated_delivery_days ?? courier.eddDays) || null
  );
}

function selectCourierForPreference(
  options,
  preference = DELIVERY_PREFERENCES.CHEAPEST,
) {
  const priced = options
    .filter((courier) => Number(courier.total_charges) > 0)
    .sort(byCharges);

  if (preference !== DELIVERY_PREFERENCES.FASTEST) return priced[0] || null;

  // Stable sort keeps the cheaper courier first when two are equally fast.
  const [fastest] = priced
    .filter((courier) => getDeliveryDays(courier))
    .sort((a, b) => getDeliveryDays(a) - getDeliveryDays(b));

  return fastest || priced[0] || null;
}

// What the customer can choose at checkout, one entry per delivery speed.
// A cart ships per vendor, so totals add up and the slowest vendor sets the
// days. Fastest is offered only when it really arrives sooner.
function buildDeliveryChoices(optionSets, { chargeFor, baseAmount }) {
  const summarize = (preference) => {
    const couriers = optionSets
      .map((options) => selectCourierForPreference(options, preference))
      .filter(Boolean);
    const shippingTotal = couriers.reduce(
      (sum, courier) => sum + chargeFor(courier),
      0,
    );
    const days = couriers.map(getDeliveryDays);
    const deliveryDays =
      days.length > 0 && days.every(Boolean) ? Math.max(...days) : null;

    return {
      preference,
      label: DELIVERY_LABELS[preference],
      shipping_total: shippingTotal,
      payable_amount: baseAmount + shippingTotal,
      delivery_days: deliveryDays,
      estimated_delivery_date: deliveryDays
        ? new Date(Date.now() + deliveryDays * 86400000)
        : null,
    };
  };

  if (!optionSets.some((options) => options.length > 0)) return [];

  const cheapest = summarize(DELIVERY_PREFERENCES.CHEAPEST);
  const fastest = summarize(DELIVERY_PREFERENCES.FASTEST);
  const arrivesSooner =
    fastest.delivery_days !== null &&
    cheapest.delivery_days !== null &&
    fastest.delivery_days < cheapest.delivery_days;

  return arrivesSooner ? [cheapest, fastest] : [cheapest];
}

// A timeout may mean the courier created the shipment and we never heard back.
function isBookingUnconfirmed(error) {
  return (
    Boolean(error?.request) &&
    !error?.response &&
    !REQUEST_NOT_SENT_CODES.includes(error?.code)
  );
}

function bookingUnconfirmedError(provider) {
  const error = new Error(`${provider} booking outcome unknown after timeout`);
  error.code = BOOKING_UNCONFIRMED;
  return error;
}

// Starts with the courier the customer was quoted, then the cheapest untried
// courier, moving to the other provider after a failure. Without this, one bad
// provider could use up every booking attempt on its own courier options
// before the other provider is ever tried.
function selectNextCourier(
  options,
  attempted = [],
  isProviderEnabled = () => true,
  quotedCourierId = null,
) {
  const attemptedIds = attempted.map(String);
  const remaining = options
    .filter(
      (courier) =>
        !attemptedIds.includes(String(courier.id)) &&
        Number(courier.total_charges) > 0 &&
        isProviderEnabled(getCourierProvider(courier.id)),
    )
    .sort(byCharges);

  if (attempted.length === 0) {
    return (
      remaining.find(
        (courier) => String(courier.id) === String(quotedCourierId),
      ) ||
      remaining[0] ||
      null
    );
  }

  const lastProvider = getCourierProvider(attempted[attempted.length - 1]);
  return (
    remaining.find(
      (courier) => getCourierProvider(courier.id) !== lastProvider,
    ) ||
    remaining[0] ||
    null
  );
}

module.exports = {
  BOOKING_UNCONFIRMED,
  DELIVERY_PREFERENCES,
  EKART_COURIER_PREFIX,
  PROVIDERS,
  bookingUnconfirmedError,
  buildDeliveryChoices,
  getCourierProvider,
  getDeliveryDays,
  isBookingUnconfirmed,
  isXpressEnabled,
  mergeCourierQuotes,
  selectCourierForPreference,
  selectNextCourier,
};
