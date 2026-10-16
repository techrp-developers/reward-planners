const db = require("../../config/database");
const RewardModel = require("../../models/rewardModel");
const { resolveRedemption, calculateRedeemableCoins } = require("../../app/ecommerce/v1/utils/rewardCalculate");
const productModel = require("../models/productModel");
const poolStockModel = require("../models/poolStockModel");
const checkoutModel = require("../models/checkoutModel");
const sessionModel = require("../models/sessionModel");
const scheduleModel = require("../models/scheduleModel");
const { createError } = require("../utils/appError");
const { runNonBlocking } = require("../../utils/nonBlocking");
const { sendFleaMarketOrderPlacedEmails } = require("../../services/mailBuilder/fleaMarketOrderPlaced");

async function buildResultFromExistingInvoices(invoiceIds, userId) {
  const invoices = [];
  for (const invoiceId of invoiceIds) {
    const inv = await checkoutModel.findInvoiceById(invoiceId);
    if (!inv) continue;
    invoices.push({
      invoiceId: inv.invoice_id,
      invoiceNumber: inv.invoice_number,
      vendorId: inv.vendor_id,
      subtotal: Number(inv.subtotal),
      pointsRedeemed: Number(inv.reward_discount),
      amountPaid: Number(inv.grand_total),
    });
  }

  const [[wallet]] = await db.execute(`SELECT balance FROM customer_wallet WHERE user_id = ?`, [userId]);

  return {
    invoices,
    totalPointsRedeemed: invoices.reduce((sum, inv) => sum + inv.pointsRedeemed, 0),
    totalAmountPaid: invoices.reduce((sum, inv) => sum + inv.amountPaid, 0),
    newWalletBalance: wallet?.balance ?? 0,
  };
}

class CheckoutService {
  /**
   * Recomputes price/points from live data inside a single DB transaction — never trusts the
   * client's price/points values, only variantId/qty/requestedPoints. Cart is split into one
   * invoice per eproducts.vendor_id, with a single wallet debit across the whole batch.
   */
  async checkout(session, idempotencyKey, items, options = {}) {
    if (!items || !items.length) {
      throw createError(400, "Checkout requires at least one item");
    }

    const {canonicalRequest,toCents} = require('../utils/checkoutPolicy');
    const request = canonicalRequest(session,options.scheduleId,items,options.payment);
    // Bind before claiming the legacy slot. A historical key without a binding is
    // never adopted, and no binding can be rewritten to a different cart/customer.
    const binding = await db.getConnection();
    try {
      await binding.beginTransaction();
      const [bindingInsert] = await binding.execute(`INSERT IGNORE INTO flea_market_checkout_bindings
        (idempotency_key,session_id,schedule_id,customer_id,manager_user_id,request_hash) VALUES (?,?,?,?,?,?)`,
        [idempotencyKey,session.sessionId,options.scheduleId,session.userId,options.managerId,request.hash]);
      const [[bound]] = await binding.execute('SELECT * FROM flea_market_checkout_bindings WHERE idempotency_key=? FOR UPDATE',[idempotencyKey]);
      if (!bound || bound.request_hash!==request.hash || bound.manager_user_id!==options.managerId || bound.session_id!==session.sessionId) throw createError(409,'Checkout key cannot be reused for a different request');
      const [[legacy]] = await binding.execute('SELECT session_id FROM flea_market_checkout_idempotency WHERE idempotency_key=?',[idempotencyKey]);
      if (legacy && (bindingInsert.affectedRows===1 || legacy.session_id!==session.sessionId)) throw createError(409,'Checkout key belongs to another session');
      await binding.commit();
    } catch(error) { await binding.rollback(); throw error; } finally { binding.release(); }
    const slot = await checkoutModel.acquireProcessingSlot(idempotencyKey,session.sessionId);
    if (slot.state==='completed') return {...await buildResultFromExistingInvoices(slot.invoiceIds,session.userId),checkoutId:idempotencyKey};
    if (slot.state==='in_progress') throw createError(409,'This checkout is already being processed');
    let conn;
    try {
      conn = await db.getConnection();
      await conn.beginTransaction();
      const [[activeSchedule]] = await conn.execute(`SELECT * FROM flea_market_schedules WHERE schedule_id=? FOR UPDATE`,[options.scheduleId]);
      const offset = process.env.FLEA_MARKET_TIMEZONE_OFFSET || '+05:30';
      if (!/^[+-](0\d|1[0-4]):[0-5]\d$/.test(offset)) throw createError(500,'Invalid event timezone configuration');
      const [[clock]] = await conn.execute("SELECT DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00',?),'%Y-%m-%d') today,TIME(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00',?)) time",[offset,offset]);
      if (!activeSchedule || activeSchedule.location_id!==session.locationId || activeSchedule.company_id!==session.companyId ||
        !['scheduled','in_progress'].includes(activeSchedule.status) || String(activeSchedule.scheduled_date).slice(0,10)!==clock.today ||
        (activeSchedule.start_time && clock.time<activeSchedule.start_time) || (activeSchedule.end_time && clock.time>activeSchedule.end_time)) throw createError(409,'Selected event is not billable for this customer location and time');
      const [[customerSession]] = await conn.execute('SELECT status FROM flea_market_sessions WHERE session_id=? FOR UPDATE',[session.sessionId]);
      if (!customerSession || customerSession.status!=='active') throw createError(409,'Select the customer again for a new checkout');
      items=request.cart;
      const lines = [];

      for (const item of items) {
        const variant = await productModel.findVariantForUpdate(item.variantId, conn);

        if (!variant || variant.status !== "approved" || variant.is_deleted || !variant.is_visible) {
          throw createError(404, `Variant ${item.variantId} not found or unavailable`);
        }

        const [[assignment]] = await conn.execute(`SELECT ep.*,ev.collection_model FROM flea_market_event_products ep
          JOIN flea_market_event_vendors ev ON ev.schedule_id=ep.schedule_id AND ev.vendor_id=ep.vendor_id
          WHERE ep.schedule_id=? AND ep.variant_id=? AND ep.status='active' AND ev.status='active' FOR UPDATE`,[options.scheduleId,item.variantId]);
        if (!assignment || assignment.vendor_id!==variant.vendor_id || assignment.product_id!==variant.product_id) throw createError(409,'Product is not assigned to this event/vendor');
        if (assignment.collection_model==='unconfigured') throw createError(409,'Configure payment collection for each participating vendor before billing');
        const pool = await poolStockModel.findByIdForUpdate(assignment.pool_id,conn);
        if (!pool || pool.status!=='active' || pool.vendor_id!==assignment.vendor_id || pool.variant_id!==variant.variant_id ||
          pool.available_qty<item.qty || assignment.assigned_qty-assignment.sold_qty-assignment.released_qty<item.qty) throw createError(409,'Insufficient assigned event stock');
        const unitPrice = Number(assignment.event_selling_price ?? pool.allocation_price ?? variant.sale_price);
        const lineTotal = toCents(unitPrice) * item.qty / 100;
        const rules = await RewardModel.getProductRewards(
          variant.product_id,
          variant.variant_id,
          variant.category_id,
          variant.subcategory_id,
          lineTotal,
          variant.is_discount_eligible,
        );
        const redemption = resolveRedemption(lineTotal, rules);
        const maxAllowed = calculateRedeemableCoins(lineTotal, redemption);
        const pointsApplied = Math.max(0, Math.min(Number(item.pointsApplied) || 0, Math.floor(maxAllowed), Math.floor(lineTotal)));

        lines.push({
          assignmentId:assignment.id,
          recipient:assignment.collection_model,
          poolId: pool.pool_id,
          variantId: variant.variant_id,
          productId: variant.product_id,
          // The pool's vendor is authoritative for a sale — normally matches
          // variant.vendor_id, but the pool is the source of truth now that
          // stock is tracked per vendor rather than per catalog entry.
          vendorId: pool.vendor_id,
          productName: variant.product_name,
          sku: variant.sku,
          qty: item.qty,
          unitPrice,
          lineTotal,
          pointsApplied,
        });
      }

      const payableCents = lines.reduce((sum,line)=>sum+toCents(line.unitPrice)*line.qty-line.pointsApplied*100,0);
      if (request.amountCents!==payableCents) throw createError(409,"Confirmed payment amount does not match the recalculated checkout total");

      const totalPoints = lines.reduce((sum, line) => sum + line.pointsApplied, 0);

      // Redemption requires OTP-proven identity — a session picked from
      // search alone (see otpService.selectCustomer) can check out for
      // cash/card but can't touch the wallet.
      if (totalPoints > 0 && !session.verified) {
        throw createError(400, "Verify the customer's identity before redeeming reward points");
      }

      await conn.execute(
        `INSERT INTO customer_wallet (user_id, balance) VALUES (?, 0) ON DUPLICATE KEY UPDATE balance = balance`,
        [session.userId],
      );
      const wallet = await RewardModel.getWalletForUpdate(conn, session.userId);
      const currentBalance = Number(wallet.balance);

      if (totalPoints > currentBalance) {
        throw createError(400, "Not enough reward points", { available: currentBalance });
      }

      // Only the pool moves here — product_variants.stock was already
      // deducted at top-up time (see poolStockService.topUp) and must not be
      // touched again, or the same units get removed from the master pool
      // twice. Sale logs always carry the live event's schedule_id (unlike
      // top-up/damage, which only tag it when recorded live) — a sale can
      // only ever happen during a specific event, never NULL.
      for (const line of lines) {
        const [reservedSale] = await conn.execute("UPDATE flea_market_event_products SET sold_qty=sold_qty+? WHERE id=? AND assigned_qty-sold_qty-released_qty>=?",[line.qty,line.assignmentId,line.qty]);
        if (!reservedSale.affectedRows) throw createError(409,"Reserved stock changed");
        const sold = await poolStockModel.recordSale(line.poolId, line.qty, conn);
        if (!sold) {
          throw createError(409, `Pooled stock changed for variant ${line.variantId}`, { variantId: line.variantId });
        }
        await poolStockModel.insertLog(
          { poolId: line.poolId, action: "sale", quantity: line.qty, createdBy:options.managerId, scheduleId: activeSchedule.schedule_id },
          conn,
        );
      }

      const vendorGroups = new Map();
      for (const line of lines) {
        if (!vendorGroups.has(line.vendorId)) vendorGroups.set(line.vendorId, []);
        vendorGroups.get(line.vendorId).push(line);
      }

      const invoices = [];
      for (const [vendorId, vendorLines] of vendorGroups) {
        const subtotal = vendorLines.reduce((sum, line) => sum + line.lineTotal, 0);
        const pointsRedeemed = vendorLines.reduce((sum, line) => sum + line.pointsApplied, 0);
        const amountPaid = subtotal - pointsRedeemed;

        const { invoiceId, invoiceNumber } = await checkoutModel.insertInvoice(
          {
            userId: session.userId,
            vendorId,
            subtotal,
            rewardDiscount: pointsRedeemed,
            grandTotal: amountPaid,
            locationId: session.locationId,
            sessionId: session.sessionId,
            scheduleId: activeSchedule.schedule_id,
          },
          conn,
        );

        await checkoutModel.insertInvoiceItems(
          invoiceId,
          vendorLines.map((line) => ({
            productId: line.productId,
            variantId: line.variantId,
            productName: line.productName,
            sku: line.sku,
            quantity: line.qty,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
          })),
          conn,
        );

        await conn.execute(`INSERT INTO flea_market_payments
          (checkout_key,schedule_id,vendor_id,method,amount,status,recipient,reference_number,operator_id,verification_source,confirmed_at)
          VALUES (?,?,?,?,?,'confirmed',?,?,?,?,NOW())`,
          [idempotencyKey,options.scheduleId,vendorId,request.method,amountPaid,vendorLines[0].recipient,request.reference||null,options.managerId,request.method==='cash'?'cashier':'manual_external']);
        invoices.push({ invoiceId, invoiceNumber, vendorId, subtotal, pointsRedeemed, amountPaid });
      }

      const newBalance = currentBalance - totalPoints;

      if (totalPoints > 0) {
        await RewardModel.updateWalletBalance(conn, session.userId, newBalance);
        await RewardModel.insertWalletTransaction(conn, {
          user_id: session.userId,
          title: "Flea Market Redemption",
          description: `Redeemed against invoices ${invoices.map((inv) => inv.invoiceNumber).join(", ")}`,
          type: "debit",
          coins: totalPoints,
          balance_after: newBalance,
          category: "reward",
          // wallet_transactions.reference_id is an INT column (matches the
          // main app's reference_id: order_id convention) — idempotencyKey is
          // a UUID string, so passing it here got silently truncated to its
          // leading digits on insert, colliding with any other checkout whose
          // UUID happened to start with the same digits. invoices[0].invoiceId
          // is a real auto-increment int and unique per checkout: retries of
          // a failed attempt roll back (so it's never reused), and a
          // genuinely completed checkout is replayed via
          // buildResultFromExistingInvoices without re-inserting anything.
          reference_id: invoices[0].invoiceId,
          reason_code: "REDEEM",
        });
      }

      await sessionModel.markCompleted(session.sessionId, conn);
      await checkoutModel.markCompleted(
        idempotencyKey,
        invoices.map((inv) => inv.invoiceId),
        conn,
      );

      await conn.commit();

      runNonBlocking(
        () => sendFleaMarketOrderPlacedEmails(invoices.map((invoice) => invoice.invoiceId)),
        "flea market checkout recipient emails",
      );

      // Best-effort, outside the transaction — a failure here shouldn't undo
      // an otherwise-successful checkout. Only ever flips scheduled -> in_progress.
      try {
        await db.execute("UPDATE flea_market_schedules SET status='in_progress' WHERE schedule_id=? AND status='scheduled'",[options.scheduleId]);
      } catch (scheduleErr) {
        console.error("[flea-market][checkout] failed to auto-start schedule:", scheduleErr);
      }

      return {
        checkoutId:idempotencyKey,
        invoices,
        totalPointsRedeemed: totalPoints,
        totalAmountPaid: invoices.reduce((sum, inv) => sum + inv.amountPaid, 0),
        newWalletBalance: newBalance,
      };
    } catch (err) {
      if (conn) await conn.rollback();
      await checkoutModel.markFailed(idempotencyKey);
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }
}

module.exports = new CheckoutService();
