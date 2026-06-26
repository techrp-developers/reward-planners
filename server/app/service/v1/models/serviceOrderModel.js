const db = require("../../../../config/database");
const razorpay = require("../middlewares/razorpay");

// helper function
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

function mapServiceCancelEvent(event) {
  const eventMap = {
    cancellation_requested: "Cancellation Requested",

    cancellation_approved: "Cancellation Approved",

    cancellation_rejected: "Cancellation Rejected",

    refund_initiated: "Refund Initiated",

    refund_completed: "Refund Completed",

    refund_failed: "Refund Failed",
  };

  return eventMap[event] || event;
}

class ServiceOrderModel {
  // create order
  async create(data, conn = db) {
    const [result] = await conn.execute(
      `INSERT INTO service_orders
    (user_id, service_id, variant_id, address_id, enquiry_id, price, parent_order_id, bundle_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.user_id,
        data.service_id,
        data.variant_id,
        data.addressId,
        data.enquiry_id,
        data.price,
        data.parent_order_id,
        data.bundle_id || null,
        data.status,
      ],
    );

    const insertId = result.insertId;
    const ref = `SP-ORD-${1000 + insertId}`;

    await conn.execute(`UPDATE service_orders SET order_ref = ? WHERE id = ?`, [
      ref,
      insertId,
    ]);

    return {
      id: insertId,
      order_ref: ref,
    };
  }

  // get my orders
  async getUserOrders({
    userId,
    status = null,
    search = null,
    fromDate = null,
    toDate = null,
    timeFilter = null,
    page = 1,
    limit = 10,
  }) {
    let sql = `
    SELECT 
      so.id,
      so.order_ref,
      so.price,
      so.status,
      so.payment_status,
      so.created_at,
      so.parent_order_id,
      so.bundle_id,

      s.name AS service_name,
      sv.variant_name,
      sv.image_url

    FROM service_orders so
    JOIN services s ON s.id = so.service_id
    LEFT JOIN service_variants sv ON sv.id = so.variant_id

    WHERE so.user_id = ?
  `;

    const params = [userId];

    if (search) {
      sql += `
    AND (
      so.order_ref LIKE ?
      OR s.name LIKE ?
      OR sv.variant_name LIKE ?
    )
  `;

      const searchValue = `%${search}%`;

      params.push(searchValue, searchValue, searchValue);
    }

    if (fromDate) {
      sql += ` AND DATE(so.created_at) >= ?`;
      params.push(fromDate);
    }

    if (toDate) {
      sql += ` AND DATE(so.created_at) <= ?`;
      params.push(toDate);
    }

    if (!fromDate && !toDate && timeFilter) {
      if (timeFilter === "30days") {
        sql += `
      AND so.created_at >=
      DATE_SUB(NOW(), INTERVAL 30 DAY)
    `;
      } else if (timeFilter === "3months") {
        sql += `
      AND so.created_at >=
      DATE_SUB(NOW(), INTERVAL 3 MONTH)
    `;
      } else if (timeFilter === "6months") {
        sql += `
      AND so.created_at >=
      DATE_SUB(NOW(), INTERVAL 6 MONTH)
    `;
      } else if (/^\d{4}$/.test(timeFilter)) {
        sql += `
      AND YEAR(so.created_at) = ?
    `;

        params.push(Number(timeFilter));
      }
    }

    sql += ` ORDER BY so.created_at DESC`;

    const [rows] = await db.execute(sql, params);

    const ordersMap = {};

    rows.forEach((row) => {
      const parentId = row.parent_order_id;

      if (!ordersMap[parentId]) {
        ordersMap[parentId] = {
          parent_order_id: parentId,
          created_at: row.created_at,
          total_amount: 0,

          //  FIX: store all statuses
          statuses: [],

          // final structure
          status: null,
          items: [],
          bundles: {},
          summary: {
            total_items: 0,
            total_bundles: 0,
          },
          preview: [],
        };
      }

      const order = ordersMap[parentId];

      // collect statuses
      order.statuses.push(row.status);

      const item = {
        id: row.id,
        order_ref: row.order_ref,
        service_name: row.service_name,
        variant_name: row.variant_name,
        image_url: row.image_url ? getPublicUrl(row.image_url) : null,
        price: Number(row.price),
        bundle_id: row.bundle_id,
      };

      //  bundle grouping
      if (row.bundle_id) {
        if (!order.bundles[row.bundle_id]) {
          order.bundles[row.bundle_id] = {
            bundle_id: row.bundle_id,
            items: [],
            bundle_total: 0,
          };

          // summary
          order.summary.total_bundles += 1;

          // preview (bundle)
          order.preview.push({
            type: "bundle",
            name: `Bundle #${row.bundle_id}`,
          });
        }

        order.bundles[row.bundle_id].items.push(item);
        order.bundles[row.bundle_id].bundle_total += Number(row.price);
      } else {
        order.items.push(item);

        // preview (service)
        order.preview.push({
          type: "service",
          name: row.service_name,
        });
      }

      order.summary.total_items += 1;
      order.total_amount += Number(row.price);
    });

    //  FINAL TRANSFORM
    const result = Object.values(ordersMap).map((order) => {
      //  aggregate status
      let finalStatus = "pending_payment";

      if (
        order.statuses.some(
          (s) =>
            s === "in_progress" ||
            s === "documents_pending" ||
            s === "documents_uploaded",
        )
      ) {
        finalStatus = "in_progress";
      } else if (order.statuses.every((s) => s === "completed")) {
        finalStatus = "completed";
      } else if (order.statuses.every((s) => s === "cancelled")) {
        finalStatus = "cancelled";
      } else if (order.statuses.some((s) => s === "completed")) {
        finalStatus = "completed";
      }

      return {
        parent_order_id: order.parent_order_id,
        created_at: order.created_at,
        status: finalStatus,
        total_amount: order.total_amount,

        items: order.items,
        bundles: Object.values(order.bundles),

        summary: order.summary,
        preview: order.preview.slice(0, 3),
      };
    });

    let filteredResult = result;

    if (status && status !== "all") {
      if (status === "in_progress") {
        filteredResult = result.filter(
          (order) => order.status === "in_progress",
        );
      } else {
        filteredResult = result.filter((order) => order.status === status);
      }
    }

    // summary
    const summary = {
      all: result.length,

      in_progress: result.filter(
        (x) =>
          x.status === "in_progress" ||
          x.status === "documents_pending" ||
          x.status === "documents_uploaded",
      ).length,

      completed: result.filter((x) => x.status === "completed").length,

      cancelled: result.filter((x) => x.status === "cancelled").length,

      pending_payment: result.filter((x) => x.status === "pending_payment")
        .length,
    };

    // Pagination

    filteredResult.sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at),
    );

    const total = filteredResult.length;

    const offset = (page - 1) * limit;

    const paginatedOrders = filteredResult.slice(offset, offset + limit);

    return {
      orders: paginatedOrders,

      total,

      totalPages: Math.ceil(total / limit),

      currentPage: page,

      summary,
    };
  }

  // order detail by Id
  async getOrderByParentId(orderId, userId) {
    const parentId = orderId;

    // fetch all items of this order
    const [rows] = await db.execute(
      `
    SELECT 
      so.id,
      so.order_ref,
      so.price,
      so.status,
      so.bundle_id,
      so.created_at,

      ca.address_type,
      ca.address1,
      ca.address2,
      ca.city,
      ca.zipcode,
      ca.landmark,
      ca.contact_name,
      ca.contact_phone,

      st.state_name,
      c.country_name,

      s.name AS service_name,
      sv.variant_name,
      sv.title,
      sv.image_url

    FROM service_orders so
    JOIN services s ON s.id = so.service_id
    LEFT JOIN service_variants sv ON sv.id = so.variant_id
    
    LEFT JOIN customer_addresses ca
      ON so.address_id = ca.address_id

    LEFT JOIN states st
      ON ca.state_id = st.state_id

    LEFT JOIN countries c
      ON ca.country_id = c.country_id

    WHERE so.parent_order_id = ? AND so.user_id = ?
    `,
      [parentId, userId],
    );

    if (!rows.length) return null;

    // Aggregate status
    const statuses = rows.map((r) => r.status);

    let finalStatus = "pending_payment";

    if (statuses.every((s) => s === "completed")) {
      finalStatus = "completed";
    } else if (statuses.some((s) => s === "in_progress")) {
      finalStatus = "in_progress";
    } else if (statuses.some((s) => s === "documents_pending")) {
      finalStatus = "documents_pending";
    }

    const response = {
      parent_order_id: parentId,
      status: finalStatus,
      created_at: rows[0].created_at,
      address: rows[0].address1
        ? {
            address_type: rows[0].address_type,
            address1: rows[0].address1,
            address2: rows[0].address2,
            city: rows[0].city,
            zipcode: rows[0].zipcode,
            landmark: rows[0].landmark,
            contact_name: rows[0].contact_name,
            contact_phone: rows[0].contact_phone,
            state: rows[0].state_name,
            country: rows[0].country_name,
          }
        : null,
      items: [],
      bundles: {},
      total_amount: 0,
    };

    rows.forEach((row) => {
      const item = {
        id: row.id,
        order_ref: row.order_ref,
        service_name: row.service_name,
        variant_name: row.variant_name,
        title: row.title,
        image_url: row.image_url ? getPublicUrl(row.image_url) : null,
        price: Number(row.price),
        status: row.status,
      };

      if (row.bundle_id) {
        if (!response.bundles[row.bundle_id]) {
          response.bundles[row.bundle_id] = {
            bundle_id: row.bundle_id,
            items: [],
            bundle_total: 0,
          };
        }

        response.bundles[row.bundle_id].items.push(item);
        response.bundles[row.bundle_id].bundle_total += Number(row.price);
      } else {
        response.items.push(item);
      }

      response.total_amount += Number(row.price);
    });

    response.bundles = Object.values(response.bundles);

    return response;
  }

  // update status
  async updateStatus(orderId, status) {
    let sql = `
    UPDATE service_orders
    SET status = ?
  `;

    const params = [status];

    // completed
    if (status === "completed") {
      sql += `, completed_at = NOW()`;
    }

    // cancelled
    if (status === "cancelled") {
      sql += `, cancelled_at = NOW()`;
    }

    sql += ` WHERE id = ?`;

    params.push(orderId);

    const [result] = await db.execute(sql, params);

    return result.affectedRows;
  }

  // Approve cancellation
  async approveCancellation(serviceOrderId, conn) {
    // =====================================
    // 1 Get cancellation request
    // =====================================

    const [[cancellation]] = await conn.execute(
      `
      SELECT
        soc.id,
        soc.status,

        so.id AS service_order_id,
        so.user_id,
        so.price,
        so.payment_id,
        so.reward_coins_used,
        so.status AS order_status

      FROM service_order_cancellations soc

      JOIN service_orders so
        ON so.id = soc.service_order_id

      WHERE soc.service_order_id = ?

      LIMIT 1
      FOR UPDATE
      `,
      [serviceOrderId],
    );

    if (!cancellation) {
      throw new Error("CANCELLATION_REQUEST_NOT_FOUND");
    }

    if (cancellation.status !== "requested") {
      throw new Error("INVALID_CANCELLATION_STATE");
    }

    if (cancellation.order_status === "cancelled") {
      throw new Error("ORDER_ALREADY_CANCELLED");
    }

    // =====================================
    // 2 Prevent duplicate refund
    // =====================================

    const [[existingRefund]] = await conn.execute(
      `
      SELECT id

      FROM service_order_refunds

      WHERE service_order_id = ?
      AND status = 'completed'

      LIMIT 1
      `,
      [serviceOrderId],
    );

    // check wallet transactions for duplicate
    const [[existingWalletRefund]] = await conn.execute(
      `SELECT id FROM wallet_transactions
   WHERE reference_id = ? AND reason_code = 'ADMIN_ADJUSTMENT' LIMIT 1`,
      [serviceOrderId],
    );

    if (existingRefund || existingWalletRefund) {
      throw new Error("REFUND_ALREADY_DONE");
    }

    // =====================================
    // 3 Refund calculations
    // =====================================

    const refundAmount = Number(cancellation.price);

    const coinsUsed = Number(cancellation.reward_coins_used || 0);

    const refundToWallet = coinsUsed;

    const refundToCard = Math.max(0, refundAmount - coinsUsed);

    // =====================================
    // 4 Reverse wallet coins
    // =====================================

    if (refundToWallet > 0) {
      // ensure wallet exists
      await conn.execute(
        `
      INSERT INTO customer_wallet
      (user_id, balance)

      VALUES (?, 0)

      ON DUPLICATE KEY UPDATE
      user_id = user_id
      `,
        [cancellation.user_id],
      );

      // update wallet
      await conn.execute(
        `
      UPDATE customer_wallet

      SET balance = balance + ?

      WHERE user_id = ?
      `,
        [refundToWallet, cancellation.user_id],
      );

      // get updated balance
      const [[wallet]] = await conn.execute(
        `
        SELECT balance

        FROM customer_wallet

        WHERE user_id = ?
        `,
        [cancellation.user_id],
      );

      // transaction entry
      await conn.execute(
        `
      INSERT INTO wallet_transactions
      (
        user_id,
        title,
        description,
        transaction_type,
        coins,
        balance_after,
        category,
        reference_id,
        reason_code
      )
      VALUES
      (
        ?,
        ?,
        ?,
        'credit',
        ?,
        ?,
        'order',
        ?,
        'ADMIN_ADJUSTMENT'
      )
      `,
        [
          cancellation.user_id,

          "Service Cancellation Refund",

          `Coins refunded for service order ${serviceOrderId}`,

          refundToWallet,

          wallet.balance,

          serviceOrderId,
        ],
      );
    }

    // =====================================
    // 5 Create refund record
    // =====================================

    if (refundToCard > 0) {
      await conn.execute(
        `
      INSERT INTO service_order_refunds
      (
        service_order_id,
        user_id,
        refund_amount,
        refund_method,
        status
      )
      VALUES
      (
        ?, ?, ?, 'original', 'pending'
      )
      `,
        [serviceOrderId, cancellation.user_id, refundToCard],
      );
    }

    // =====================================
    // 6 Update cancellation request
    // =====================================

    await conn.execute(
      `
    UPDATE service_order_cancellations

    SET
      status = 'approved',
      refund_amount = ?,
      refund_status = 'initiated'

    WHERE service_order_id = ?
    `,
      [refundAmount, serviceOrderId],
    );

    // =====================================
    // 7.Timeline: cancellation approved
    // =====================================

    await conn.execute(
      `
    INSERT INTO
    service_order_cancellation_timeline
    (
      service_order_id,
      event
    )
    VALUES
    (
      ?,
      'cancellation_approved'
    )
  `,
      [serviceOrderId],
    );

    // =====================================
    // 8 Timeline: refund initiated
    // ONLY if Razorpay refund exists
    // =====================================
    if (refundToCard > 0) {
      await conn.execute(
        `
        INSERT INTO
        service_order_cancellation_timeline
        (
          service_order_id,
          event
        )
        VALUES
        (
          ?,
          'refund_initiated'
        )
      `,
        [serviceOrderId],
      );
    }

    // =====================================
    // 8. Cancel service order
    // =====================================
    await conn.execute(
      `
    UPDATE service_orders

    SET
      status = 'cancelled',
      cancelled_at = NOW(),
      refund_amount = ?

    WHERE id = ?
    `,
      [refundAmount, serviceOrderId],
    );

    return refundToCard > 0
      ? {
          payment_id: cancellation.payment_id,

          amount: refundToCard,

          service_order_id: serviceOrderId,
        }
      : null;
  }

  async processRefund(data) {
    try {
      const { payment_id, amount, service_order_id } = data;

      // refund
      const refund = await razorpay.payments.refund(payment_id, {
        amount: Math.round(Number(amount) * 100),
      });

      // update refund
      await db.execute(
        `
      UPDATE service_order_refunds
      SET
        status = 'completed',
        razorpay_refund_id = ?

      WHERE service_order_id = ?
      AND status IN ('pending', 'failed')`,
        [refund.id, service_order_id],
      );

      // update cancellation
      await db.execute(
        `
      UPDATE service_order_cancellations
      SET refund_status = 'completed'
      WHERE service_order_id = ?
      `,
        [service_order_id],
      );

      // =====================================
      // Timeline: refund completed
      // =====================================
      await db.execute(
        `
        INSERT INTO
        service_order_cancellation_timeline
        (
          service_order_id,
          event
        )
        VALUES
        (
          ?,
          'refund_completed'
        )
        `,
        [service_order_id],
      );
    } catch (error) {
      console.error("Service refund failed:", error);

      await db.execute(
        `
      UPDATE service_order_refunds
      SET status = 'failed'
      WHERE service_order_id = ?
      AND status IN ('pending', 'failed')
      `,
        [data.service_order_id],
      );

      await db.execute(
        `
        INSERT INTO
        service_order_cancellation_timeline
        (
          service_order_id,
          event
        )
        VALUES
        (
          ?,
          'refund_failed'
        )
        `,
        [data.service_order_id],
      );
    }
  }

  // Reject cancellation
  async rejectCancellation(serviceOrderId, conn) {
    // =====================================
    // Validate cancellation exists
    // =====================================

    const [[cancellation]] = await conn.execute(
      `
      SELECT
        id,
        status

      FROM service_order_cancellations

      WHERE service_order_id = ?

      LIMIT 1
      `,
      [serviceOrderId],
    );

    if (!cancellation) {
      throw new Error("CANCELLATION_REQUEST_NOT_FOUND");
    }

    if (cancellation.status !== "requested") {
      throw new Error("INVALID_CANCELLATION_STATE");
    }

    // =====================================
    // Reject cancellation
    // =====================================

    await conn.execute(
      `
    UPDATE service_order_cancellations

    SET status = 'rejected'

    WHERE service_order_id = ?
    `,
      [serviceOrderId],
    );

    // =====================================
    // Add timeline event
    // =====================================

    await conn.execute(
      `
    INSERT INTO
    service_order_cancellation_timeline
    (
      service_order_id,
      event
    )
    VALUES
    (
      ?,
      'cancellation_rejected'
    )
    `,
      [serviceOrderId],
    );
  }

  // get service cancellation details
  async getCancellationDetails({ userId, serviceOrderId }) {
    // =====================================
    // Order details
    // =====================================

    const [[order]] = await db.execute(
      `
    SELECT

      so.id,
      so.order_ref,
      so.status,
      so.price,
      so.reward_coins_used,
      so.refund_amount,

      so.address_id,

      s.name AS service_name,

      sv.variant_name,
      sv.title,
      sv.image_url,

      ca.address_type,
      ca.address1,
      ca.address2,
      ca.city,
      ca.zipcode,
      ca.landmark,
      ca.contact_name,
      ca.contact_phone,

      st.state_name,
      c.country_name

    FROM service_orders so

    JOIN services s
      ON s.id = so.service_id

    LEFT JOIN service_variants sv
      ON sv.id = so.variant_id

    LEFT JOIN customer_addresses ca
      ON ca.address_id = so.address_id

    LEFT JOIN states st
      ON st.state_id = ca.state_id

    LEFT JOIN countries c
      ON c.country_id = ca.country_id

    WHERE so.id = ?
    AND so.user_id = ?
    `,
      [serviceOrderId, userId],
    );

    if (!order) {
      throw new Error("SERVICE_ORDER_NOT_FOUND");
    }

    // =====================================
    // Cancellation details
    // =====================================

    const [[cancellation]] = await db.execute(
      `
      SELECT
        status,
        refund_amount,
        refund_status,
        refund_method,
        created_at

      FROM service_order_cancellations

      WHERE service_order_id = ?
      `,
      [serviceOrderId],
    );

    // =====================================
    // Timeline
    // =====================================

    const [timeline] = await db.execute(
      `
    SELECT
      event,
      created_at

    FROM service_order_cancellation_timeline

    WHERE service_order_id = ?

    ORDER BY created_at ASC
    `,
      [serviceOrderId],
    );

    // =====================================
    // Refunds
    // =====================================

    const [refunds] = await db.execute(
      `
    SELECT
      refund_amount,
      refund_method,
      status

    FROM service_order_refunds

    WHERE service_order_id = ?
    `,
      [serviceOrderId],
    );

    let moneyRefund = 0;
    let coinRefund = 0;

    refunds.forEach((r) => {
      if (r.refund_method === "original") {
        moneyRefund += Number(r.refund_amount);
      }

      if (r.refund_method === "wallet") {
        coinRefund += Number(r.refund_amount);
      }
    });

    // =====================================
    // Final response
    // =====================================

    return {
      service_order_id: order.id,

      order_ref: order.order_ref,

      status: order.status,

      service: {
        service_name: order.service_name,

        variant_name: order.variant_name,

        title: order.title,

        image_url: order.image_url ? getPublicUrl(order.image_url) : null,
      },

      address: order.address_id
        ? {
            address_type: order.address_type,

            address1: order.address1,

            address2: order.address2,

            city: order.city,

            state: order.state_name,

            country: order.country_name,

            zipcode: order.zipcode,

            landmark: order.landmark,

            contact_name: order.contact_name,

            contact_phone: order.contact_phone,
          }
        : null,

      cancellation: cancellation
        ? {
            status: cancellation.status,

            refund_status: cancellation.refund_status,

            refund_method: cancellation.refund_method,

            refund_amount: Number(cancellation.refund_amount),

            created_at: cancellation.created_at,
          }
        : null,

      timeline: timeline.map((t) => ({
        label: mapServiceCancelEvent(t.event),

        event: t.event,

        date: t.created_at,
      })),

      refund: {
        total: moneyRefund + coinRefund,

        money_refund: moneyRefund,

        coin_refund: coinRefund,
      },

      rewards: {
        used: Number(order.reward_coins_used || 0),

        reversed: coinRefund,
      },

      summary: {
        service_total: Number(order.price),

        order_total: Number(order.price),
      },
    };
  }

  // ===================================================================MPS==========================================================
  // Approve cancellation
  async approveMpsCancellation(serviceOrderId, conn) {
    // =====================================
    // 1 Get cancellation request
    // =====================================

    const [[cancellation]] = await conn.execute(
      `
      SELECT
        soc.id,
        soc.status,

        so.id AS service_order_id,
        so.user_id,
        so.client_id,
        so.price,
        so.payment_id,
        so.reward_coins_used,
        so.status AS order_status

      FROM external_service_order_cancellations soc

      JOIN external_service_orders so
        ON so.id = soc.service_order_id

      WHERE soc.service_order_id = ?

      LIMIT 1
      FOR UPDATE
      `,
      [serviceOrderId],
    );

    if (!cancellation) {
      throw new Error("CANCELLATION_REQUEST_NOT_FOUND");
    }

    if (cancellation.status !== "requested") {
      throw new Error("INVALID_CANCELLATION_STATE");
    }

    if (cancellation.order_status === "cancelled") {
      throw new Error("ORDER_ALREADY_CANCELLED");
    }

    // =====================================
    // 2 Prevent duplicate refund
    // =====================================

    const [[existingRefund]] = await conn.execute(
      `
      SELECT id

      FROM external_service_order_refunds

      WHERE service_order_id = ?
      AND status = 'completed'

      LIMIT 1
      `,
      [serviceOrderId],
    );

    // =====================================
    // 3 Refund calculations
    // =====================================

    const refundAmount = Number(cancellation.price);

    const coinsUsed = 0; // MPS orders do not use reward coins

    const refundToCard = Math.max(0, refundAmount - coinsUsed);

    // =====================================
    // 5 Create refund record
    // =====================================
    if (refundToCard > 0) {
      await conn.execute(
        `
      INSERT INTO external_service_order_refunds
      (
        service_order_id,
        user_id,
        client_id,
        refund_amount,
        refund_method,
        status
      )
      VALUES
      (
        ?, ?, ?, ?, 'original', 'pending'
      )
      `,
        [
          serviceOrderId,
          cancellation.user_id,
          cancellation.client_id,
          refundToCard,
        ],
      );
    }

    // =====================================
    // 6 Update cancellation request
    // =====================================

    await conn.execute(
      `
    UPDATE external_service_order_cancellations
    SET
      status = 'approved',
      refund_amount = ?,
      refund_status = 'initiated'

    WHERE service_order_id = ?
    `,
      [refundAmount, serviceOrderId],
    );

    // =====================================
    // 7.Timeline: cancellation approved
    // =====================================

    await conn.execute(
      `
    INSERT INTO
    external_service_order_cancellation_timeline
    (
      service_order_id,
      event
    )
    VALUES
    (
      ?,
      'cancellation_approved'
    )
  `,
      [serviceOrderId],
    );

    // =====================================
    // 8 Timeline: refund initiated
    // ONLY if Razorpay refund exists
    // =====================================
    if (refundToCard > 0) {
      await conn.execute(
        `
        INSERT INTO
        external_service_order_cancellation_timeline
        (
          service_order_id,
          event
        )
        VALUES
        (
          ?,
          'refund_initiated'
        )
      `,
        [serviceOrderId],
      );
    }

    // =====================================
    // 8. Cancel service order
    // =====================================
    await conn.execute(
      `
    UPDATE external_service_orders

    SET
      status = 'cancelled',
      cancelled_at = NOW(),
      refund_amount = ?

    WHERE id = ?
    `,
      [refundAmount, serviceOrderId],
    );

    return refundToCard > 0
      ? {
          payment_id: cancellation.payment_id,

          amount: refundToCard,

          service_order_id: serviceOrderId,
        }
      : null;
  }

  async processMpsRefund(data) {
    try {
      const { payment_id, amount, service_order_id } = data;

      // refund
      const refund = await razorpay.payments.refund(payment_id, {
        amount: Math.round(Number(amount) * 100),
      });

      // update refund
      await db.execute(
        `
      UPDATE external_service_order_refunds
      SET
        status = 'completed',
        razorpay_refund_id = ?

      WHERE service_order_id = ?
      AND status IN ('pending', 'failed')`,
        [refund.id, service_order_id],
      );

      // update cancellation
      await db.execute(
        `
      UPDATE external_service_order_cancellations
      SET refund_status = 'completed'
      WHERE service_order_id = ?
      `,
        [service_order_id],
      );

      // =====================================
      // Timeline: refund completed
      // =====================================
      await db.execute(
        `
        INSERT INTO
        external_service_order_cancellation_timeline
        (
          service_order_id,
          event
        )
        VALUES
        (
          ?,
          'refund_completed'
        )
        `,
        [service_order_id],
      );
    } catch (error) {
      console.error("Service refund failed:", error);

      await db.execute(
        `
      UPDATE external_service_order_refunds
      SET status = 'failed'
      WHERE service_order_id = ?
      AND status IN ('pending', 'failed')
      `,
        [data.service_order_id],
      );

      await db.execute(
        `
        INSERT INTO
        external_service_order_cancellation_timeline
        (
          service_order_id,
          event
        )
        VALUES
        (
          ?,
          'refund_failed'
        )
        `,
        [data.service_order_id],
      );
    }
  }

  // Reject cancellation
  async rejectMpsCancellation(serviceOrderId, conn) {
    // =====================================
    // Validate cancellation exists
    // =====================================

    const [[cancellation]] = await conn.execute(
      `
      SELECT
        id,
        status

      FROM external_service_order_cancellations

      WHERE service_order_id = ?

      LIMIT 1
      `,
      [serviceOrderId],
    );

    if (!cancellation) {
      throw new Error("CANCELLATION_REQUEST_NOT_FOUND");
    }

    if (cancellation.status !== "requested") {
      throw new Error("INVALID_CANCELLATION_STATE");
    }

    // =====================================
    // Reject cancellation
    // =====================================

    await conn.execute(
      `
    UPDATE external_service_order_cancellations

    SET status = 'rejected'

    WHERE service_order_id = ?
    `,
      [serviceOrderId],
    );

    // =====================================
    // Add timeline event
    // =====================================

    await conn.execute(
      `
    INSERT INTO
    external_service_order_cancellation_timeline
    (
      service_order_id,
      event
    )
    VALUES
    (
      ?,
      'cancellation_rejected'
    )
    `,
      [serviceOrderId],
    );
  }

  // Admin order list
  async getAllOrders({ page = 1, limit = 10, status = null, search = null }) {
    let sql = `
    SELECT
      so.id,
      so.parent_order_id,
      so.order_ref,
      so.price,
      so.status,
      so.created_at,
      so.payment_status,

      cu.name,
      cu.email,
      cu.phone,

      s.name AS service_name

    FROM service_orders so

    JOIN customer cu
      ON cu.user_id = so.user_id

    JOIN services s
      ON s.id = so.service_id

    WHERE 1=1
  `;

    const params = [];

    if (search) {
      sql += `
      AND (
        so.parent_order_id LIKE ?
        OR so.order_ref LIKE ?
        OR cu.name LIKE ?
        OR cu.email LIKE ?
        OR cu.phone LIKE ?
      )
    `;

      const q = `%${search}%`;

      params.push(q, q, q, q, q);
    }

    sql += ` ORDER BY so.created_at DESC`;

    const [rows] = await db.execute(sql, params);

    const grouped = {};

    rows.forEach((row) => {
      if (!grouped[row.parent_order_id]) {
        grouped[row.parent_order_id] = {
          parent_order_id: row.parent_order_id,

          customer_name: row.name?.trim() || "",

          email: row.email,

          mobile: row.phone,

          created_at: row.created_at,

          total_amount: 0,

          items: [],

          statuses: [],
        };
      }

      grouped[row.parent_order_id].items.push({
        id: row.id,
        order_ref: row.order_ref,
        service_name: row.service_name,
        price: Number(row.price),
        status: row.status,
      });

      grouped[row.parent_order_id].statuses.push(row.status);

      grouped[row.parent_order_id].total_amount += Number(row.price);
    });

    const orders = Object.values(grouped).map((order) => {
      let finalStatus = "pending_payment";

      if (
        order.statuses.some(
          (s) => s === "in_progress" || s === "documents_pending",
        )
      ) {
        finalStatus = "in_progress";
      } else if (order.statuses.every((s) => s === "completed")) {
        finalStatus = "completed";
      } else if (order.statuses.every((s) => s === "cancelled")) {
        finalStatus = "cancelled";
      } else if (order.statuses.some((s) => s === "completed")) {
        finalStatus = "completed";
      }

      return {
        parent_order_id: order.parent_order_id,

        customer_name: order.customer_name,

        email: order.email,

        mobile: order.mobile,

        created_at: order.created_at,

        total_amount: order.total_amount,

        status: finalStatus,

        total_services: order.items.length,

        items: order.items,
      };
    });

    const filteredOrders =
      status && status !== "all"
        ? orders.filter((order) => order.status === status)
        : orders;

    const total = filteredOrders.length;

    const offset = (page - 1) * limit;

    return {
      orders: filteredOrders.slice(offset, offset + limit),

      total,

      currentPage: page,

      totalPages: Math.ceil(total / limit),
    };
  }

  // order detail by Id
  async getOrderByParentIdAdmin(orderId) {
    const parentId = orderId;

    const [rows] = await db.execute(
      `
    SELECT 
      so.id,
      so.order_ref,
      so.price,
      so.status,
      so.bundle_id,
      so.created_at,

      ca.address_type,
      ca.address1,
      ca.address2,
      ca.city,
      ca.zipcode,
      ca.landmark,
      ca.contact_name,
      ca.contact_phone,

      cu.name,
      cu.email,
      cu.phone,

      st.state_name,
      c.country_name,

      s.name AS service_name,
      sv.variant_name,
      sv.title,
      sv.image_url

    FROM service_orders so

    JOIN services s
      ON s.id = so.service_id

    LEFT JOIN service_variants sv
      ON sv.id = so.variant_id

    JOIN customer cu
      ON cu.user_id = so.user_id

    LEFT JOIN customer_addresses ca
      ON so.address_id = ca.address_id

    LEFT JOIN states st
      ON ca.state_id = st.state_id

    LEFT JOIN countries c
      ON ca.country_id = c.country_id

    WHERE so.parent_order_id = ?
    `,
      [parentId],
    );

    if (!rows.length) return null;

    const statuses = rows.map((r) => r.status);

    let finalStatus = "pending_payment";

    if (
      statuses.some((s) => s === "in_progress" || s === "documents_pending")
    ) {
      finalStatus = "in_progress";
    } else if (statuses.every((s) => s === "completed")) {
      finalStatus = "completed";
    } else if (statuses.every((s) => s === "cancelled")) {
      finalStatus = "cancelled";
    } else if (statuses.some((s) => s === "completed")) {
      finalStatus = "completed";
    }

    const response = {
      parent_order_id: parentId,

      status: finalStatus,

      created_at: rows[0].created_at,

      customer: {
        name: rows[0].name || "",
        email: rows[0].email || "",
        mobile: rows[0].phone || "",
      },

      address: rows[0].address1
        ? {
            address_type: rows[0].address_type,
            address1: rows[0].address1,
            address2: rows[0].address2,
            city: rows[0].city,
            zipcode: rows[0].zipcode,
            landmark: rows[0].landmark,
            contact_name: rows[0].contact_name,
            contact_phone: rows[0].contact_phone,
            state: rows[0].state_name,
            country: rows[0].country_name,
          }
        : null,

      items: [],

      bundles: {},

      total_amount: 0,
    };

    rows.forEach((row) => {
      const item = {
        id: row.id,

        order_ref: row.order_ref,

        service_name: row.service_name,

        variant_name: row.variant_name,

        title: row.title,

        image_url: row.image_url ? getPublicUrl(row.image_url) : null,

        price: Number(row.price),

        status: row.status,
      };

      if (row.bundle_id) {
        if (!response.bundles[row.bundle_id]) {
          response.bundles[row.bundle_id] = {
            bundle_id: row.bundle_id,
            items: [],
            bundle_total: 0,
          };
        }

        response.bundles[row.bundle_id].items.push(item);

        response.bundles[row.bundle_id].bundle_total += Number(row.price);
      } else {
        response.items.push(item);
      }

      response.total_amount += Number(row.price);
    });

    response.bundles = Object.values(response.bundles);

    return response;
  }
}

module.exports = new ServiceOrderModel();
