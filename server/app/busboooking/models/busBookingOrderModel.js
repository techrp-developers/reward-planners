const db =
  require(
    "../../../config/database"
  );


// What a customer may see of their own order. Provider payloads, block keys
// and internal error text stay server-side.
const CUSTOMER_ORDER_COLUMNS = `
  o.id, o.order_ref, o.operator_name, o.bus_type,
  o.source_city, o.destination_city,
  o.journey_date, o.departure_time, o.arrival_time,
  o.boarding_point_name, o.dropping_point_name,
  o.seat_count, o.total_amount, o.reward_coins_used,
  o.status, o.payment_status,
  o.ticket_no, o.travel_operator_pnr,
  o.created_at`;


const BusBookingOrderModel = {

  /*
  |--------------------------------------------------------------------------
  | Create Bus Booking Order
  |--------------------------------------------------------------------------
  */

  async create(
    data,
    conn = db
  ) {

    const [
      result
    ] =
      await conn.execute(
        `
        INSERT INTO busbooking_orders
        (
          user_id,

          trace_id,
          srdv_index,
          result_index,

          block_key,

          operator_name,
          bus_type,

          source_city,
          destination_city,

          journey_date,
          departure_time,
          arrival_time,

          boarding_point_id,
          boarding_point_name,

          dropping_point_id,
          dropping_point_name,

          seat_count,

          total_amount,

          reward_coins_earned,
          reward_coins_used,

          status,
          payment_status,

          raw_block_response
        )
        VALUES
        (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?
        )
        `,
        [
          data.user_id,

          data.trace_id,
          data.srdv_index,
          data.result_index,

          data.block_key,

          data.operator_name ||
            null,

          data.bus_type ||
            null,

          data.source_city ||
            null,

          data.destination_city ||
            null,

          data.journey_date ||
            null,

          data.departure_time ||
            null,

          data.arrival_time ||
            null,

          data.boarding_point_id ||
            null,

          data.boarding_point_name ||
            null,

          data.dropping_point_id ||
            null,

          data.dropping_point_name ||
            null,

          Number(
            data.seat_count ||
            1
          ),

          Number(
            data.total_amount ||
            0
          ),

          Number(
            data.reward_coins_earned ||
            0
          ),

          Number(
            data.reward_coins_used ||
            0
          ),

          data.status ||
            "pending_payment",

          data.payment_status ||
            "pending",

          data.raw_block_response
            ? JSON.stringify(
                data.raw_block_response
              )
            : null,
        ]
      );


    /*
    |--------------------------------------------------------------------------
    | Create Reference
    |--------------------------------------------------------------------------
    */

    const insertId =
      result.insertId;


    const orderRef =
      `BB-ORD-${1000 + insertId}`;


    await conn.execute(
      `
      UPDATE busbooking_orders

      SET order_ref = ?

      WHERE id = ?
      `,
      [
        orderRef,
        insertId,
      ]
    );


    return {

      id:
        insertId,

      order_ref:
        orderRef,

      total_amount:
        Number(
          data.total_amount ||
          0
        ),
    };
  },


  /*
  |--------------------------------------------------------------------------
  | Create Passengers
  |--------------------------------------------------------------------------
  */

  async createPassengers(
    busBookingOrderId,
    passengers,
    conn = db
  ) {

    if (
      !Array.isArray(
        passengers
      ) ||
      passengers.length ===
        0
    ) {

      return;
    }


    for (
      let index = 0;
      index <
      passengers.length;
      index++
    ) {

      const passenger =
        passengers[index];


      await conn.execute(
        `
        INSERT INTO busbooking_passengers
        (
          busbooking_order_id,

          title,
          first_name,
          last_name,

          gender,
          age,

          email,
          phone,
          address,

          seat_name,

          lead_passenger,

          id_type,
          id_number
        )
        VALUES
        (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?
        )
        `,
        [
          busBookingOrderId,

          passenger.Title ||
            null,

          passenger.FirstName ||
            "",

          passenger.LastName ||
            null,

          passenger.Gender ||
            null,

          Number(
            passenger.Age ||
            0
          ) ||
            null,

          passenger.Email ||
            null,

          passenger.PhoneNo ||
            null,

          passenger.Address ||
            null,

          passenger.SeatName ||
            "",

          String(
            passenger.LeadPassenger
          ).toLowerCase() ===
          "true"
            ? 1
            : 0,

          passenger.IdType ||
            null,

          passenger.IdNumber ||
            null,
        ]
      );
    }
  },


  /*
  |--------------------------------------------------------------------------
  | Find By Order Reference
  |--------------------------------------------------------------------------
  */

  async findByOrderRef(
    orderRef,
    userId,
    conn = db
  ) {

    const [
      rows
    ] =
      await conn.execute(
        `
        SELECT *

        FROM busbooking_orders

        WHERE order_ref = ?
          AND user_id = ?

        LIMIT 1
        `,
        [
          orderRef,
          userId,
        ]
      );


    return (
      rows[0] ||
      null
    );
  },


  /*
  |--------------------------------------------------------------------------
  | Customer Bookings
  |--------------------------------------------------------------------------
  |
  | Only orders the customer has actually paid for are listed: an abandoned
  | or expired seat hold is not a booking.
  |
  |--------------------------------------------------------------------------
  */

  async listForUser(
    userId,
    { limit = 20, offset = 0 } = {},
    conn = db
  ) {

    const [
      rows
    ] =
      await conn.query(
        `
        SELECT ${CUSTOMER_ORDER_COLUMNS},
               (
                 SELECT GROUP_CONCAT(p.seat_name ORDER BY p.id SEPARATOR ',')
                   FROM busbooking_passengers p
                  WHERE p.busbooking_order_id = o.id
               ) AS seat_names

        FROM busbooking_orders o

        WHERE o.user_id = ?
          AND o.payment_status IN ('paid', 'refunded')

        ORDER BY o.id DESC

        LIMIT ? OFFSET ?
        `,
        [
          userId,
          Number(limit),
          Number(offset),
        ]
      );


    return rows;
  },


  async findDetailForUser(
    orderRef,
    userId,
    conn = db
  ) {

    const [
      [order]
    ] =
      await conn.execute(
        `
        SELECT ${CUSTOMER_ORDER_COLUMNS},
               o.raw_block_response

        FROM busbooking_orders o

        WHERE o.order_ref = ?
          AND o.user_id = ?
          AND o.payment_status IN ('paid', 'refunded')

        LIMIT 1
        `,
        [
          orderRef,
          userId,
        ]
      );


    if (!order) {
      return null;
    }


    const [
      passengers
    ] =
      await conn.execute(
        `
        SELECT p.title, p.first_name, p.last_name, p.gender, p.age,
               p.seat_name, p.lead_passenger,
               c.status AS cancellation_status,
               c.refund_status,
               c.refund_amount

        FROM busbooking_passengers p

        LEFT JOIN busbooking_cancellations c
          ON c.busbooking_order_id = p.busbooking_order_id
         AND c.seat_name = p.seat_name

        WHERE p.busbooking_order_id = ?

        ORDER BY p.id ASC
        `,
        [
          order.id,
        ]
      );


    const [
      refunds
    ] =
      await conn.execute(
        `
        SELECT reason, amount, status, updated_at

        FROM busbooking_refunds

        WHERE busbooking_order_id = ?

        ORDER BY id ASC
        `,
        [
          order.id,
        ]
      );


    return {
      order,
      passengers,
      refunds,
    };
  },


  /*
  |--------------------------------------------------------------------------
  | Popular Routes
  |--------------------------------------------------------------------------
  |
  | The routes customers have actually booked most over the last 90 days,
  | resolved back to city codes so the app can search them directly.
  |
  |--------------------------------------------------------------------------
  */

  async getPopularRoutes(
    limit = 6,
    conn = db
  ) {

    const [
      rows
    ] =
      await conn.query(
        `
        SELECT r.source_city,
               r.destination_city,
               r.bookings,
               r.min_fare,
               (
                 SELECT c.cico_id FROM city_codes c
                  WHERE UPPER(c.cico_type) = 'CITY'
                    AND LOWER(TRIM(c.cico_city_name)) = LOWER(TRIM(r.source_city))
                  ORDER BY c.cico_id ASC LIMIT 1
               ) AS source_city_code,
               (
                 SELECT c.cico_id FROM city_codes c
                  WHERE UPPER(c.cico_type) = 'CITY'
                    AND LOWER(TRIM(c.cico_city_name)) = LOWER(TRIM(r.destination_city))
                  ORDER BY c.cico_id ASC LIMIT 1
               ) AS destination_city_code

        FROM (
          SELECT source_city,
                 destination_city,
                 COUNT(*) AS bookings,
                 MIN(total_amount / GREATEST(seat_count, 1)) AS min_fare
            FROM busbooking_orders
           WHERE status IN ('confirmed', 'cancelled')
             AND source_city IS NOT NULL
             AND destination_city IS NOT NULL
             AND created_at >= NOW() - INTERVAL 90 DAY
           GROUP BY source_city, destination_city
           ORDER BY bookings DESC, MAX(id) DESC
           LIMIT ?
        ) r
        `,
        [
          Number(limit),
        ]
      );


    return rows.filter(
      (row) =>
        row.source_city_code &&
        row.destination_city_code
    );
  },
};


module.exports =
  BusBookingOrderModel;