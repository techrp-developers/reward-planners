const crypto = require("crypto");
const {
  EKART_COURIER_PREFIX,
  PROVIDERS,
} = require("../courier/courierPolicy");

const CATEGORY_OF_GOODS = "General Merchandise";
const PRODUCTS_DESC_MAX_LENGTH = 200;

const EKART_STATUS_MAP = {
  "order placed": "booked",
  "pickup pending": "booked",
  "pickup scheduled": "booked",
  "out for pickup": "booked",
  "not picked": "booked",

  "picked up": "picked_up",

  "in transit": "in_transit",
  "shipment delayed": "in_transit",

  "out for delivery": "out_for_delivery",

  delivered: "delivered",

  undelivered: "ndr",

  "rto requested": "rto",
  "seller rto requested": "rto",
  "rto in transit": "rto",
  "rto out for delivery": "rto",
  "rto shipment delayed": "rto",
  "rto delivered": "rto",
  "rto failed": "rto",

  cancelled: "cancelled",
  "seller cancelled": "cancelled",
  "pickup cancelled": "cancelled",
};

function mapEkartStatus(status) {
  if (!status || typeof status !== "string") return null;

  const mapped = EKART_STATUS_MAP[status.toLowerCase().trim()];
  if (!mapped) {
    // Lost, Damaged and Not Serviceable need a person, not a status change.
    console.warn(`[mapEkartStatus] Unmapped Ekart status: "${status}"`);
    return null;
  }
  return mapped;
}

function isEkartRtoDelivered(status) {
  return String(status || "").trim().toLowerCase() === "rto delivered";
}

function toTenDigitPhone(value) {
  return Number(String(value || "").replace(/\D/g, "").slice(-10));
}

function toPositiveInteger(value) {
  return Math.max(1, Math.round(Number(value) || 0));
}

function buildEkartServiceabilityPayload(payload, serviceType) {
  const isCod = String(payload.payment_type).toLowerCase() === "cod";

  return {
    pickupPincode: String(payload.origin),
    dropPincode: String(payload.destination),
    length: String(toPositiveInteger(payload.length)),
    height: String(toPositiveInteger(payload.height)),
    width: String(toPositiveInteger(payload.breadth)),
    weight: String(toPositiveInteger(payload.weight)),
    paymentType: isCod ? "COD" : "Prepaid",
    serviceType,
    invoiceAmount: String(payload.order_amount),
    ...(isCod ? { codAmount: String(payload.order_amount) } : {}),
  };
}

// Booking only accepts a service type, so several rows for one service type
// cannot be told apart. Keep the cheapest, in the shared courier option shape.
function normalizeEkartOption(rows, serviceType, weightGrams) {
  const cheapest = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      total: Number(row?.forwardDeliveredCharges?.totalForwardDeliveredEstimate),
      days: Number(row?.tat?.max) || null,
    }))
    .filter((row) => row.total > 0)
    .sort((a, b) => a.total - b.total)[0];

  if (!cheapest) return null;

  const label = serviceType.charAt(0) + serviceType.slice(1).toLowerCase();

  return {
    id: `${EKART_COURIER_PREFIX}${serviceType}`,
    provider: PROVIDERS.EKART,
    service: serviceType,
    name: `Ekart ${label}`,
    total_charges: cheapest.total,
    chargeable_weight: toPositiveInteger(weightGrams),
    estimated_delivery_days: cheapest.days,
    transit_days: cheapest.days,
  };
}

// The alias changes with the address, so an edited vendor warehouse gets
// registered again instead of shipping from the old one.
function buildEkartPickupAlias({ vendorId, vendorAddress }) {
  const hash = crypto
    .createHash("md5")
    .update(
      [
        vendorAddress.line1,
        vendorAddress.line2,
        vendorAddress.line3,
        vendorAddress.city,
        vendorAddress.pincode,
        vendorAddress.primary_contact,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 8);

  return `RP-V${vendorId}-${hash}`;
}

function buildEkartAddress(context) {
  const { vendorAddress } = context;

  return {
    alias: buildEkartPickupAlias(context),
    phone: toTenDigitPhone(vendorAddress.primary_contact),
    address_line1: vendorAddress.line1,
    address_line2:
      [vendorAddress.line2, vendorAddress.line3].filter(Boolean).join(" ") ||
      null,
    pincode: Number(vendorAddress.pincode),
    city: vendorAddress.city,
    state: vendorAddress.state_name,
    country: "India",
  };
}

function buildEkartShipmentPayload(context, serviceType) {
  const { order, shipment, vendorAddress, invoice, items } = context;

  const goodsValue = Math.max(
    1,
    Number(
      items
        .reduce((sum, item) => sum + Number(item.final_price), 0)
        .toFixed(2),
    ),
  );
  const pickupAddress = buildEkartAddress(context);
  const pickupLocation = {
    name: pickupAddress.alias,
    address: [pickupAddress.address_line1, pickupAddress.address_line2]
      .filter(Boolean)
      .join(" "),
    city: pickupAddress.city,
    state: pickupAddress.state,
    country: pickupAddress.country,
    phone: pickupAddress.phone,
    pin: pickupAddress.pincode,
  };
  const consigneePhone = toTenDigitPhone(order.contact_phone);

  return {
    seller_name: vendorAddress.company_name,
    seller_address: pickupLocation.address,
    seller_gst_tin: vendorAddress.gstin || "",
    consignee_gst_amount: 0,
    order_number: context.orderNumber,
    invoice_number: invoice.invoice_number,
    invoice_date: String(invoice.invoice_date).slice(0, 10),
    consignee_name: order.contact_name,
    consignee_alternate_phone: String(consigneePhone),
    payment_mode: "Prepaid",
    category_of_goods: CATEGORY_OF_GOODS,
    products_desc: items
      .map((item) => item.product_name)
      .join(", ")
      .slice(0, PRODUCTS_DESC_MAX_LENGTH),
    hsn_code: items[0]?.hsn_sac_code || undefined,
    // Our invoices carry no tax split, so the courier documents match them.
    total_amount: goodsValue,
    tax_value: 0,
    taxable_amount: goodsValue,
    commodity_value: String(goodsValue),
    cod_amount: 0,
    quantity: items.reduce((sum, item) => sum + Number(item.quantity), 0),
    weight: toPositiveInteger(shipment.weight),
    length: toPositiveInteger(shipment.length),
    height: toPositiveInteger(shipment.height),
    width: toPositiveInteger(shipment.breadth),
    return_reason: "",
    drop_location: {
      name: order.contact_name,
      address: `${order.address1} ${order.address2 || ""}`.trim(),
      city: order.city,
      state: order.state_name,
      country: "India",
      phone: consigneePhone,
      pin: Number(order.zipcode),
    },
    pickup_location: pickupLocation,
    return_location: pickupLocation,
    service: serviceType,
  };
}

// Reduce a track response to the fields the tracking cron reads. mapped_status
// is always present, so the cron never runs Ekart text through XpressBees
// rules. History is newest first, as the cron expects.
function normalizeEkartTracking(body) {
  const track = body?.track;
  if (!track?.status) return { status: false, message: "Tracking failed" };

  const details = Array.isArray(track.details) ? track.details : [];
  const history = details
    .filter((event) => event?.ctime)
    .sort((a, b) => b.ctime - a.ctime)
    .map((event) => ({
      message: event.desc || event.status,
      mapped_status: mapEkartStatus(event.status),
      // shipment_events compares at whole seconds to avoid duplicate rows.
      event_time: new Date(Math.floor(event.ctime / 1000) * 1000),
    }));

  return {
    status: true,
    data: {
      current_status: track.status,
      mapped_status: mapEkartStatus(track.status),
      rto_delivered: isEkartRtoDelivered(track.status),
      history,
      raw: body,
    },
  };
}

function buildEkartNdrPayload({ action, trackingId, address }) {
  if (action === "cancel") {
    // A parcel in NDR is already moving, so it is returned, not cancelled.
    return { action: "RTO", wbn: trackingId };
  }

  const payload = {
    action: "Re-Attempt",
    wbn: trackingId,
    date: Date.now() + 24 * 60 * 60 * 1000,
  };

  if (action === "address_update") {
    payload.address = `${address.address1} ${address.address2 || ""}`.trim();
    const phone = toTenDigitPhone(address.contact_phone);
    if (phone) payload.phone = String(phone);
  }

  return payload;
}

module.exports = {
  buildEkartAddress,
  buildEkartNdrPayload,
  buildEkartPickupAlias,
  buildEkartServiceabilityPayload,
  buildEkartShipmentPayload,
  isEkartRtoDelivered,
  mapEkartStatus,
  normalizeEkartOption,
  normalizeEkartTracking,
};
