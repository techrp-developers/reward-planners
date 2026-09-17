const STATUS_EVENT_MAP = Object.freeze({
  out_for_delivery: "order_place_arriving",
  delivered: "order_place_delivered",
  cancelled: "cancel_order",
});

module.exports = { STATUS_EVENT_MAP };
