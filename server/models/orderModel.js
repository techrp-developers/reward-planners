const db = require("../config/database");
const Razorpay = require("razorpay");
const xpressService = require("../services/ExpressBees/xpressbees_service");

const razorpay = new Razorpay({
  key_id: process.env.RAZOR_API_KEY,
  key_secret: process.env.RAZOR_SECRET_KEY,
});

class OrderModel {
  // order Lists
  async getAdminOrderHistory({
    orderId = null,
    orderRef = null,
    status = null,
    userId = null,
    companyId = null,
    fromDate = null,
    toDate = null,
    page = 1,
    limit = 10,
  }) {
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    if (orderId) {
      conditions.push("o.order_id = ?");
      params.push(orderId);
    }

    if (orderRef) {
      conditions.push("o.order_ref = ?");
      params.push(orderRef);
    }

    if (status) {
      conditions.push("o.status = ?");
      params.push(status);
    }

    if (userId) {
      conditions.push("o.user_id = ?");
      params.push(userId);
    }

    if (companyId) {
      conditions.push("o.company_id = ?");
      params.push(companyId);
    }

    if (fromDate) {
      conditions.push("DATE(o.created_at) >= ?");
      params.push(fromDate);
    }

    if (toDate) {
      conditions.push("DATE(o.created_at) <= ?");
      params.push(toDate);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const [rows] = await db.execute(
      `
      SELECT
        o.order_id,
        o.order_ref,
        o.user_id,
        o.company_id,
        o.total_amount,
        o.status,
        o.cancellation_status,
        o.created_at,

        COUNT(oi.order_item_id) AS item_count,

        s.shipping_status,
        s.awb_number,
        s.courier_name,

        (
          SELECT p.product_name
          FROM eorder_items oii
          JOIN eproducts p ON oii.product_id = p.product_id
          WHERE oii.order_id = o.order_id
          LIMIT 1
        ) AS product_name,

        (
          SELECT p.brand_name
          FROM eorder_items oii
          JOIN eproducts p ON oii.product_id = p.product_id
          WHERE oii.order_id = o.order_id
          LIMIT 1
        ) AS brand_name,

        (
          SELECT pi.image_url
          FROM eorder_items oii
          JOIN product_images pi
            ON oii.product_id = pi.product_id
          WHERE oii.order_id = o.order_id
          ORDER BY pi.sort_order ASC
          LIMIT 1
        ) AS image

      FROM eorders o

      LEFT JOIN eorder_items oi 
        ON o.order_id = oi.order_id

      LEFT JOIN order_shipments s
        ON s.order_id = o.order_id

      ${whereClause}

      GROUP BY o.order_id
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    );

    const [[{ total }]] = await db.execute(
      `
    SELECT COUNT(*) AS total
    FROM eorders o
    ${whereClause}
    `,
      params,
    );

    return {
      orders: rows,
      total,
    };
  }

  // order Details
  async getAdminOrderDetails(orderId) {
    // 1 Order + Customer + Company + Address
    const [[order]] = await db.execute(
      `
    SELECT
      o.order_id,
      o.order_ref,
      o.total_amount,
      o.status,
      o.cancellation_status,
      o.created_at,

      cu.user_id,
      cu.name AS customer_name,
      cu.email AS customer_email,
      cu.phone AS customer_phone,

      comp.company_id,
      comp.company_name,

      ca.address_type,
      ca.address1,
      ca.address2,
      ca.city,
      ca.zipcode,
      ca.landmark,
      ca.contact_name,
      ca.contact_phone,

      s.state_name,
      c.country_name

    FROM eorders o

    LEFT JOIN customer cu
      ON o.user_id = cu.user_id

    LEFT JOIN companies comp
      ON o.company_id = comp.company_id

    LEFT JOIN customer_addresses ca
      ON o.address_id = ca.address_id

    LEFT JOIN states s
      ON ca.state_id = s.state_id

    LEFT JOIN countries c
      ON ca.country_id = c.country_id

    WHERE o.order_id = ?
    `,
      [orderId],
    );

    if (!order) {
      throw new Error("ORDER_NOT_FOUND");
    }

    // 2 Order Items
    const [items] = await db.execute(
      `
    SELECT
      oi.order_item_id,
      oi.product_id,
      oi.variant_id,
      oi.quantity,
      oi.price,

      p.product_name,
      p.brand_name,

      v.variant_attributes,

      (
        SELECT pi.image_url
        FROM product_images pi
        WHERE pi.product_id = p.product_id
        ORDER BY pi.sort_order ASC
        LIMIT 1
      ) AS image

    FROM eorder_items oi
    JOIN eproducts p 
      ON oi.product_id = p.product_id
    JOIN product_variants v
      ON oi.variant_id = v.variant_id

    WHERE oi.order_id = ?
    `,
      [orderId],
    );

    const processedItems = items.map((i) => {
      let attributes = {};

      if (i.variant_attributes) {
        try {
          attributes = JSON.parse(i.variant_attributes);
        } catch {
          attributes = {};
        }
      }

      return {
        order_item_id: i.order_item_id,
        product_id: i.product_id,
        variant_id: i.variant_id,
        product_name: i.product_name,
        brand_name: i.brand_name,
        image: i.image,
        attributes,
        quantity: i.quantity,
        price: i.price,
        item_total: i.quantity * i.price,
      };
    });

    const itemTotal = processedItems.reduce((sum, i) => sum + i.item_total, 0);

    return {
      order: {
        order_id: order.order_id,
        order_ref: order.order_ref,
        status: order.status,
        total_amount: order.total_amount,
        created_at: order.created_at,
      },

      customer: {
        user_id: order.user_id,
        name: order.customer_name,
        email: order.customer_email,
        phone: order.customer_phone,
      },

      company: order.company_id
        ? {
            company_id: order.company_id,
            company_name: order.company_name,
          }
        : null,

      address: {
        type: order.address_type,
        name: order.contact_name,
        phone: order.contact_phone,
        line1: order.address1,
        line2: order.address2,
        city: order.city,
        state: order.state_name,
        country: order.country_name,
        zipcode: order.zipcode,
        landmark: order.landmark,
      },

      items: processedItems,

      summary: {
        item_total: itemTotal,
        order_total: order.total_amount,
      },
    };
  }

  // Get vendor order summary
  async getOrderSummary({ vendorId, limit, offset }) {
    const [rows] = await db.execute(
      `
    SELECT
      vo.vendor_order_id,
      vo.order_id,
      vo.vendor_total,
      vo.shipping_status,
      vo.created_at,

      o.order_ref,
      o.status AS order_status,
      o.cancellation_status,

      COUNT(oi.order_item_id) AS item_count,

      s.awb_number,
      s.courier_name

    FROM vendor_orders vo

    JOIN eorders o
      ON vo.order_id = o.order_id

    LEFT JOIN eorder_items oi
      ON oi.vendor_order_id = vo.vendor_order_id

    LEFT JOIN order_shipments s
      ON s.vendor_order_id = vo.vendor_order_id

    WHERE vo.vendor_id = ?

    GROUP BY vo.vendor_order_id

    ORDER BY vo.created_at DESC

    LIMIT ? OFFSET ?
    `,
      [vendorId, limit, offset],
    );

    const [[{ total }]] = await db.execute(
      `
    SELECT COUNT(*) AS total
    FROM vendor_orders
    WHERE vendor_id = ?
    `,
      [vendorId],
    );

    return {
      orders: rows,
      total,
    };
  }

  // view vendor details
  async viewVendorOrderDetails(vendorOrderId, vendorId) {
    const [[order]] = await db.execute(
      `
    SELECT
      vo.vendor_order_id,
      vo.vendor_total,
      vo.shipping_status AS vendor_shipping_status,
      vo.created_at,

      o.order_id,
      o.order_ref,
      o.total_amount AS order_total,

      cu.user_id,
      cu.name  AS customer_name,
      cu.email AS customer_email,
      cu.phone AS customer_phone,

      ca.address_type,
      ca.address1,
      ca.address2,
      ca.city,
      ca.zipcode,
      ca.landmark,
      ca.contact_name,
      ca.contact_phone,

      s.state_name,
      c.country_name,

      sh.awb_number,
      sh.courier_name,
      sh.shipping_status

    FROM vendor_orders vo

    JOIN eorders o
      ON vo.order_id = o.order_id

    LEFT JOIN customer cu
      ON o.user_id = cu.user_id

    LEFT JOIN customer_addresses ca
      ON o.address_id = ca.address_id

    LEFT JOIN states s
      ON ca.state_id = s.state_id

    LEFT JOIN countries c
      ON ca.country_id = c.country_id

    LEFT JOIN order_shipments sh
      ON sh.vendor_order_id = vo.vendor_order_id

    WHERE vo.vendor_order_id = ?
    AND vo.vendor_id = ?
    `,
      [vendorOrderId, vendorId],
    );

    if (!order) {
      throw new Error("ORDER_NOT_FOUND");
    }

    // 2) Order Items
    const [items] = await db.execute(
      `
    SELECT
      oi.order_item_id,
      oi.product_id,
      oi.variant_id,
      oi.quantity,
      oi.price,

      p.product_name,
      p.brand_name,

      v.variant_attributes,

      (
        SELECT image_url
        FROM product_variant_images
        WHERE variant_id = oi.variant_id
        ORDER BY sort_order
        LIMIT 1
      ) AS image

    FROM eorder_items oi

    JOIN eproducts p
      ON oi.product_id = p.product_id

    JOIN product_variants v
      ON oi.variant_id = v.variant_id

    WHERE oi.vendor_order_id = ?
    `,
      [vendorOrderId],
    );

    // 3) Parse attributes
    const processedItems = items.map((i) => {
      let attributes = {};
      if (i.variant_attributes) {
        try {
          attributes = JSON.parse(i.variant_attributes);
        } catch {
          attributes = {};
        }
      }

      return {
        order_item_id: i.order_item_id,
        product_id: i.product_id,
        variant_id: i.variant_id,
        product_name: i.product_name,
        brand_name: i.brand_name,
        image: i.image,
        attributes,
        quantity: i.quantity,
        price: i.price,
        item_total: i.quantity * i.price,
      };
    });

    const itemTotal = processedItems.reduce((sum, i) => sum + i.item_total, 0);

    return {
      order: {
        vendor_order_id: order.vendor_order_id,
        order_id: order.order_id,
        order_ref: order.order_ref,
        shipping_status: order.shipping_status,
        awb_number: order.awb_number,
        courier_name: order.courier_name,
        created_at: order.created_at,
        vendor_total: order.vendor_total,
      },

      customer: {
        user_id: order.user_id,
        name: order.customer_name,
        email: order.customer_email,
        phone: order.customer_phone,
      },

      address: {
        type: order.address_type,
        name: order.contact_name,
        phone: order.contact_phone,
        line1: order.address1,
        line2: order.address2,
        city: order.city,
        state: order.state_name,
        country: order.country_name,
        zipcode: order.zipcode,
        landmark: order.landmark,
      },

      items: processedItems,

      summary: {
        item_total: itemTotal,
        vendor_total: order.vendor_total,
      },
    };
  }

  // ==================================== cancellation====================================================
  async getCancellationRequests() {
    const [rows] = await db.execute(
      `
    SELECT
      r.request_id,
      r.order_id,
      r.reason_id,
      rr.reason_text as reason,
      r.comment,
      r.requested_at,

      o.order_ref,
      o.total_amount,
      o.status,
      o.cancellation_status,

      c.name AS customer_name

    FROM order_cancellation_requests r

    JOIN eorders o
      ON r.order_id = o.order_id

    JOIN customer c
      ON r.user_id = c.user_id

    LEFT JOIN order_cancellation_reasons rr
      ON r.reason_id = rr.reason_id

    WHERE o.cancellation_status = 'requested'

    ORDER BY r.requested_at DESC
    `,
    );

    return rows;
  }

  async getCancellationRequestDetails(orderId) {
    // 1 Order + Customer + Address
    const [[order]] = await db.execute(
      `
    SELECT
      o.order_id,
      o.order_ref,
      o.total_amount,
      o.status,
      o.cancellation_status,
      o.address_id,

      c.user_id,
      c.name,
      c.email,
      c.phone,

      r.reason_id,
      r.comment,
      r.requested_at,
      rr.reason_text AS reason,

      ca.address_type,
      ca.address1,
      ca.address2,
      ca.city,
      ca.zipcode,
      ca.landmark,

      s.state_name,
      co.country_name

    FROM order_cancellation_requests r

    JOIN eorders o
      ON r.order_id = o.order_id

    JOIN customer c
      ON r.user_id = c.user_id

    LEFT JOIN order_cancellation_reasons rr
      ON r.reason_id = rr.reason_id

    LEFT JOIN customer_addresses ca
      ON o.address_id = ca.address_id

    LEFT JOIN states s
      ON ca.state_id = s.state_id

    LEFT JOIN countries co
      ON ca.country_id = co.country_id

    WHERE r.order_id = ?
    `,
      [orderId],
    );

    if (!order) {
      throw new Error("ORDER_NOT_FOUND");
    }

    // 2 Cancellation Timeline
    const [timeline] = await db.execute(
      `
    SELECT event, event_time
    FROM order_cancellation_timeline
    WHERE order_id = ?
    ORDER BY event_time ASC
    `,
      [orderId],
    );

    // 3 Refund Details
    const [refunds] = await db.execute(
      `
    SELECT
      refund_amount,
      refund_method,
      status
    FROM order_refunds
    WHERE order_id = ?
    `,
      [orderId],
    );

    const totalRefund = refunds.reduce(
      (sum, r) => sum + Number(r.refund_amount),
      0,
    );

    return {
      order: {
        order_id: order.order_id,
        order_ref: order.order_ref,
        status: order.status,
        cancellation_status: order.cancellation_status,
        total_amount: order.total_amount,
        reason: order.reason,
        comment: order.comment,
        requested_at: order.requested_at,
      },

      customer: {
        user_id: order.user_id,
        name: order.name,
        email: order.email,
        phone: order.phone,
      },

      address: {
        type: order.address_type,
        line1: order.address1,
        line2: order.address2,
        city: order.city,
        state: order.state_name,
        country: order.country_name,
        zipcode: order.zipcode,
        landmark: order.landmark,
      },

      timeline: timeline.map((t) => ({
        label: t.event.replace(/_/g, " "),
        date: t.event_time,
      })),

      refunds: refunds.map((r) => ({
        amount: r.refund_amount,
        method: r.refund_method,
        status: r.status,
      })),

      totalRefund,
    };
  }

  async approveCancellation(orderId, conn) {
    //  0 Validate Order
    const [[order]] = await conn.execute(
      `
      SELECT 
      status, 
      cancellation_status,
      user_id,
      reward_coins_used
    FROM eorders
    WHERE order_id = ?
    `,
      [orderId],
    );

    if (!order) throw new Error("ORDER_NOT_FOUND");

    if (order.cancellation_status !== "requested") {
      throw new Error("INVALID_CANCELLATION_STATE");
    }

    if (order.status === "cancelled") {
      throw new Error("ORDER_ALREADY_CANCELLED");
    }

    // 1 Get payment info
    const [payments] = await conn.execute(
      `
     SELECT
          payment_id,
          razorpay_order_id,
          razorpay_payment_id,
          amount
        FROM order_payments
        WHERE order_id = ?
        AND status = 'success'
        LIMIT 1
        FOR UPDATE
    `,
      [orderId],
    );

    const payment = payments[0] || null;

    // 2 Prevent duplicate refund
    if (payment) {
      const [existingRefund] = await conn.execute(
        `
        SELECT payment_id
        FROM order_payments
        WHERE order_id = ?
        AND status = 'refunded'
        LIMIT 1
        `,
        [orderId],
      );

      if (existingRefund.length) {
        throw new Error("REFUND_ALREADY_DONE");
      }
    }

    // 3 Restore stock
    const [items] = await conn.execute(
      `
    SELECT variant_id, quantity
    FROM eorder_items
    WHERE order_id = ?
    `,
      [orderId],
    );

    for (const item of items) {
      await conn.execute(
        `
      UPDATE product_variants
      SET stock = stock + ?
      WHERE variant_id = ?
      `,
        [item.quantity, item.variant_id],
      );
    }

    /* ===============================
        3.5 REVERSE REWARD COINS
      ================================ */
    if (order.reward_coins_used > 0) {
      // prevent duplicate wallet refund
      const [[walletRefundExists]] = await conn.execute(
        `
        SELECT 1 
        FROM order_refunds
        WHERE order_id = ? 
          AND refund_method = 'wallet'
        LIMIT 1
        `,
        [orderId],
      );

      if (!walletRefundExists) {
        // 1. update wallet balance
        await conn.execute(
          `
            UPDATE customer_wallet
            SET balance = balance + ?
            WHERE user_id = ?
          `,
          [order.reward_coins_used, order.user_id],
        );

        const EXPIRY_MONTHS = parseInt(
          process.env.WALLET_EXPIRY_MONTHS || "3",
          10,
        );

        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + EXPIRY_MONTHS);

        // 2. wallet transaction entry
        await conn.execute(
          `
          INSERT INTO wallet_transactions
          (user_id, title, transaction_type, coins, category, reference_id, expiry_date)
          VALUES (?, ?, 'credit', ?, 'refund', ?, ?)
        `,
          [
            order.user_id,
            "Coins refunded for cancelled order",
            order.reward_coins_used,
            orderId,
            expiryDate,
          ],
        );

        // 3. refund record (wallet)
        await conn.execute(
          `
          INSERT INTO order_refunds
          (order_id, refund_amount, refund_method, status)
          VALUES (?, ?, 'wallet', 'completed')
          `,
          [orderId, order.reward_coins_used],
        );
      }
    }

    // 4 Cancel order
    await conn.execute(
      `
    UPDATE eorders
    SET status = 'cancelled',
        cancellation_status = 'approved'
    WHERE order_id = ?
    `,
      [orderId],
    );

    // 5 Cancel vendor orders
    await conn.execute(
      `
    UPDATE vendor_orders
    SET shipping_status = 'cancelled'
    WHERE order_id = ?
    `,
      [orderId],
    );

    // 6. Cancel shipments
    const [shipments] = await conn.execute(
      `
      SELECT id, awb_number, shipping_status
      FROM order_shipments
      WHERE order_id = ?
    `,
      [orderId],
    );

    for (const s of shipments) {
      if (s.awb_number && ["booked", "picked_up"].includes(s.shipping_status)) {
        try {
          await xpressService.cancelShipmentExpressBees(s.awb_number);
        } catch (e) {
          console.error("Courier cancel failed", e);
        }
      }
    }

    // 7 Cancel shipments
    await conn.execute(
      `
    UPDATE order_shipments
  SET shipping_status = 'cancelled',
      cancelled_at = NOW()
  WHERE order_id = ?
    `,
      [orderId],
    );

    // 8 Timeline event
    await conn.execute(
      `
    INSERT INTO order_cancellation_timeline
    (order_id, event)
    VALUES (?, 'cancellation_confirmed')
    `,
      [orderId],
    );

    // 9 Create refund record
    let refundId = null;
    if (payment) {
      const [result] = await conn.execute(
        `
      INSERT INTO order_refunds
      (order_id, refund_amount, refund_method, status)
      VALUES (?, ?, 'original', 'pending')
      `,
        [orderId, payment.amount],
      );

      refundId = result.insertId;
    }

    return payment ? { ...payment, refundId } : null;
  }

  async rejectCancellation(orderId, conn) {
    await conn.execute(
      `
    UPDATE eorders
    SET cancellation_status = 'rejected'
    WHERE order_id = ?
    `,
      [orderId],
    );

    await conn.execute(
      `
    INSERT INTO order_cancellation_timeline
    (order_id, event)
    VALUES (?, 'cancellation_rejected')
    `,
      [orderId],
    );
  }

  async processRefund(payment, orderId) {
    try {
      // Idempotency check again
      const [existing] = await db.execute(
        `
      SELECT refund_id
      FROM order_refunds
      WHERE order_id = ?
      AND status = 'completed'
      LIMIT 1
      `,
        [orderId],
      );

      if (existing.length) {
        console.log("Refund already completed, skipping");
        return;
      }

      //  Call Razorpay
      const refund = await razorpay.payments.refund(
        payment.razorpay_payment_id,
        {
          amount: Math.round(Number(payment.amount) * 100),
        },
      );

      //  Update refund table
      await db.execute(
        `
      UPDATE order_refunds
      SET status = 'completed'
      WHERE order_id = ?
      AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
      `,
        [orderId],
      );

      // update payment status
      await db.execute(
        `
      UPDATE order_payments
      SET status = 'refunded'
      WHERE order_id = ?
      AND status = 'success'
      `,
        [orderId],
      );

      // Insert refund transaction log
      await db.execute(
        `
      INSERT INTO order_payments
      (
        order_id,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_refund_id,
        amount,
        status,
        payment_method,
        raw_webhook
      )
      VALUES (?, ?, ?, ?, ?, 'refunded', 'razorpay_refund', ?)
      `,
        [
          orderId,
          payment.razorpay_order_id,
          payment.razorpay_payment_id,
          refund.id,
          payment.amount,
          JSON.stringify(refund),
        ],
      );
    } catch (error) {
      console.error("Refund failed:", error);

      // mark failed
      await db.execute(
        `
      UPDATE order_refunds
      SET status = 'failed'
      WHERE order_id = ?
      AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
      `,
        [orderId],
      );
    }
  }
}

module.exports = new OrderModel();
