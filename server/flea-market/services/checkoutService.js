const db = require("../../config/database");
const RewardModel = require("../../models/rewardModel");
const { resolveRedemption, calculateRedeemableCoins } = require("../../app/ecommerce/v1/utils/rewardCalculate");
const productModel = require("../models/productModel");
const poolStockModel = require("../models/poolStockModel");
const checkoutModel = require("../models/checkoutModel");
const sessionModel = require("../models/sessionModel");
const scheduleModel = require("../models/scheduleModel");
const { createError } = require("../utils/appError");

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
  async checkout(session, idempotencyKey, items) {
    if (!items || !items.length) {
      throw createError(400, "Checkout requires at least one item");
    }

    const slot = await checkoutModel.acquireProcessingSlot(idempotencyKey, session.sessionId);

    if (slot.state === "completed") {
      return buildResultFromExistingInvoices(slot.invoiceIds, session.userId);
    }
    if (slot.state === "in_progress") {
      throw createError(409, "This checkout is already being processed");
    }

    // Only one flea market event ever runs at a time, so pooled stock isn't
    // schedule-scoped anymore — but a sale still genuinely happens during a
    // specific live event, so this gate stays: it's what tags the invoice
    // and the sale log with which event this checkout belongs to.
    const activeSchedule = await scheduleModel.findGateEntryForLocationToday(session.locationId);
    if (!activeSchedule) {
      throw createError(400, "No active flea market event for this location today");
    }

    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const lines = [];

      for (const item of items) {
        const variant = await productModel.findVariantForUpdate(item.variantId, conn);

        if (!variant || variant.status !== "approved" || variant.is_deleted || !variant.is_visible) {
          throw createError(404, `Variant ${item.variantId} not found or unavailable`);
        }

        const pool = await poolStockModel.findActiveByVariant(item.variantId, conn);
        if (!pool) {
          throw createError(404, `Variant ${item.variantId} has no active flea market stock pool`, {
            variantId: item.variantId,
          });
        }
        if (pool.available_qty < item.qty) {
          throw createError(409, `Insufficient pooled stock for variant ${item.variantId}`, {
            variantId: item.variantId,
            available: pool.available_qty,
          });
        }

        // allocation_price overrides the catalog sale_price, if set.
        const unitPrice = pool.allocation_price != null ? Number(pool.allocation_price) : Number(variant.sale_price);
        const lineTotal = unitPrice * item.qty;
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
        const pointsApplied = Math.max(0, Math.min(Number(item.pointsApplied) || 0, maxAllowed));

        lines.push({
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
        const sold = await poolStockModel.recordSale(line.poolId, line.qty, conn);
        if (!sold) {
          throw createError(409, `Pooled stock changed for variant ${line.variantId}`, { variantId: line.variantId });
        }
        await poolStockModel.insertLog(
          { poolId: line.poolId, action: "sale", quantity: line.qty, scheduleId: activeSchedule.schedule_id },
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

      // Best-effort, outside the transaction — a failure here shouldn't undo
      // an otherwise-successful checkout. Only ever flips scheduled -> in_progress.
      try {
        await scheduleModel.autoStartIfScheduled(session.locationId);
      } catch (scheduleErr) {
        console.error("[flea-market][checkout] failed to auto-start schedule:", scheduleErr);
      }

      return {
        invoices,
        totalPointsRedeemed: totalPoints,
        totalAmountPaid: invoices.reduce((sum, inv) => sum + inv.amountPaid, 0),
        newWalletBalance: newBalance,
      };
    } catch (err) {
      await conn.rollback();
      await checkoutModel.markFailed(idempotencyKey);
      throw err;
    } finally {
      conn.release();
    }
  }
}

module.exports = new CheckoutService();
