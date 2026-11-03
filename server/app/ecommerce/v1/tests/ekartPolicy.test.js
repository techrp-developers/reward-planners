const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildEkartNdrPayload,
  buildEkartPickupAlias,
  buildEkartServiceabilityPayload,
  buildEkartShipmentPayload,
  isEkartRtoDelivered,
  mapEkartStatus,
  normalizeEkartOption,
  normalizeEkartTracking,
} = require("../../../../services/Ekart/ekart_policy");

const context = {
  vendorId: 7,
  orderNumber: "ORD-1-V7",
  order: {
    contact_name: "Asha",
    address1: "12 Road",
    address2: "",
    city: "Pune",
    state_name: "Maharashtra",
    zipcode: "411048",
    contact_phone: "+91 98765 43210",
  },
  shipment: { weight: 500, length: 10, breadth: 8, height: 0 },
  vendorAddress: {
    company_name: "Acme",
    gstin: "27ABCDE1234F1Z5",
    primary_contact: "9123456780",
    line1: "Unit 4",
    line2: "Phase 2",
    line3: null,
    city: "Delhi",
    pincode: "110046",
    state_name: "Delhi",
  },
  invoice: { invoice_number: "INV-1-7", invoice_date: "2026-10-31 10:00:00" },
  items: [
    {
      quantity: 2,
      final_price: "399.50",
      product_name: "Mug",
      hsn_sac_code: "6912",
    },
  ],
};

test("statuses from the Ekart spec map to shipment statuses", () => {
  const expected = {
    "Order Placed": "booked",
    "Pickup Scheduled": "booked",
    "Picked Up": "picked_up",
    "In Transit": "in_transit",
    "Out for Delivery": "out_for_delivery",
    Delivered: "delivered",
    Undelivered: "ndr",
    "RTO In Transit": "rto",
    "RTO Delivered": "rto",
    "Seller Cancelled": "cancelled",
    Lost: null,
    Damaged: null,
  };

  for (const [status, mapped] of Object.entries(expected)) {
    assert.equal(mapEkartStatus(status), mapped, status);
  }
});

test("only RTO Delivered triggers the refund and restock flow", () => {
  assert.equal(isEkartRtoDelivered("RTO Delivered"), true);
  assert.equal(isEkartRtoDelivered("RTO In Transit"), false);
  assert.equal(isEkartRtoDelivered("Delivered"), false);
});

test("quote requests follow the serviceability v3 contract", () => {
  const payload = buildEkartServiceabilityPayload(
    {
      origin: "110046",
      destination: "411048",
      payment_type: "prepaid",
      order_amount: "500",
      weight: "0",
      length: "10",
      breadth: "8",
      height: "4",
    },
    "SURFACE",
  );

  assert.deepEqual(payload, {
    pickupPincode: "110046",
    dropPincode: "411048",
    length: "10",
    height: "4",
    width: "8",
    weight: "1",
    paymentType: "Prepaid",
    serviceType: "SURFACE",
    invoiceAmount: "500",
  });
});

test("the cheapest Ekart rate becomes a complete courier option", () => {
  const rate = (max, total) => ({
    tat: { max },
    forwardDeliveredCharges: { totalForwardDeliveredEstimate: total },
  });
  const option = normalizeEkartOption(
    [rate(6, "90.5"), rate(4, "70"), rate(3, "0")],
    "SURFACE",
    "500",
  );

  assert.deepEqual(option, {
    id: "ekart:SURFACE",
    provider: "ekart",
    service: "SURFACE",
    name: "Ekart Surface",
    total_charges: 70,
    chargeable_weight: 500,
    estimated_delivery_days: 4,
    transit_days: 4,
  });
  assert.equal(normalizeEkartOption([], "SURFACE", "500"), null);
});

test("the pickup alias changes when the vendor address changes", () => {
  const moved = {
    ...context,
    vendorAddress: { ...context.vendorAddress, line1: "Unit 9" },
  };

  assert.equal(buildEkartPickupAlias(context), buildEkartPickupAlias(context));
  assert.notEqual(buildEkartPickupAlias(context), buildEkartPickupAlias(moved));
});

test("shipment payload includes every field Ekart requires", () => {
  const payload = buildEkartShipmentPayload(context, "SURFACE");

  for (const field of [
    "tax_value", "seller_name", "seller_address", "seller_gst_tin",
    "consignee_gst_amount", "order_number", "invoice_number", "invoice_date",
    "consignee_name", "consignee_alternate_phone", "payment_mode",
    "category_of_goods", "products_desc", "total_amount", "cod_amount",
    "taxable_amount", "commodity_value", "return_reason", "quantity", "weight",
    "drop_location", "pickup_location", "return_location", "service", "length",
    "height", "width",
  ]) {
    assert.notEqual(payload[field], undefined, field);
  }

  assert.equal(payload.total_amount, 399.5);
  assert.equal(payload.commodity_value, "399.5");
  assert.equal(payload.quantity, 2);
  assert.equal(payload.height, 1);
  assert.equal(payload.invoice_date, "2026-10-31");
  assert.equal(payload.drop_location.phone, 9876543210);
  assert.equal(payload.drop_location.pin, 411048);
  assert.equal(payload.pickup_location.name, buildEkartPickupAlias(context));
});

test("tracking is normalized newest first at whole seconds", () => {
  const result = normalizeEkartTracking({
    track: {
      status: "Delivered",
      ctime: 1800000002000,
      desc: "Delivered Successfully",
      details: [
        { status: "Picked Up", ctime: 1800000000999, desc: "Picked" },
        { status: "Lost", ctime: 1800000001000, desc: "Parcel not delivered" },
        { status: "Delivered", ctime: 1800000002000, desc: "Handed over" },
      ],
    },
  });

  assert.equal(result.status, true);
  assert.equal(result.data.mapped_status, "delivered");
  // Lost stays null rather than matching "delivered" in its description.
  assert.deepEqual(
    result.data.history.map((event) => event.mapped_status),
    ["delivered", null, "picked_up"],
  );
  assert.equal(result.data.history[2].event_time.getMilliseconds(), 0);
  assert.equal(normalizeEkartTracking({}).status, false);
});

test("NDR actions follow the v2 contract", () => {
  const before = Date.now();
  const retry = buildEkartNdrPayload({ action: "retry", trackingId: "T1" });

  assert.equal(retry.action, "Re-Attempt");
  assert.equal(retry.wbn, "T1");
  assert.equal(retry.date >= before + 86400000, true);
  assert.deepEqual(
    buildEkartNdrPayload({ action: "cancel", trackingId: "T1" }),
    { action: "RTO", wbn: "T1" },
  );

  const update = buildEkartNdrPayload({
    action: "address_update",
    trackingId: "T1",
    address: { address1: "New Road", contact_phone: "9876543210" },
  });
  assert.equal(update.address, "New Road");
  assert.equal(update.phone, "9876543210");
});
