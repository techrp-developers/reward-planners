const XPRESS_ORDER_NUMBER_MAX_LENGTH = 20;

const XPRESS_STATUS_CODE_MAP = {
  PP: "booked",
  IT: "in_transit",
  EX: "ndr",
  FD: "out_for_delivery",
  DL: "delivered",
  RT: "rto",
  "RT-IT": "rto",
  "RT-DL": "rto",
};

function buildXpressOrderNumber(orderReference, vendorId) {
  const suffix = `-V${vendorId}`;
  const availableReferenceLength = Math.max(
    1,
    XPRESS_ORDER_NUMBER_MAX_LENGTH - suffix.length,
  );
  const reference = String(orderReference || "ORDER")
    .replace(/\s+/g, "-")
    .slice(0, availableReferenceLength);

  return `${reference}${suffix}`;
}

function mapXpressStatusCode(statusCode) {
  if (!statusCode) return null;
  return XPRESS_STATUS_CODE_MAP[String(statusCode).trim().toUpperCase()] || null;
}

function isXpressRtoDelivered(statusCode, status) {
  const normalizedCode = String(statusCode || "").trim().toUpperCase();
  if (normalizedCode === "RT-DL") return true;

  const normalizedStatus = String(status || "").trim().toLowerCase();
  return normalizedStatus === "rto delivered" || normalizedStatus === "return delivered";
}

function buildXpressBookingPayload(context, courierId) {
  const { order, shipment, vendorAddress, items } = context;

  const orderItems = items.map((i) => ({
    name: i.product_name,
    qty: i.quantity.toString(),
    price: i.price.toString(),
    sku: i.sku,
  }));

  // Calculate vendor subtotal
  const vendorSubtotal = items.reduce(
    (sum, i) => sum + Number(i.final_price),
    0,
  );
  const vendorDiscount = items.reduce(
    (sum, i) => sum + Number(i.reward_discount || 0),
    0,
  );

  return {
    order_number: context.orderNumber,
    unique_order_number: "yes",
    shipping_charges: shipment.shipping_charges,
    discount: vendorDiscount,
    cod_charges: 0,
    payment_type: "prepaid",
    order_amount: vendorSubtotal + Number(shipment.shipping_charges),

    package_weight: shipment.weight,
    package_length: shipment.length,
    package_breadth: shipment.breadth,
    package_height: shipment.height,
    request_auto_pickup: "yes",

    consignee: {
      name: order.contact_name,
      address: `${order.address1} ${order.address2 || ""}`,
      city: order.city,
      state: order.state_name,
      pincode: order.zipcode,
      phone: order.contact_phone,
    },

    pickup: {
      warehouse_name: "Vendor Warehouse",
      name: vendorAddress.company_name,
      address: `${vendorAddress.line1} ${vendorAddress.line2 || ""} ${vendorAddress.line3 || ""}`,
      city: vendorAddress.city,
      state: vendorAddress.state_name,
      pincode: vendorAddress.pincode,
      phone: vendorAddress.primary_contact,
    },

    courier_id: courierId,
    collectable_amount: 0,
    order_items: orderItems,
  };
}

module.exports = {
  XPRESS_ORDER_NUMBER_MAX_LENGTH,
  buildXpressBookingPayload,
  buildXpressOrderNumber,
  isXpressRtoDelivered,
  mapXpressStatusCode,
};
