const db = require("../../../../config/database");
const {
  enqueueWhatsApp,
} = require("../../../../services/whatsapp/waEnqueueService");
const xpressService = require("../../../../services/ExpressBees/xpressbees_service");
const { sendOpsAlert } = require("../../../../services/alertService");
const {
  orderConfirmationMail,
} = require("../../../../services/mailBuilder/orderConfirmation");
const { runNonBlocking } = require("../../../../utils/nonBlocking");
const { notifyUser } = require("../../../common/utils/notification");
const RefundService = require("../controllers/paymentController");
const {
  consumeWalletReservation,
} = require("../../../../services/rewards/ecommerceWalletService");
const { acceptsFirstPaymentCapture } = require("./lifecyclePolicy");
const {
  shouldSkipCourierBooking,
} = require("./courierBookingPolicy");

// booking payload
async function buildXpressBookingPayload(orderId, vendorId) {
  // 1 Order + Customer Address
  const [[order]] = await db.query(
    `
    SELECT 
      o.order_id,
      o.order_ref,
      o.total_amount,
      ca.contact_name,
      ca.address1,
      ca.address2,
      ca.city,
      ca.zipcode,
      s.state_name,
      ca.contact_phone
    FROM eorders o
    JOIN customer_addresses ca ON o.address_id = ca.address_id
    JOIN states s ON ca.state_id = s.state_id
    WHERE o.order_id = ?
    `,
    [orderId],
  );

  // 2 Shipment Row
  const [[shipment]] = await db.query(
    `
    SELECT * FROM order_shipments
    WHERE order_id = ? AND vendor_id = ?
    `,
    [orderId, vendorId],
  );

  // 3 Vendor Pickup Address
  const [[vendorAddress]] = await db.query(
    `
    SELECT 
      v.company_name,
      vc.primary_contact,
      va.line1,
      va.line2,
      va.line3,
      va.city,
      va.pincode,
      s.state_name
    FROM vendor_addresses va
    JOIN states s ON va.state_id = s.state_id
    JOIN vendor_contacts vc ON va.vendor_id = vc.vendor_id
    JOIN vendors v ON va.vendor_id = v.vendor_id
    WHERE va.vendor_id = ?
      AND va.type = 'shipping'
    LIMIT 1
    `,
    [vendorId],
  );

  // 4 Vendor Items Only
  const [items] = await db.query(
    `
    SELECT 
      oi.quantity,
      oi.price,
      oi.final_price,
      oi.reward_discount,
      p.product_name,
      v.sku
    FROM eorder_items oi
    JOIN eproducts p ON oi.product_id = p.product_id
    JOIN product_variants v ON oi.variant_id = v.variant_id
    WHERE oi.order_id = ?
      AND p.vendor_id = ?
    `,
    [orderId, vendorId],
  );

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
    order_number: `${order.order_ref}-V${vendorId}`,
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

    courier_id: shipment.courier_id,
    collectable_amount: 0,
    order_items: orderItems,
  };
}

async function generateInvoices(orderId, conn) {
  try {
    const result = {
      orderId,
      created: [],
      skippedExisting: [],
      noItems: false,
    };

    // 1 Fetch order items with vendor
    const [items] = await conn.query(
      `
      SELECT
        oi.product_id,
        oi.variant_id,
        oi.quantity,
        oi.price,
        oi.reward_discount,
        oi.final_price,
        p.product_name,
        p.vendor_id,
        p.gst_slab,
        p.hsn_sac_code,
        v.sku
      FROM eorder_items oi
      JOIN eproducts p ON oi.product_id = p.product_id
      JOIN product_variants v ON oi.variant_id = v.variant_id
      WHERE oi.order_id = ?
      `,
      [orderId],
    );

    if (!items.length) {
      result.noItems = true;
      return result;
    }

    // 2 Group items by vendor
    const vendorMap = {};

    for (const item of items) {
      if (!vendorMap[item.vendor_id]) {
        vendorMap[item.vendor_id] = [];
      }
      vendorMap[item.vendor_id].push(item);
    }

    // 3 Create invoice per vendor
    for (const vendorId of Object.keys(vendorMap)) {
      // Prevent duplicates
      const [[existing]] = await conn.query(
        `SELECT invoice_id FROM invoices 
         WHERE order_id = ? AND vendor_id = ? 
         LIMIT 1`,
        [orderId, vendorId],
      );

      if (existing) {
        result.skippedExisting.push({
          vendorId: Number(vendorId),
          invoiceId: existing.invoice_id,
        });
        continue;
      }

      const vendorItems = vendorMap[vendorId];
      const invoiceNumber = `INV-${orderId}-${vendorId}`;

      let subtotal = 0;
      let taxTotal = 0;
      let rewardDiscountTotal = 0;

      // Calculate totals without GST split. Subtotal is before reward
      // discount, and reward discount is shown as a separate deduction.
      for (const item of vendorItems) {
        const lineSubtotal = Number(item.price) * Number(item.quantity);

        subtotal += lineSubtotal;
        rewardDiscountTotal += Number(item.reward_discount || 0);
      }

      // 4 Fetch shipping charges for vendor
      const [[shipment]] = await conn.query(
        `
        SELECT shipping_charges
        FROM order_shipments
        WHERE order_id = ? AND vendor_id = ?
        LIMIT 1
        `,
        [orderId, vendorId],
      );

      const shippingCharges = Number(shipment?.shipping_charges || 0);

      const grandTotal =
        subtotal - rewardDiscountTotal + taxTotal + shippingCharges;

      // 5 Create invoice
      const [invResult] = await conn.query(
        `
        INSERT INTO invoices
        (
          invoice_number,
          order_id,
          vendor_id,
          user_id,
          subtotal,
          tax_total,
          shipping_amount,
          reward_discount,
          grand_total
        )
        SELECT ?, o.order_id, ?, o.user_id, ?, ?, ?, ?, ?
        FROM eorders o
        WHERE o.order_id = ?
        `,
        [
          invoiceNumber,
          vendorId,
          subtotal,
          taxTotal,
          shippingCharges,
          rewardDiscountTotal,
          grandTotal,
          orderId,
        ],
      );

      const invoiceId = invResult.insertId;

      if (!invoiceId) {
        throw new Error(
          `Invoice insert failed for order ${orderId}, vendor ${vendorId}`,
        );
      }

      result.created.push({
        vendorId: Number(vendorId),
        invoiceId,
        invoiceNumber,
      });

      // 6 Insert invoice items
      for (const item of vendorItems) {
        const unitPrice = Number(item.price);
        const lineTotal = unitPrice * Number(item.quantity);

        await conn.query(
          `
            INSERT INTO invoice_items
            (
              invoice_id,
              product_id,
              variant_id,
              product_name,
              sku,
              quantity,
              unit_price,
              tax_rate,
              hsn_code,
              cgst_amount,
              sgst_amount,
              igst_amount,
              line_total
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
          [
            invoiceId,
            item.product_id,
            item.variant_id,
            item.product_name,
            item.sku,
            item.quantity,
            unitPrice,
            0,
            item.hsn_sac_code,
            0,
            0,
            0,
            lineTotal,
          ],
        );
      }
    }

    return result;
  } catch (err) {
    throw err;
  }
}

// shipment updated
async function processShipmentsAfterPayment(orderId) {
  const conn = await db.getConnection();

  try {
    // ==========================
    // GUARD: CHECK IF SHIPMENT SYNC ALREADY COMPLETED
    // ==========================
    const [[order]] = await conn.query(
      `
      SELECT shipment_sync_status, user_id
      FROM eorders 
      WHERE order_id = ?
    `,
      [orderId],
    );

    if (!order) return;

    if (
      shouldSkipCourierBooking({
        userId: order.user_id,
      })
    ) {
      console.warn(
        `[COURIER_TEST_MODE] Skipping courier booking for order ${orderId}, user ${order.user_id}`,
      );
      return { skipped: true, reason: "courier_test_mode" };
    }

    if (order?.shipment_sync_status === "completed") {
      return;
    }

    // ==========================
    // FETCH SHIPMENTS (WITH RETRY + COOLDOWN)
    // ==========================
    const [shipments] = await conn.query(
      `
        SELECT * FROM order_shipments
        WHERE order_id = ?
        AND shipping_status IN ('pending', 'booking_failed')
        AND booking_in_progress = 0
        AND (
          booking_last_attempt_at IS NULL
          OR booking_last_attempt_at < NOW() - INTERVAL 5 MINUTE
        )
      `,
      [orderId],
    );

    if (shipments.length > 0) {
      await conn.query(
        `
          UPDATE eorders
          SET shipment_sync_status = 'in_progress'
          WHERE order_id = ?
        `,
        [orderId],
      );
    }

    for (const shipment of shipments) {
      let attemptedCourierId = shipment.courier_id || null;
      try {
        // 1 Skip if already booked
        if (shipment.shipment_id || shipment.awb_number) {
          continue;
        }

        // 2 Lock the shipment row for booking
        const [lock] = await conn.query(
          `
            UPDATE order_shipments
            SET booking_in_progress = 1,
                booking_last_attempt_at = NOW()
            WHERE id = ?
            AND shipping_status IN ('pending', 'booking_failed')
            AND booking_in_progress = 0
          `,
          [shipment.id],
        );

        if (lock.affectedRows === 0) {
          continue;
        }

        // ==========================
        // COURIER FALLBACK LOGIC
        // ==========================
        const allCouriers = JSON.parse(shipment.courier_options || "[]");
        const attempted = JSON.parse(shipment.attempted_couriers || "[]");

        const remainingCouriers = allCouriers.filter(
          (c) => !attempted.map(String).includes(String(c.id)),
        );

        if (remainingCouriers.length === 0) {
          await conn.query(
            `
            UPDATE order_shipments
            SET shipping_status = 'booking_failed',
                booking_in_progress = 0,
                booking_attempts = 5,
                booking_last_attempt_at = NOW(),
                last_booking_error = 'No untried courier remains'
            WHERE id = ?
            `,
            [shipment.id],
          );
          continue;
        }

        // Pick cheapest available courier
        const nextCourier = remainingCouriers
          .filter((c) => c.total_charges > 0)
          .sort((a, b) => a.total_charges - b.total_charges)[0];

        if (!nextCourier) {
          throw new Error("No valid courier found");
        }
        attemptedCourierId = nextCourier.id;

        // 3 Build payload
        const payload = await buildXpressBookingPayload(
          orderId,
          shipment.vendor_id,
        );

        // Override courier
        payload.courier_id = nextCourier.id;

        // 4 Call booking API
        const xpResponse = await xpressService.bookShipment(payload);

        if (!xpResponse.status) {
          throw new Error(xpResponse.message || "Courier booking failed");
        }

        const data = xpResponse.data;

        // update shipment row
        await conn.query(
          `
          UPDATE order_shipments
          SET courier_id = ?,
              courier_name = ?,
              shipment_id = ?,
              awb_number = ?,
              label_url = ?,
              manifest_url = ?,
              shipping_status = 'booked',
              booking_attempts = booking_attempts + 1,
              booking_in_progress = 0,
              booked_at = NOW(),
              attempted_couriers = JSON_ARRAY_APPEND(
                COALESCE(attempted_couriers, JSON_ARRAY()),
                '$',
                ?
              )
          WHERE id = ?
          `,
          [
            nextCourier.id,
            nextCourier.name,
            data.shipment_id,
            data.awb_number,
            data.label,
            data.manifest,
            nextCourier.id,
            shipment.id,
          ],
        );
        await conn.query(
          `UPDATE vendor_orders SET shipping_status = 'processing'
           WHERE vendor_order_id = ?`,
          [shipment.vendor_order_id],
        );
      } catch (err) {
        console.error(`Shipment booking failed for ${shipment.id}`, err);
        //   HANDLE FAILURE + RELEASE LOCK
        await conn.query(
          `
          UPDATE order_shipments
          SET booking_in_progress = 0,
              booking_attempts = booking_attempts + 1,
              last_booking_error = ?,
              booking_last_attempt_at = NOW(),
              attempted_couriers = JSON_ARRAY_APPEND(
                COALESCE(attempted_couriers, JSON_ARRAY()),
                '$',
                ?
              ),
              shipping_status = CASE
                WHEN booking_attempts + 1 >= 5 THEN 'booking_failed'
                ELSE 'pending'
              END
          WHERE id = ?
          `,
          [err.message, attemptedCourierId, shipment.id],
        );
      }
    }

    // ==========================
    // CHECK PARTIAL FAILURE
    // ==========================
    const [[counts]] = await conn.query(
      `
        SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN shipping_status = 'booked' THEN 1 ELSE 0 END) AS booked
        FROM order_shipments
        WHERE order_id = ?
        AND shipping_status NOT IN ('cancelled')
      `,
      [orderId],
    );

    const totalShipments = Number(counts.total || 0);
    const bookedShipments = Number(counts.booked || 0);

    if (totalShipments === 0 || bookedShipments === totalShipments) {
      //  All shipments booked
      await conn.query(
        `
        UPDATE eorders
        SET shipment_sync_status = 'completed',
            status = CASE WHEN status = 'paid' THEN 'processing' ELSE status END
        WHERE order_id = ?
      `,
        [orderId],
      );
    } else if (bookedShipments > 0) {
      // Partial success
      await conn.query(
        `
        UPDATE eorders
        SET shipment_sync_status = 'partial'
        WHERE order_id = ?
      `,
        [orderId],
      );

      sendOpsAlert({
        level: "warning",
        category: "shipment_booking",
        message: `Partial shipment booking failure for order ${orderId}`,
        meta: { orderId, booked: bookedShipments, total: totalShipments },
      }).catch(() => {});
    } else {
      // All failed
      await conn.query(
        `
        UPDATE eorders
        SET shipment_sync_status = 'failed'
        WHERE order_id = ?
      `,
        [orderId],
      );

      sendOpsAlert({
        level: "critical",
        category: "shipment_booking",
        message: `ALL shipments booking_failed for order ${orderId} — manual intervention required`,
        meta: { orderId, total: totalShipments },
      }).catch(() => {});
    }
  } finally {
    conn.release();
  }
}

// send whatsapp
async function sendOrderPlacedWhatsApp(orderId) {
  const [rows] = await db.query(
    `SELECT 
        o.order_id,
        o.order_ref,
        o.company_id,
        o.total_amount,
        cu.name AS customer_name,
        cu.phone
     FROM eorders o
     JOIN customer cu ON cu.user_id = o.user_id
     WHERE o.order_id = ?
     LIMIT 1`,
    [orderId],
  );

  if (!rows.length) return;

  const ctx = rows[0];

  if (!ctx.phone) return;

  await enqueueWhatsApp({
    eventName: "order_place_confirm",
    ctx: {
      phone: ctx.phone,
      company_id: ctx.company_id ?? null,
      customer_name: ctx.customer_name || "User",
      order_id: ctx.order_ref || ctx.order_id,
      total_amount: ctx.total_amount,
    },
  });
}

// send email
async function sendOrderPlacedEmail(orderId) {
  try {
    const [rows] = await db.query(
      `SELECT 
        o.order_ref,
        o.total_amount,
        cu.name AS customer_name,
        cu.email
     FROM eorders o
     JOIN customer cu ON cu.user_id = o.user_id
     WHERE o.order_id = ?
     LIMIT 1`,
      [orderId],
    );

    if (!rows.length) return;

    const ctx = rows[0];

    if (!ctx.email) return;

    await orderConfirmationMail({
      name: ctx.customer_name,
      email: ctx.email,
      amount: ctx.total_amount,
      orderId: ctx.order_ref,
    });
  } catch (err) {
    console.error("Email sending error:", err);
  }
}

// webhook
async function processEvent(req) {
  const conn = await db.getConnection();
  let transactionStarted = false;

  try {
    const body = req.parsedBody;
    const event = body.event;

    if (event === "payment.captured") {
      const payment = body.payload.payment.entity;

      if (!payment?.order_id) {
        console.error("Invalid webhook: missing order_id");
        return;
      }

      await conn.beginTransaction();
      transactionStarted = true;

      let [rows] = await conn.query(
        `SELECT payment_id, order_id, amount, status
         FROM order_payments
         WHERE razorpay_order_id = ?
         LIMIT 1`,
        [payment.order_id],
      );

      if (!rows.length) {
        const notedOrderId = Number(payment.notes?.order_id);
        const [[recoverableOrder]] = await conn.query(
          `SELECT order_id, total_amount
           FROM eorders WHERE order_id = ? FOR UPDATE`,
          [notedOrderId || 0],
        );

        if (
          !recoverableOrder ||
          Number(payment.amount) !==
            Math.round(Number(recoverableOrder.total_amount) * 100)
        ) {
          throw new Error(`PAYMENT_ROW_NOT_FOUND:${payment.order_id}`);
        }

        const [recovered] = await conn.query(
          `INSERT INTO order_payments
            (order_id, razorpay_order_id, amount, status)
           VALUES (?, ?, ?, 'created')`,
          [
            recoverableOrder.order_id,
            payment.order_id,
            recoverableOrder.total_amount,
          ],
        );
        rows = [
          {
            payment_id: recovered.insertId,
            order_id: recoverableOrder.order_id,
            amount: recoverableOrder.total_amount,
            status: "created",
          },
        ];
      }

      const { payment_id, order_id, amount, status } = rows[0];

      const [[eorder]] = await conn.query(
        `SELECT status FROM eorders WHERE order_id = ? FOR UPDATE`,
        [order_id],
      );

      if (!eorder) {
        // ==========================
        // OPS ALERT — payment captured but no eorder row
        // Should never happen — indicates DB inconsistency
        // ==========================
        sendOpsAlert({
          level: "critical",
          category: "webhook_payment",
          message: `payment.captured received but eorder not found — money received with no order`,
          meta: {
            order_id,
            razorpay_order_id: payment.order_id,
            razorpay_payment_id: payment.id,
            amount: payment.amount / 100,
          },
        }).catch(() => {});

        console.error(`[WEBHOOK] eorder not found for order_id ${order_id}`);
        await conn.commit();
        return;
      }

      const [[lockedPayment]] = await conn.query(
        `SELECT status FROM order_payments WHERE payment_id = ? FOR UPDATE`,
        [payment_id],
      );
      if (lockedPayment?.status === "success") {
        await conn.commit();
        return;
      }

      if (!acceptsFirstPaymentCapture(eorder.status)) {
        // ==========================
        // OPS ALERT — payment captured on cancelled order
        // Money is in — auto-refund will trigger but ops should know
        // ==========================
        sendOpsAlert({
          level: "warning",
          category: "webhook_payment",
          message: `Payment captured on cancelled order ${order_id} — auto-refund triggered`,
          meta: {
            order_id,
            razorpay_order_id: payment.order_id,
            razorpay_payment_id: payment.id,
            amount: payment.amount / 100,
          },
        }).catch(() => {});

        console.warn(
          `[WEBHOOK] Payment captured on cancelled order ${order_id} — triggering refund`,
        );

        await conn.query(
          `UPDATE order_payments
           SET razorpay_payment_id = ?,
               status = 'success',
               payment_method = ?,
               raw_webhook = ?
           WHERE razorpay_order_id = ? AND status != 'success'`,
          [payment.id, payment.method, JSON.stringify(body), payment.order_id],
        );

        await conn.commit();

        RefundService.processRefund({
          orderId: order_id,
          paymentId: payment_id,
          razorpayPaymentId: payment.id,
          amount: Number(amount),
          refundKey: `payment_${payment_id}_duplicate_refund`,
        }).catch((err) => {
          // ==========================
          // OPS ALERT — auto-refund failed
          // Money is sitting unrefunded — needs manual action
          // ==========================
          sendOpsAlert({
            level: "critical",
            category: "refund",
            message: `Auto-refund FAILED for cancelled order ${order_id} — MANUAL REFUND REQUIRED`,
            meta: {
              order_id,
              razorpay_payment_id: payment.id,
              amount: payment.amount / 100,
              error: err.message,
            },
          }).catch(() => {});

          console.error(
            `[WEBHOOK] Auto-refund failed for cancelled order ${order_id}:`,
            err,
          );
        });

        return;
      }

      if (
        Number(payment.amount) !== Math.round(Number(amount) * 100) ||
        payment.currency !== "INR"
      ) {
        await conn.query(
          `UPDATE order_payments
           SET razorpay_payment_id = ?, status = 'success', payment_method = ?,
               raw_webhook = ?
           WHERE payment_id = ?`,
          [payment.id, payment.method, JSON.stringify(body), payment_id],
        );
        await conn.commit();
        await RefundService.processRefund({
          orderId: order_id,
          paymentId: payment_id,
          razorpayPaymentId: payment.id,
          amount: Number(payment.amount) / 100,
          refundKey: `payment_${payment_id}_amount_mismatch_refund`,
        });
        return;
      }

      await conn.query(
        `UPDATE order_payments
         SET razorpay_payment_id = ?, status = 'success', payment_method = ?,
             raw_webhook = ?
         WHERE payment_id = ?`,
        [payment.id, payment.method, JSON.stringify(body), payment_id],
      );

      // 5 Update order status
      await conn.query(
        `UPDATE eorders
        SET status = 'paid',
          paid_at = NOW(),
          expires_at = NULL
        WHERE order_id = ?`,
        [order_id],
      );

      // ==========================
      // WALLET + REWARD PROCESSING
      // ==========================

      const [[orderInfo]] = await conn.query(
        `
        SELECT
          user_id,
          reward_coins_used,
          reward_coins_earned
        FROM eorders
        WHERE order_id = ?
        FOR UPDATE
        `,
        [order_id],
      );

      if (!orderInfo) {
        throw new Error("ORDER_NOT_FOUND");
      }

      const userId = orderInfo.user_id;
      const redeemedCoins = Number(orderInfo.reward_coins_used || 0);
      const earnedCoins = Number(orderInfo.reward_coins_earned || 0);

      await consumeWalletReservation(conn, {
        orderId: order_id,
        userId,
        coins: redeemedCoins,
      });

      // ==========================
      // GENERATE INVOICE
      // ==========================

      await generateInvoices(order_id, conn);

      // 6 Shipment update
      await conn.query(
        `UPDATE order_shipments
         SET shipping_status = 'pending'
         WHERE order_id = ?
           AND shipping_status = 'awaiting_payment'`,
        [order_id],
      );

      await conn.commit();

      notifyUser(
        {
          userId,
          module: "ecommerce",
          type: "order_paid",
          title: "Order confirmed",
          message: "Your order is confirmed and being processed.",
          icon: "shopping-bag",
          reference_type: "order",
          reference_id: order_id,
          action_url: `/orders/order-details/${order_id}`,
          metadata: {
            reward_coins_used: redeemedCoins,
            reward_coins_earned: earnedCoins,
          },
        },
        "ecommerce order paid notification",
      );

      processShipmentsAfterPayment(order_id).catch((err) => {
        // ==========================
        // OPS ALERT — shipment processing failed after payment
        // Order is paid but stuck — retry cron will attempt recovery
        // but ops should be aware
        // ==========================
        sendOpsAlert({
          level: "warning",
          category: "shipment_booking",
          message: `Shipment processing failed after payment for order ${order_id} — retry cron will handle`,
          meta: {
            order_id,
            error: err.message,
          },
        }).catch(() => {});

        console.error("Shipment processing failed:", err);
      });

      runNonBlocking(
        () => sendOrderPlacedWhatsApp(order_id),
        "order placed WhatsApp",
      );

      runNonBlocking(
        () => sendOrderPlacedEmail(order_id),
        "order placed email",
      );

      console.log("Ecommerce payment success", {
        order_id,
        razorpay_order_id: payment.order_id,
        payment_id: payment.id,
      });
    }

    if (event === "payment.failed") {
      const payment = body.payload.payment.entity;

      if (!payment?.order_id) {
        console.error("Invalid webhook: missing order_id");
        return;
      }

      await conn.beginTransaction();
      transactionStarted = true;

      let [[existingPayment]] = await conn.query(
        `SELECT payment_id, status, order_id
         FROM order_payments
         WHERE razorpay_order_id = ?
         LIMIT 1`,
        [payment.order_id],
      );

      if (!existingPayment) {
        // ==========================
        // OPS ALERT — failed payment with no matching row
        // Could indicate webhook from a different environment
        // hitting production, or a DB issue
        // ==========================
        sendOpsAlert({
          level: "warning",
          category: "webhook_payment",
          message: `payment.failed received but no matching order_payments row found`,
          meta: {
            razorpay_order_id: payment.order_id,
            razorpay_payment_id: payment.id,
          },
        }).catch(() => {});

        console.error("[WEBHOOK] payment.failed — payment row not found", {
          razorpay_order_id: payment.order_id,
        });
        await conn.commit();
        return;
      }

      await conn.query(
        `SELECT order_id FROM eorders WHERE order_id = ? FOR UPDATE`,
        [existingPayment.order_id],
      );
      [[existingPayment]] = await conn.query(
        `SELECT payment_id, status, order_id
         FROM order_payments WHERE payment_id = ? FOR UPDATE`,
        [existingPayment.payment_id],
      );

      if (existingPayment.status === "success") {
        // ==========================
        // OPS ALERT — Razorpay sent failed AFTER captured
        // This is a Razorpay anomaly — investigate
        // ==========================
        sendOpsAlert({
          level: "warning",
          category: "webhook_payment",
          message: `payment.failed received after payment already succeeded for order ${existingPayment.order_id} — Razorpay anomaly`,
          meta: {
            order_id: existingPayment.order_id,
            razorpay_order_id: payment.order_id,
            razorpay_payment_id: payment.id,
          },
        }).catch(() => {});

        console.warn(
          "[WEBHOOK] payment.failed received but payment already succeeded — ignoring",
          { razorpay_order_id: payment.order_id },
        );
        await conn.commit();
        return;
      }

      if (existingPayment.status === "failed") {
        await conn.commit();
        return;
      }

      await conn.query(
        `UPDATE order_payments
         SET status = 'failed',
             raw_webhook = ?
         WHERE razorpay_order_id = ?
           AND status NOT IN ('success', 'failed')`,
        [JSON.stringify(body), payment.order_id],
      );

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 15);

      await conn.query(
        `UPDATE eorders
         SET expires_at = ?
         WHERE order_id = ?
           AND status = 'pending_payment'`,
        [expiresAt, existingPayment.order_id],
      );

      await conn.commit();

      console.log("[WEBHOOK] Ecommerce payment failed", {
        razorpay_order_id: payment.order_id,
        payment_id: payment.id,
        order_id: existingPayment.order_id,
        error_code: payment.error_code,
        error_description: payment.error_description,
      });
    }
  } catch (err) {
    if (transactionStarted) {
      await conn.rollback();
    }

    // ==========================
    // OPS ALERT — unhandled webhook error
    // Transaction rolled back — investigate immediately
    // ==========================
    sendOpsAlert({
      level: "critical",
      category: "webhook_payment",
      message: `Unhandled webhook error — transaction rolled back`,
      meta: {
        event: req.parsedBody?.event,
        error: err.message,
      },
    }).catch(() => {});

    console.error("Ecommerce Webhook error:", err);
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  processEvent,
  processShipmentsAfterPayment,
};
