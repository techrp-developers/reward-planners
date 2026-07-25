const TRACKING_STEPS = [
  { key: "processing", label: "Processing" },
  { key: "shipped", label: "Shipped" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
];

function mapShipmentStatusToStep(status) {
  if (["pending", "booking_in_progress", "booked"].includes(status)) return 0;
  if (["picked_up", "in_transit"].includes(status)) return 1;
  if (status === "out_for_delivery") return 2;
  if (status === "delivered") return 3;
  if (["ndr", "rto", "cancelled"].includes(status)) return 1;
  return 0;
}

function deriveOrderProgress(statuses = []) {
  if (!statuses.length) {
    return {
      currentStep: 0,
      status: "processing",
      isPartial: false,
      deliveredShipments: 0,
      totalShipments: 0,
    };
  }

  const deliveredShipments = statuses.filter(
    (status) => status === "delivered",
  ).length;
  const totalShipments = statuses.length;
  const allDelivered = deliveredShipments === totalShipments;

  if (allDelivered) {
    return {
      currentStep: 3,
      status: "delivered",
      isPartial: false,
      deliveredShipments,
      totalShipments,
    };
  }

  if (statuses.every((status) => status === "cancelled")) {
    return {
      currentStep: 1,
      status: "cancelled",
      isPartial: false,
      deliveredShipments,
      totalShipments,
    };
  }

  const activeStatuses = statuses.filter(
    (status) => !["delivered", "cancelled"].includes(status),
  );
  const activeSteps = activeStatuses.map(mapShipmentStatusToStep);
  const currentStep = activeSteps.length ? Math.min(...activeSteps) : 1;

  let status = TRACKING_STEPS[currentStep]?.key || "processing";
  if (deliveredShipments > 0) status = "partially_delivered";
  else if (statuses.includes("ndr")) status = "ndr";
  else if (statuses.includes("rto")) status = "rto";
  else if (statuses.includes("cancelled")) status = "partially_cancelled";

  return {
    currentStep,
    status,
    isPartial:
      deliveredShipments > 0 ||
      statuses.includes("cancelled"),
    deliveredShipments,
    totalShipments,
  };
}

module.exports = {
  TRACKING_STEPS,
  deriveOrderProgress,
  mapShipmentStatusToStep,
};
