const db =
  require(
    "../../../config/database"
  );


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
};


module.exports =
  BusBookingOrderModel;