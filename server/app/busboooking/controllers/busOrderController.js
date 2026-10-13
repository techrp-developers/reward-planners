const BusBookingOrderModel = require("../models/busBookingOrderModel");

const MAX_PAGE_SIZE = 50;

const toAmount = (value) => Number(Number(value || 0).toFixed(2));

// Shapes an order row for the customer app.
const presentOrder = (row) => ({
  orderRef: row.order_ref,
  operatorName: row.operator_name,
  busType: row.bus_type,
  sourceCity: row.source_city,
  destinationCity: row.destination_city,
  journeyDate: row.journey_date,
  departureTime: row.departure_time,
  arrivalTime: row.arrival_time,
  boardingPointName: row.boarding_point_name,
  droppingPointName: row.dropping_point_name,
  seatCount: Number(row.seat_count || 0),
  totalAmount: toAmount(row.total_amount),
  amountPaid: toAmount(
    Number(row.total_amount || 0) - Number(row.reward_coins_used || 0),
  ),
  status: row.status,
  paymentStatus: row.payment_status,
  ticketNo: row.ticket_no,
  travelOperatorPNR: row.travel_operator_pnr,
  bookedAt: row.created_at,
});

const parseCancellationPolicy = (rawBlockResponse) => {
  try {
    const policy = JSON.parse(rawBlockResponse || "{}")?.CancellationPolicy;
    return Array.isArray(policy) ? policy : [];
  } catch {
    return [];
  }
};

/*
|--------------------------------------------------------------------------
| GET /api/busbooking/orders?page=1&limit=20
|--------------------------------------------------------------------------
*/

const getMyBookings = async (req, res) => {
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(req.query.limit, 10) || 20),
  );
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  try {
    // One extra row tells the app whether another page exists.
    const rows = await BusBookingOrderModel.listForUser(req.user.user_id, {
      limit: limit + 1,
      offset: (page - 1) * limit,
    });

    return res.status(200).json({
      success: true,
      page,
      limit,
      hasMore: rows.length > limit,
      data: rows.slice(0, limit).map((row) => ({
        ...presentOrder(row),
        seats: String(row.seat_names || "").split(",").filter(Boolean),
      })),
    });
  } catch (error) {
    console.error("[BusBooking][Orders] List failed", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to load your bus bookings",
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET /api/busbooking/orders/:orderRef
|--------------------------------------------------------------------------
*/

const getBookingDetail = async (req, res) => {
  const orderRef = String(req.params.orderRef || "").trim();

  if (!orderRef) {
    return res.status(400).json({
      success: false,
      message: "orderRef is required",
    });
  }

  try {
    const detail = await BusBookingOrderModel.findDetailForUser(
      orderRef,
      req.user.user_id,
    );

    if (!detail) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    const { order, passengers, refunds } = detail;

    return res.status(200).json({
      success: true,
      data: {
        ...presentOrder(order),
        seats: passengers.map((passenger) => passenger.seat_name),
        // /cancel accepts a seat only while the order is confirmed and paid.
        cancellable:
          order.status === "confirmed" && order.payment_status === "paid",
        passengers: passengers.map((passenger) => ({
          name: [passenger.title, passenger.first_name, passenger.last_name]
            .filter(Boolean)
            .join(" "),
          gender: passenger.gender,
          age: passenger.age,
          seatName: passenger.seat_name,
          leadPassenger: Boolean(passenger.lead_passenger),
          cancellationStatus: passenger.cancellation_status || null,
          refundStatus: passenger.refund_status || null,
          refundAmount:
            passenger.cancellation_status === "succeeded"
              ? toAmount(passenger.refund_amount)
              : null,
        })),
        refunds: refunds.map((refund) => ({
          reason: refund.reason,
          amount: toAmount(refund.amount),
          status: refund.status,
          updatedAt: refund.updated_at,
        })),
        cancellationPolicy: parseCancellationPolicy(order.raw_block_response),
      },
    });
  } catch (error) {
    console.error("[BusBooking][Orders] Detail failed", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to load this bus booking",
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET /api/busbooking/popular-routes
|--------------------------------------------------------------------------
*/

const getPopularRoutes = async (req, res) => {
  try {
    const routes = await BusBookingOrderModel.getPopularRoutes(6);

    return res.status(200).json({
      success: true,
      data: routes.map((route) => ({
        sourceCityCode: String(route.source_city_code),
        sourceCity: route.source_city,
        destinationCityCode: String(route.destination_city_code),
        destinationCity: route.destination_city,
        bookings: Number(route.bookings || 0),
        startingFare: toAmount(route.min_fare),
      })),
    });
  } catch (error) {
    console.error("[BusBooking][PopularRoutes] Failed", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to load popular routes",
    });
  }
};

module.exports = {
  getMyBookings,
  getBookingDetail,
  getPopularRoutes,
};
