const db = require("../../config/database");
const { generateInvoiceNumber } = require("../utils/ids");
const { IN_STORE_FALLBACK_VENDOR_ID } = require("../constants");

function parseInvoiceIds(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : JSON.parse(value);
}

class CheckoutModel {
  /**
   * Atomically claims the idempotency key, resolving concurrent/retry cases:
   * - no row yet             -> creates one, state 'new'
   * - previous attempt failed -> resets to 'processing', state 'retry'
   * - already completed      -> state 'completed' with the prior invoiceIds (safe replay)
   * - currently processing   -> state 'in_progress' (a concurrent request owns it)
   */
  async acquireProcessingSlot(key, sessionId) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.execute(
        `SELECT * FROM flea_market_checkout_idempotency WHERE idempotency_key = ? FOR UPDATE`,
        [key],
      );
      const existing = rows[0];

      if (!existing) {
        await conn.execute(
          `INSERT INTO flea_market_checkout_idempotency (idempotency_key, session_id, status) VALUES (?, ?, 'processing')`,
          [key, sessionId],
        );
        await conn.commit();
        return { state: "new" };
      }

      if (existing.status === "completed") {
        await conn.commit();
        return { state: "completed", invoiceIds: parseInvoiceIds(existing.invoice_ids) };
      }

      if (existing.status === "processing") {
        await conn.commit();
        return { state: "in_progress" };
      }

      await conn.execute(`UPDATE flea_market_checkout_idempotency SET status = 'processing' WHERE idempotency_key = ?`, [
        key,
      ]);
      await conn.commit();
      return { state: "retry" };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async markCompleted(key, invoiceIds, conn) {
    await conn.execute(
      `UPDATE flea_market_checkout_idempotency SET status = 'completed', invoice_ids = ? WHERE idempotency_key = ?`,
      [JSON.stringify(invoiceIds), key],
    );
  }

  // Committed independently of the business transaction so 'failed' survives its rollback.
  async markFailed(key) {
    await db.execute(`UPDATE flea_market_checkout_idempotency SET status = 'failed' WHERE idempotency_key = ?`, [
      key,
    ]);
  }

  async insertInvoice({ userId, vendorId, subtotal, rewardDiscount, grandTotal, locationId, sessionId, scheduleId }, conn) {
    const invoiceNumber = generateInvoiceNumber(locationId);

    const [result] = await conn.execute(
      `INSERT INTO invoices
        (invoice_number, order_id, vendor_id, user_id, subtotal, tax_total, shipping_amount,
         reward_discount, grand_total, invoice_status, invoice_date, source, location_id, session_id, schedule_id)
       VALUES (?, 0, ?, ?, ?, 0, 0, ?, ?, 'generated', NOW(), 'flea_market', ?, ?, ?)`,
      [
        invoiceNumber,
        vendorId ?? IN_STORE_FALLBACK_VENDOR_ID,
        userId,
        subtotal,
        rewardDiscount,
        grandTotal,
        locationId,
        sessionId,
        scheduleId,
      ],
    );

    const invoiceId = result.insertId;

    // invoices.order_id is NOT NULL with no FK and no upstream orders table for in-store sales — self-reference it.
    await conn.execute(`UPDATE invoices SET order_id = ? WHERE invoice_id = ?`, [invoiceId, invoiceId]);

    return { invoiceId, invoiceNumber };
  }

  async insertInvoiceItems(invoiceId, items, conn) {
    for (const item of items) {
      await conn.execute(
        `INSERT INTO invoice_items
          (invoice_id, product_id, variant_id, product_name, sku, quantity, unit_price,
           tax_rate, hsn_code, cgst_amount, sgst_amount, igst_amount, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, 0, 0, 0, ?)`,
        [invoiceId, item.productId, item.variantId, item.productName, item.sku, item.quantity, item.unitPrice, item.lineTotal],
      );
    }
  }

  // The "company" on a flea market invoice is the event host (companies, via
  // invoices.location_id -> flea_market_locations.company_id) — distinct from
  // invoices.vendor_id, which is the product vendor the invoice was split by.
  async findInvoiceById(invoiceId) {
    const [rows] = await db.execute(
      `SELECT
         inv.*,
         c.company_name AS fm_company_name,
         c.company_logo AS fm_company_logo,
         v.company_name AS fm_vendor_name,
         customer.name AS customer_name,
         customer.email AS customer_email
       FROM invoices inv
       LEFT JOIN flea_market_locations fl ON fl.location_id = inv.location_id
       LEFT JOIN companies c ON c.company_id = fl.company_id
       LEFT JOIN vendors v ON v.vendor_id = inv.vendor_id
       LEFT JOIN customer ON customer.user_id = inv.user_id
       WHERE inv.invoice_id = ?`,
      [invoiceId],
    );
    return rows[0];
  }

  async findInvoiceItems(invoiceId) {
    const [rows] = await db.execute(`SELECT * FROM invoice_items WHERE invoice_id = ?`, [invoiceId]);
    return rows;
  }
}

module.exports = new CheckoutModel();
