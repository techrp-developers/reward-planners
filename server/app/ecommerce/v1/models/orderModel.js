const db = require("../../../../config/database");
const fs = require("fs");
const path = require("path");

const CDN_BASE_URL = "https://cdn.rewardplanners.com";

// Orders are created before Razorpay payment so stock can be reserved. Hide
// only active payment attempts; cancelled orders remain visible in history.
const CUSTOMER_VISIBLE_ORDER_CONDITION = "o.status <> 'pending_payment'";

function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

const TRACKING_STEPS = [
  { key: "processing", label: "Processing" },
  { key: "shipped", label: "Shipped" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
];

function mapStatusToStep(status) {
  if (["pending", "booking_in_progress", "booked"].includes(status)) return 0;
  if (["picked_up", "in_transit"].includes(status)) return 1;
  if (status === "out_for_delivery") return 2;
  if (status === "delivered") return 3;

  if (["ndr", "rto", "cancelled"].includes(status)) return 1;

  return 0;
}

function mapCancelEvent(event) {
  switch (event) {
    case "cancellation_requested":
      return "Cancellation Requested";
    case "cancellation_confirmed":
      return "Cancellation Confirmed";
    case "refund_initiated":
      return "Refund Initiated";
    case "refund_completed":
      return "Refund Completed";
    case "cancellation_rejected":
      return "Cancellation Rejected";
    default:
      return event;
  }
}

function getSpecialState(shipment) {
  if (shipment.shipping_status === "ndr") {
    return {
      type: "ndr",
      message: shipment.ndr_reason || "Delivery attempt failed",
    };
  }

  if (shipment.shipping_status === "rto") {
    return {
      type: "rto",
      message: "Order is being returned",
    };
  }

  if (shipment.shipping_status === "cancelled") {
    return {
      type: "cancelled",
      message: "Shipment cancelled",
    };
  }

  return null;
}

class orderModel {
  async getOrderHistory({
    userId,
    orderId = null,
    status = null,
    fromDate = null,
    toDate = null,
    timeFilter = null,
    search = null,
    page = 1,
    limit = 10,
  }) {
    const offset = (page - 1) * limit;

    const conditions = [
      "o.user_id = ?",
      CUSTOMER_VISIBLE_ORDER_CONDITION,
    ];
    const params = [userId];

    if (orderId) {
      conditions.push("o.order_id = ?");
      params.push(orderId);
    }

    if (search) {
      conditions.push(`(
      o.order_ref LIKE ?
      OR EXISTS (
        SELECT 1
        FROM eorder_items oi2
        JOIN eproducts p2 ON oi2.product_id = p2.product_id
        WHERE oi2.order_id = o.order_id
        AND (
          p2.product_name LIKE ?
          OR p2.brand_name LIKE ?
        )
      )
  )`);

      const searchValue = `%${search}%`;
      params.push(searchValue, searchValue, searchValue);
    }

    if (status) {
      conditions.push("o.status = ?");
      params.push(status);
    }

    if (fromDate) {
      conditions.push("DATE(o.created_at) >= ?");
      params.push(fromDate);
    }

    if (toDate) {
      conditions.push("DATE(o.created_at) <= ?");
      params.push(toDate);
    }

    if (!fromDate && !toDate && timeFilter) {
      if (timeFilter === "30days") {
        conditions.push("o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
      } else if (timeFilter === "3months") {
        conditions.push("o.created_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)");
      } else if (timeFilter === "6months") {
        conditions.push("o.created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)");
      } else if (/^\d{4}$/.test(timeFilter)) {
        conditions.push("YEAR(o.created_at) = ?");
        params.push(Number(timeFilter));
      }
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const [rows] = await db.execute(
      `
        SELECT
        o.order_id,
        o.order_ref,
        o.total_amount,
        o.reward_coins_earned,
        o.reward_coins_used,
        o.reward_discount,
        o.status,
        o.created_at,

        COUNT(oi.order_item_id) AS item_count,

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

      ${whereClause}

      GROUP BY o.order_id
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?

      `,
      [...params, limit, offset],
    );

    const [[summary]] = await db.execute(
      `
      SELECT
        COALESCE(SUM(CASE WHEN o.status = 'delivered'
                          THEN o.reward_coins_earned ELSE 0 END), 0)
          AS totalCoinsEarned,
        COALESCE(SUM(o.reward_discount), 0) AS totalSavings
      FROM eorders o
      ${whereClause}
      `,
      params,
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
      orders: rows.map((o) => ({
        order_id: o.order_id,
        order_ref: o.order_ref,

        title: o.product_name,
        brand: o.brand_name,
        image: o.image ? getPublicUrl(o.image) : null,

        item_count: o.item_count,

        price: Number(o.total_amount),

        status: o.status,
        created_at: o.created_at,

        reward: {
          earned:
            o.status === "delivered" ? Number(o.reward_coins_earned || 0) : 0,
          used: Number(o.reward_coins_used || 0),
          discount: Number(o.reward_discount || 0),
        },
      })),
      total,
      summary: {
        totalCoinsEarned: Number(summary.totalCoinsEarned || 0),
        totalSavings: Number(summary.totalSavings || 0),
      },
    };
  }

  //   Get order details
  async getOrderDetails({ userId, orderId }) {
    // 1 Order + Address
    const [[order]] = await db.execute(
      `
    SELECT
      o.order_id,
      o.order_ref,
      o.total_amount,
      o.product_total,
      o.reward_discount,
      o.reward_coins_used,
      o.reward_coins_earned,
      o.shipping_total,
      o.status,
      o.created_at,

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

    LEFT JOIN customer_addresses ca
      ON o.address_id = ca.address_id

    LEFT JOIN states s
      ON ca.state_id = s.state_id

    LEFT JOIN countries c
      ON ca.country_id = c.country_id

    WHERE o.order_id = ?
      AND o.user_id = ?
      AND ${CUSTOMER_VISIBLE_ORDER_CONDITION}
    `,
      [orderId, userId],
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
      oi.final_price,
      oi.reward_discount,

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
        image: i.image ? getPublicUrl(i.image) : null,
        attributes,
        quantity: i.quantity,
        price: Number(i.price),
        item_total: Number(i.final_price),
        reward_discount: Number(i.reward_discount || 0),
      };
    });

    // 4 shipping
    const [shipments] = await db.execute(
      `
        SELECT
        os.vendor_id,
        os.courier_name,
        os.awb_number,
        os.shipping_charges,
        os.shipping_status,
        os.label_url,
        os.manifest_url,
        os.booked_at,
        os.picked_up_at,
        os.in_transit_at,
        os.out_for_delivery_at,
        os.delivered_at,
        os.expected_delivery_date,
        os.ndr_reason,
        os.is_ndr_active
        FROM order_shipments os
        WHERE os.order_id = ?
        `,
      [orderId],
    );

    let overallStep = 0;

    if (shipments.length) {
      overallStep = Math.max(
        ...shipments.map((s) => mapStatusToStep(s.shipping_status)),
      );
    }

    const hasNdr = shipments.some((s) => s.shipping_status === "ndr");
    const hasRto = shipments.some((s) => s.shipping_status === "rto");

    if (hasNdr || hasRto) {
      overallStep = 1;
    }

    const orderSteps = TRACKING_STEPS.map((step, index) => ({
      ...step,
      completed: index < overallStep,
      current: index === overallStep,
    }));

    // Final object
    const orderProgress = {
      current_step: overallStep,
      steps: orderSteps,
    };

    const shipmentDetails = shipments.map((s) => {
      const currentStep = mapStatusToStep(s.shipping_status);

      const steps = TRACKING_STEPS.map((step, index) => ({
        ...step,
        completed: index < currentStep,
        current: index === currentStep,
      }));

      const timeline = [
        { label: "Order Processed", time: s.booked_at },
        { label: "Picked Up", time: s.picked_up_at },
        { label: "In Transit", time: s.in_transit_at },
        { label: "Out for Delivery", time: s.out_for_delivery_at },
        { label: "Delivered", time: s.delivered_at },
      ].filter((t) => t.time);

      return {
        vendor_id: s.vendor_id,
        courier_name: s.courier_name,
        awb_number: s.awb_number,
        shipping_status: s.shipping_status,
        shipping_charges: Number(s.shipping_charges ?? 0),
        label_url: s.label_url,
        current_step: currentStep,
        steps,
        timeline,
        expected_delivery_date: s.expected_delivery_date
          ? new Date(s.expected_delivery_date).toISOString().split("T")[0]
          : null,

        special_state: getSpecialState(s),
      };
    });

    return {
      order: {
        order_id: order.order_id,
        order_ref: order.order_ref,
        status: order.status,
        total_amount: order.total_amount,
        created_at: order.created_at,
        is_reward_credited: order.status === "delivered",
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

      shipments: shipmentDetails,
      order_progress: orderProgress,

      summary: {
        item_total: Number(order.product_total),
        shipping_total: Number(order.shipping_total),
        reward_discount: Number(order.reward_discount),
        reward_coins_used: Number(order.reward_coins_used),
        reward_coins_earned: Number(order.reward_coins_earned),
        bag_discount: Math.max(
          0,
          Number(order.product_total) +
            Number(order.shipping_total) -
            Number(order.reward_discount) -
            Number(order.total_amount),
        ),
        order_total: Number(order.total_amount),
      },
    };
  }

  // Buy again
  async getBuyAgainProducts({
    userId,
    page = 1,
    search = null,
    sort = "recent",
    limit = 20,
  }) {
    const offset = (page - 1) * limit;

    const conditions = [
      "o.user_id = ?",
      "p.is_visible = 1",
      "v.is_visible = 1",
    ];
    const params = [userId];

    if (search) {
      conditions.push(`(
      p.product_name LIKE ?
      OR p.brand_name LIKE ?
    )`);

      const value = `%${search}%`;
      params.push(value, value);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    let orderBy = "last_purchased DESC";

    if (sort === "frequent") {
      orderBy = "purchase_count DESC";
    } else if (sort === "price_low") {
      orderBy = "v.sale_price ASC";
    } else if (sort === "price_high") {
      orderBy = "v.sale_price DESC";
    }

    const [rows] = await db.execute(
      `
      SELECT
      p.product_id,
      p.product_name,
      p.brand_name,

      v.variant_id,
      v.sale_price,
      v.mrp,
      v.variant_attributes,

      MAX(o.created_at) AS last_purchased,
      COUNT(oi.order_item_id) AS purchase_count,

      (
        SELECT pi.image_url
        FROM product_images pi
        WHERE pi.product_id = p.product_id
        ORDER BY pi.sort_order ASC
        LIMIT 1
      ) AS image

    FROM eorders o

    JOIN eorder_items oi
      ON o.order_id = oi.order_id

    JOIN eproducts p
      ON oi.product_id = p.product_id

    JOIN product_variants v
      ON oi.variant_id = v.variant_id

    ${whereClause}

    GROUP BY oi.variant_id
    ORDER BY ${orderBy}

    LIMIT ? OFFSET ?
    `,
      [...params, limit, offset],
    );

    const [[{ total }]] = await db.execute(
      `
      SELECT COUNT(DISTINCT oi.variant_id) AS total

      FROM eorders o
      JOIN eorder_items oi
        ON o.order_id = oi.order_id
      JOIN eproducts p
        ON oi.product_id = p.product_id
      JOIN product_variants v
        ON oi.variant_id = v.variant_id

      ${whereClause}
      `,
      params,
    );

    const products = rows.map((p) => {
      let attributes = {};

      if (p.variant_attributes) {
        try {
          attributes = JSON.parse(p.variant_attributes);
        } catch {
          attributes = {};
        }
      }

      return {
        product_id: p.product_id,
        product_name: p.product_name,
        brand_name: p.brand_name,

        variant_id: p.variant_id,
        sale_price: p.sale_price,
        mrp: p.mrp,

        attributes,
        image: p.image ? getPublicUrl(p.image) : null,

        last_purchased: p.last_purchased,
        purchase_count: p.purchase_count,
      };
    });

    return {
      products,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    };
  }

  // Get cancellation Details
  async getCancellationDetails({ userId, orderId }) {
    // 1 Order validation + address + user
    const [[order]] = await db.execute(
      `
    SELECT 
      o.order_id,
      o.order_ref,
      o.address_id,
      o.status, 
      o.total_amount,

      o.product_total,
      o.shipping_total,
      o.reward_discount,
      o.reward_coins_used,
      o.reward_coins_earned,

      ca.address_type,
      ca.address1,
      ca.address2,
      ca.city,
      ca.zipcode,
      ca.landmark,

      cu.name AS customer_name,

      s.state_name,
      c.country_name

    FROM eorders o
    JOIN customer_addresses ca 
      ON o.address_id = ca.address_id
    JOIN customer cu
      ON o.user_id = cu.user_id
    LEFT JOIN states s
      ON ca.state_id = s.state_id
    LEFT JOIN countries c
      ON ca.country_id = c.country_id

    WHERE o.order_id = ?
      AND o.user_id = ?
    `,
      [orderId, userId],
    );

    if (!order) {
      throw new Error("ORDER_NOT_FOUND");
    }

    // 2 Timeline
    const [timeline] = await db.execute(
      `
    SELECT event, event_time
    FROM order_cancellation_timeline
    WHERE order_id = ?
    ORDER BY event_time ASC
    `,
      [orderId],
    );

    // 3 Refunds
    const [refunds] = await db.execute(
      `
    SELECT refund_amount, refund_method, status
    FROM order_refunds
    WHERE order_id = ?
    `,
      [orderId],
    );

    let moneyRefund = 0;
    let coinRefund = 0;

    refunds.forEach((r) => {
      if (r.refund_method === "original") {
        moneyRefund += Number(r.refund_amount);
      } else if (r.refund_method === "wallet") {
        coinRefund += Number(r.refund_amount);
      }
    });

    const totalRefund = moneyRefund + coinRefund;

    return {
      orderId: order.order_id,
      orderRef: order.order_ref,
      status: order.status,

      customer: {
        name: order.customer_name,
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
        label: mapCancelEvent(t.event),
        date: t.event_time,
      })),

      refund: {
        total: totalRefund,
        money_refund: moneyRefund,
        coin_refund: coinRefund,
      },

      rewards: {
        earned: Number(order.reward_coins_earned || 0),
        used: Number(order.reward_coins_used || 0),
        reversed: coinRefund,
        is_credited: false, // cancelled orders never credit rewards
      },

      summary: {
        item_total: Number(order.product_total),
        shipping_total: Number(order.shipping_total),

        reward_discount: Number(order.reward_discount),
        reward_coins_used: Number(order.reward_coins_used),
        reward_coins_earned: Number(order.reward_coins_earned),

        order_total: Number(order.total_amount),
      },
    };
  }

  async getInvoiceData(invoiceId) {
    const [rows] = await db.query(
      `
    SELECT
      i.invoice_id,
      i.invoice_number,
      i.subtotal,
      i.tax_total,
      i.shipping_amount,
      i.reward_discount,
      i.grand_total,
      i.invoice_date,

      o.order_ref,
      o.created_at AS order_date,

      v.vendor_id,
      v.company_name,
      v.gstin,

      va.line1,
      va.line2,
      va.city,
      va.pincode,
      s.state_name,

      ca.contact_name,
      ca.contact_phone AS customer_phone,
      ca.address1,
      ca.address2,
      ca.city AS customer_city,
      ca.zipcode

    FROM invoices i
    JOIN eorders o ON o.order_id = i.order_id

    JOIN vendors v ON v.vendor_id = i.vendor_id
    JOIN vendor_addresses va 
      ON va.vendor_id = v.vendor_id AND va.type='shipping'
    JOIN states s ON s.state_id = va.state_id

    JOIN customer_addresses ca ON ca.address_id = o.address_id

    WHERE i.invoice_id = ?
    LIMIT 1
    `,
      [invoiceId],
    );

    return rows[0];
  }

  async getInvoiceItems(invoiceId) {
    const [items] = await db.query(
      `
    SELECT
      product_name,
      sku,
      quantity,
      unit_price,
      tax_rate,
      cgst_amount,
      sgst_amount,
      igst_amount,
      line_total
    FROM invoice_items
    WHERE invoice_id = ?
    `,
      [invoiceId],
    );

    return items;
  }
}

module.exports = new orderModel();
