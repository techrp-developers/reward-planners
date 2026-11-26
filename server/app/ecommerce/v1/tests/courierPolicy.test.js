const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getCourierProvider,
  isXpressEnabled,
  mergeCourierQuotes,
  selectNextCourier,
} = require("../../../../services/courier/courierPolicy");

const xpressCheap = { id: "1", total_charges: 31 };
const xpressNext = { id: "2", total_charges: 50 };
const ekart = { id: "ekart:SURFACE", total_charges: 40 };
const options = [xpressNext, ekart, xpressCheap];

test("providers are read from the courier id, including legacy rows", () => {
  assert.equal(getCourierProvider("ekart:SURFACE"), "ekart");
  assert.equal(getCourierProvider("12944"), "xpressbees");
  assert.equal(getCourierProvider(1), "xpressbees");
  assert.equal(getCourierProvider(null), "xpressbees");
});

test("XpressBees stays on unless it is explicitly disabled", () => {
  assert.equal(isXpressEnabled("true"), true);
  assert.equal(isXpressEnabled("anything"), true);
  assert.equal(isXpressEnabled("false"), false);
  assert.equal(isXpressEnabled("FALSE"), false);
});

test("the cheapest courier wins across providers", () => {
  assert.equal(selectNextCourier(options).id, "1");
  assert.equal(selectNextCourier([xpressNext, ekart]).id, "ekart:SURFACE");
});

test("a disabled provider is never selected, even when cheapest", () => {
  const selected = selectNextCourier(
    options,
    [],
    (provider) => provider !== "xpressbees",
  );
  assert.equal(selected.id, "ekart:SURFACE");
});

test("a failed booking moves to the other provider first", () => {
  assert.equal(selectNextCourier(options, ["1"]).id, "ekart:SURFACE");
  assert.equal(selectNextCourier(options, ["1", "ekart:SURFACE"]).id, "2");
});

test("no courier is returned once all options are used or unpriced", () => {
  assert.equal(selectNextCourier([xpressCheap], ["1"]), null);
  assert.equal(selectNextCourier([{ id: "9", total_charges: 0 }]), null);
});

test("a failing provider is skipped while the other still quotes", () => {
  const merged = mergeCourierQuotes([
    { status: "rejected", reason: new Error("down") },
    { status: "fulfilled", value: [ekart] },
  ]);
  assert.equal(merged.status, true);
  assert.deepEqual(merged.data, [ekart]);
});

test("quotes are merged cheapest first", () => {
  const merged = mergeCourierQuotes([
    { status: "fulfilled", value: [xpressNext, xpressCheap] },
    { status: "fulfilled", value: [ekart] },
  ]);
  assert.deepEqual(
    merged.data.map((option) => option.id),
    ["1", "ekart:SURFACE", "2"],
  );
});

test("not serviceable differs from every provider failing", () => {
  assert.equal(
    mergeCourierQuotes([{ status: "fulfilled", value: [] }]).status,
    false,
  );
  assert.equal(mergeCourierQuotes([]).status, false);
  assert.throws(
    () => mergeCourierQuotes([{ status: "rejected", reason: new Error("x") }]),
    /Serviceability check failed/,
  );
});

const {
  buildDeliveryChoices,
  isBookingUnconfirmed,
  selectCourierForPreference,
} = require("../../../../services/courier/courierPolicy");

const slowCheap = { id: "1", total_charges: 40, estimated_delivery_days: 7 };
const fastDear = {
  id: "ekart:EXPRESS",
  total_charges: 90,
  estimated_delivery_days: 3,
};
const fastDearer = { id: "3", total_charges: 120, estimated_delivery_days: 3 };
const pricing = {
  chargeFor: (courier) => courier.total_charges,
  baseAmount: 500,
};

test("preference picks by price or by speed", () => {
  const options = [fastDearer, slowCheap, fastDear];
  assert.equal(selectCourierForPreference(options).id, "1");
  assert.equal(selectCourierForPreference(options, "cheapest").id, "1");
  assert.equal(
    selectCourierForPreference(options, "fastest").id,
    "ekart:EXPRESS",
  );
});

test("fastest falls back to cheapest when no delivery days are known", () => {
  assert.equal(
    selectCourierForPreference([{ id: "a", total_charges: 9 }], "fastest").id,
    "a",
  );
  assert.equal(selectCourierForPreference([], "fastest"), null);
});

test("XpressBees eddDays counts as delivery days", () => {
  const selected = selectCourierForPreference(
    [
      { id: "1", total_charges: 40, eddDays: 9 },
      { id: "2", total_charges: 50, eddDays: 4 },
    ],
    "fastest",
  );
  assert.equal(selected.id, "2");
});

test("booking starts with the courier the customer paid for", () => {
  const options = [slowCheap, fastDear];
  assert.equal(
    selectNextCourier(options, [], () => true, "ekart:EXPRESS").id,
    "ekart:EXPRESS",
  );
  // Disabled since checkout, so the next courier takes over.
  assert.equal(
    selectNextCourier(
      options,
      [],
      (provider) => provider !== "ekart",
      "ekart:EXPRESS",
    ).id,
    "1",
  );
});

test("delivery choices offer fastest only when it arrives sooner", () => {
  const choices = buildDeliveryChoices([[slowCheap, fastDear]], pricing);
  assert.deepEqual(
    choices.map((choice) => [
      choice.preference,
      choice.shipping_total,
      choice.payable_amount,
      choice.delivery_days,
    ]),
    [
      ["cheapest", 40, 540, 7],
      ["fastest", 90, 590, 3],
    ],
  );

  const single = buildDeliveryChoices([[slowCheap]], pricing);
  assert.deepEqual(single.map((choice) => choice.preference), ["cheapest"]);
  assert.deepEqual(buildDeliveryChoices([], pricing), []);
});

test("cart choices add charges and use the slowest vendor", () => {
  const [, fastest] = buildDeliveryChoices(
    [
      [slowCheap, fastDear],
      [
        { id: "4", total_charges: 30, estimated_delivery_days: 8 },
        { id: "5", total_charges: 60, estimated_delivery_days: 5 },
      ],
    ],
    pricing,
  );
  assert.equal(fastest.shipping_total, 150);
  assert.equal(fastest.delivery_days, 5);
});

test("only a request that may have arrived is an unknown booking", () => {
  assert.equal(
    isBookingUnconfirmed({ request: {}, code: "ECONNABORTED" }),
    true,
  );
  assert.equal(isBookingUnconfirmed({ request: {}, code: "ECONNRESET" }), true);
  assert.equal(
    isBookingUnconfirmed({ request: {}, code: "ECONNREFUSED" }),
    false,
  );
  assert.equal(
    isBookingUnconfirmed({ request: {}, response: { status: 400 } }),
    false,
  );
  assert.equal(isBookingUnconfirmed(new Error("Login failed")), false);
});
