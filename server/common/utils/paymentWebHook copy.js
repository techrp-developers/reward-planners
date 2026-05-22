const crypto = require("crypto");
const db = require("../../config/database");
const { enqueueWhatsApp } = require("../../services/whatsapp/waEnqueueService");
const xpressService = require("../../services/ExpressBees/xpressbees_service");
const { orderConfirmationMail } = require("../../services/orderConfirmation");

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
    (sum, i) => sum + Number(i.price) * Number(i.quantity),
    0,
  );

  return {
    order_number: order.order_ref,
    unique_order_number: "yes",
    shipping_charges: shipment.shipping_charges,
    discount: 0,
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

// shipment updated
async function processShipmentsAfterPayment(orderId) {
  const conn = await db.getConnection();

  try {
    // ==========================
    // GUARD: CHECK IF SHIPMENT SYNC ALREADY COMPLETED
    // ==========================
    const [[order]] = await conn.query(
      `
      SELECT shipment_sync_status 
      FROM eorders 
      WHERE order_id = ?
    `,
      [orderId],
    );

    if (!order) return;

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
      try {
        // 1 Skip if already booked
        if (shipment.shipment_id || shipment.awb_number) {
          continue;
        }

        // 2 Lock the shipment row for booking
        const [lock] = await conn.query(
          `
            UPDATE order_shipments
            SET booking_in_progress = 1
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
          (c) => !attempted.includes(c.id),
        );

        if (remainingCouriers.length === 0) {
          await conn.query(
            `
            UPDATE order_shipments
            SET shipping_status = 'booking_failed',
                booking_in_progress = 0
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
          [err.message, shipment.courier_id || null, shipment.id],
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

    if (counts.booked === counts.total) {
      //  All shipments booked
      await conn.query(
        `
        UPDATE eorders
        SET shipment_sync_status = 'completed'
        WHERE order_id = ?
      `,
        [orderId],
      );
    } else if (counts.booked > 0) {
      // Partial success
      await conn.query(
        `
        UPDATE eorders
        SET shipment_sync_status = 'partial'
        WHERE order_id = ?
      `,
        [orderId],
      );
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
async function handleWebhook(req, res) {
  const conn = await db.getConnection();

  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    // 1 Verify signature
    const expected = crypto
      .createHmac("sha256", secret)
      .update(req.body)
      .digest("hex");

    if (expected !== signature) {
      return res.status(400).send("Invalid signature");
    }

    const body = JSON.parse(req.body.toString());
    const event = body.event;

    if (event === "payment.captured") {
      const payment = body.payload.payment.entity;

      await conn.beginTransaction();

      // 2 Get payment row
      const [rows] = await conn.query(
        `SELECT order_id, status
          FROM order_payments
          WHERE razorpay_order_id = ?
          FOR UPDATE`,
        [payment.order_id],
      );

      if (!rows.length) {
        await conn.commit();
        return res.sendStatus(200);
      }

      const { order_id, status } = rows[0];

      // 3 Idempotency check
      if (status === "success") {
        await conn.commit();
        return res.sendStatus(200);
      }

      // 4 Update payment row
      await conn.query(
        `UPDATE order_payments 
         SET razorpay_payment_id = ?, 
             status = 'success',
             payment_method = ?,
             raw_webhook = ?
         WHERE razorpay_order_id = ?`,
        [payment.id, payment.method, JSON.stringify(body), payment.order_id],
      );

      // 5 Update order status
      await conn.query(
        `UPDATE eorders 
         SET status = 'paid' 
         WHERE order_id = ?`,
        [order_id],
      );

      // 6 Shipment update
      await conn.query(
        `UPDATE order_shipments
         SET shipping_status = 'pending'
         WHERE order_id = ?
           AND shipping_status = 'awaiting_payment'`,
        [order_id],
      );

      await conn.commit();

      // 6 Process shipments async
      processShipmentsAfterPayment(order_id).catch((err) =>
        console.error("Shipment processing failed:", err),
      );

      // 7 Send WhatsApp
      sendOrderPlacedWhatsApp(order_id).catch((err) =>
        console.error("WA failed:", err),
      );

      // 8 Send Email
      sendOrderPlacedEmail(order_id).catch((err) =>
        console.error("Email failed:", err),
      );
    }

    if (event === "payment.failed") {
      const payment = body.payload.payment.entity;

      await conn.query(
        `UPDATE order_payments 
         SET status = 'failed',
             raw_webhook = ?
         WHERE razorpay_order_id = ?`,
        [JSON.stringify(body), payment.order_id],
      );
    }

    return res.sendStatus(200);
  } catch (err) {
    await conn.rollback();
    console.error("Webhook error:", err);
    return res.sendStatus(500);
  } finally {
    conn.release();
  }
}

module.exports = { handleWebhook, processShipmentsAfterPayment };
