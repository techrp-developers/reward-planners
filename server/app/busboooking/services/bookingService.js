const srdvClient = require("../utils/srdvClient");
const db = require("../../../config/database");
const { sendOpsAlert } = require("../../../services/alertService");
const {
  getBookingDecision,
  getBlockTtlMinutes,
  classifyBookOutcome,
  classifyCancellationEntry,
  getRefundableAmount,
} = require("../utils/workflowPolicy");
const { enqueueRefund, processRefund } = require("./refundService");

const ORDER_COLUMNS = `
  id, user_id, order_ref, trace_id, srdv_index, result_index, seat_count,
  total_amount, reward_coins_used, status, payment_status,
  provider_booking_id, ticket_no, travel_operator_pnr, booking_error`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getOrder(orderId) {
  const [[order]] = await db.execute(
    `SELECT ${ORDER_COLUMNS} FROM busbooking_orders WHERE id = ? LIMIT 1`,
    [orderId],
  );
  return order || null;
}

// Atomically moves a paid order into booking_in_progress. Only the caller that
// wins this transition may call the provider, so the app, the cron and a
// double tap can never send two Book requests for one order.
async function claimForBooking(orderId) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.execute(
      `SELECT ${ORDER_COLUMNS}
         FROM busbooking_orders
        WHERE id = ?
        LIMIT 1
        FOR UPDATE`,
      [orderId],
    );

    const decision = getBookingDecision(order);
    if (decision === "book") {
      await conn.execute(
        `UPDATE busbooking_orders
            SET status = 'booking_in_progress',
                booking_attempted_at = NOW(),
                booking_error = NULL
          WHERE id = ?`,
        [orderId],
      );
    }
    await conn.commit();
    return { decision, order };
  } catch (error) {
    try {
      await conn.rollback();
    } catch {}
    throw error;
  } finally {
    conn.release();
  }
}

async function callProviderBook(order) {
  try {
    const traceId = Number(String(order.trace_id ?? "").trim());
    const resultIndex = String(order.result_index ?? "").trim();
    if (
      !Number.isSafeInteger(traceId) ||
      traceId <= 0 ||
      resultIndex.length < 3 ||
      resultIndex.length > 500
    ) {
      throw new Error("Stored booking has invalid provider identifiers");
    }

    const response = await srdvClient.post(
      process.env.SRDV_BOOK_URL,
      {
        TraceId: traceId,
        ResultIndex: resultIndex,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Api-Token": process.env.SRDV_API_TOKEN,
        },
        timeout: 30000,
      },
    );
    return { data: response.data };
  } catch (error) {
    return { error };
  }
}

async function markConfirmed(orderId, booking, rawResponse) {
  await db.execute(
    `UPDATE busbooking_orders
        SET status = 'confirmed',
            provider_booking_id = ?,
            ticket_no = ?,
            travel_operator_pnr = ?,
            raw_book_response = COALESCE(?, raw_book_response),
            booking_error = NULL
      WHERE id = ?
        AND status IN ('booking_in_progress', 'booking_review')`,
    [
      booking.bookingId,
      booking.ticketNo,
      booking.travelOperatorPNR,
      rawResponse ? JSON.stringify(rawResponse) : null,
      orderId,
    ],
  );
}

// A booking that definitely did not happen: record it and the full refund it
// is owed in one transaction, then send the refund.
async function markFailedAndRefund(order, message, rawResponse) {
  const conn = await db.getConnection();
  let refundId = null;

  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      `UPDATE busbooking_orders
          SET status = 'booking_failed',
              booking_error = ?,
              raw_book_response = COALESCE(?, raw_book_response)
        WHERE id = ?
          AND status IN ('booking_in_progress', 'booking_review')`,
      [
        String(message || "Booking failed").slice(0, 1000),
        rawResponse ? JSON.stringify(rawResponse) : null,
        order.id,
      ],
    );

    if (result.affectedRows) {
      const amount = getRefundableAmount({
        requested: Number(order.total_amount) - Number(order.reward_coins_used),
        paid: Number(order.total_amount) - Number(order.reward_coins_used),
      });
      if (amount > 0) {
        refundId = await enqueueRefund(conn, {
          orderId: order.id,
          userId: order.user_id,
          reason: "booking_failed",
          refundKey: `busbooking_${order.id}_booking_failed`,
          amount,
        });
      }
    }
    await conn.commit();
  } catch (error) {
    try {
      await conn.rollback();
    } catch {}
    throw error;
  } finally {
    conn.release();
  }

  // The cron retries anything this attempt leaves unfinished.
  if (refundId) await processRefund(refundId);
}

async function markForReview(order, message, rawResponse = null) {
  await db.execute(
    `UPDATE busbooking_orders
        SET status = 'booking_review',
            booking_error = ?,
            raw_book_response = COALESCE(?, raw_book_response)
      WHERE id = ? AND status = 'booking_in_progress'`,
    [
      String(message || "Booking outcome unknown").slice(0, 1000),
      rawResponse ? JSON.stringify(rawResponse) : null,
      order.id,
    ],
  );
  await sendOpsAlert({
    level: "critical",
    category: "busbooking_review",
    message: `Bus booking ${order.order_ref} was paid but its provider outcome is unknown`,
    meta: { orderId: order.id, traceId: order.trace_id, reason: message },
  });
}

// Books a paid order with the provider. Returns the decision that was reached
// and the order as it now stands; never throws for provider failures.
async function bookOrder(orderId) {
  const { decision, order } = await claimForBooking(orderId);
  if (decision !== "book") return { decision, order };

  const providerCall = await callProviderBook(order);
  const result = classifyBookOutcome(providerCall);

  try {
    if (result.outcome === "confirmed") {
      await markConfirmed(order.id, result, providerCall.data);
    } else if (result.outcome === "failed") {
      console.error("[BusBooking][Book] Provider rejected booking", {
        orderRef: order.order_ref,
        errorCode: result.errorCode,
        message: result.message,
      });
      await markFailedAndRefund(order, result.message, providerCall.data);
    } else {
      await markForReview(order, result.message, providerCall.data);
    }
  } catch (error) {
    // The provider has answered but the answer could not be saved. The order
    // stays in booking_in_progress and the cron escalates it for review.
    await sendOpsAlert({
      level: "critical",
      category: "busbooking_review",
      message: `Bus booking ${order.order_ref}: provider outcome "${result.outcome}" could not be recorded`,
      meta: {
        orderId: order.id,
        bookingId: result.bookingId || null,
        ticketNo: result.ticketNo || null,
        error: error.message,
      },
    });
  }

  const current = await getOrder(order.id);
  return { decision: getBookingDecision(current), order: current, attempted: true };
}

// Used when another request already owns the provider call.
async function waitForBookingResult(orderId, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  let order = await getOrder(orderId);

  while (order?.status === "booking_in_progress" && Date.now() < deadline) {
    await sleep(1000);
    order = await getOrder(orderId);
  }
  return { decision: getBookingDecision(order), order };
}

// Staff decision for an order whose provider outcome could not be determined.
async function resolveReviewedBooking(orderRef, resolution) {
  const [[order]] = await db.execute(
    `SELECT ${ORDER_COLUMNS} FROM busbooking_orders WHERE order_ref = ? LIMIT 1`,
    [orderRef],
  );
  if (!order) return { ok: false, status: 404, message: "Booking order not found" };
  if (order.status !== "booking_review") {
    return { ok: false, status: 409, message: "Booking is not awaiting review" };
  }

  if (resolution.outcome === "confirmed") {
    await markConfirmed(order.id, {
      bookingId: resolution.bookingId,
      ticketNo: resolution.ticketNo || null,
      travelOperatorPNR: resolution.travelOperatorPNR || null,
    }, null);
  } else {
    await markFailedAndRefund(order, resolution.note || "Marked failed after review", null);
  }

  return { ok: true, order: await getOrder(order.id) };
}

/*
|--------------------------------------------------------------------------
| Cancellation
|--------------------------------------------------------------------------
*/

// Records a seat cancellation the provider has confirmed, together with the
// refund owed for it. Returns the refund row id, or null when nothing is owed.
async function applyCancellationSuccess(conn, {
  order,
  cancellationId,
  providerRefundAmount,
  providerCancelId = null,
  providerStatus = null,
  rawResponse = null,
}) {
  const [[totals]] = await conn.execute(
    `SELECT COALESCE(SUM(amount), 0) AS refunded
       FROM busbooking_refunds
      WHERE busbooking_order_id = ?`,
    [order.id],
  );
  const refundAmount = getRefundableAmount({
    requested: providerRefundAmount,
    paid: Number(order.total_amount) - Number(order.reward_coins_used),
    alreadyRefunded: totals.refunded,
  });

  await conn.execute(
    `UPDATE busbooking_cancellations
        SET status = 'succeeded',
            refund_status = ?,
            refund_amount = ?,
            provider_cancel_id = COALESCE(?, provider_cancel_id),
            provider_status = COALESCE(?, provider_status),
            raw_response = COALESCE(?, raw_response),
            provider_error_code = NULL,
            provider_error_message = NULL
      WHERE id = ?`,
    [
      refundAmount > 0 ? "pending" : "not_requested",
      refundAmount,
      providerCancelId === null ? null : String(providerCancelId),
      providerStatus || null,
      rawResponse ? JSON.stringify(rawResponse) : null,
      cancellationId,
    ],
  );

  const [[cancelled]] = await conn.execute(
    `SELECT COUNT(*) AS count
       FROM busbooking_cancellations
      WHERE busbooking_order_id = ? AND status = 'succeeded'`,
    [order.id],
  );
  if (Number(cancelled.count) >= Number(order.seat_count)) {
    await conn.execute(
      `UPDATE busbooking_orders SET status = 'cancelled' WHERE id = ?`,
      [order.id],
    );
  }

  if (refundAmount <= 0) return { refundId: null, refundAmount: 0 };

  const refundId = await enqueueRefund(conn, {
    orderId: order.id,
    userId: order.user_id,
    reason: "cancellation",
    refundKey: `busbooking_cancel_${cancellationId}`,
    amount: refundAmount,
    cancellationId,
  });
  return { refundId, refundAmount };
}

// Staff decision for a cancellation stuck in "processing".
async function resolveCancellation(orderRef, seatName, resolution) {
  const conn = await db.getConnection();
  let refundId = null;

  try {
    await conn.beginTransaction();
    const [[order]] = await conn.execute(
      `SELECT ${ORDER_COLUMNS}
         FROM busbooking_orders
        WHERE order_ref = ?
        LIMIT 1
        FOR UPDATE`,
      [orderRef],
    );
    const [[cancellation]] = order
      ? await conn.execute(
          `SELECT id, status
            FROM busbooking_cancellations
            WHERE busbooking_order_id = ? AND seat_name = ?
            ORDER BY id DESC
            LIMIT 1
            FOR UPDATE`,
          [order.id, seatName],
        )
      : [[]];

    if (!cancellation) {
      await conn.rollback();
      return { ok: false, status: 404, message: "Cancellation not found" };
    }
    if (cancellation.status !== "processing") {
      await conn.rollback();
      return { ok: false, status: 409, message: "Cancellation is not awaiting review" };
    }

    if (resolution.outcome === "succeeded") {
      ({ refundId } = await applyCancellationSuccess(conn, {
        order,
        cancellationId: cancellation.id,
        providerRefundAmount: resolution.refundAmount,
      }));
    } else {
      await conn.execute(
        `UPDATE busbooking_cancellations
            SET status = 'failed', provider_error_message = ?
          WHERE id = ?`,
        [
          String(resolution.note || "Marked failed after review").slice(0, 1000),
          cancellation.id,
        ],
      );
    }
    await conn.commit();
  } catch (error) {
    try {
      await conn.rollback();
    } catch {}
    throw error;
  } finally {
    conn.release();
  }

  if (refundId) await processRefund(refundId);
  return { ok: true };
}

// Applies authoritative cancellation/refund states returned by BookingDetails.
// One provider cancellation can contain several seats, so it creates at most
// one idempotent customer refund for the provider CancelId.
async function reconcileProviderCancellations(orderId, bookingDetails) {
  const providerEntries = Array.isArray(bookingDetails?.Cancellations)
    ? bookingDetails.Cancellations
    : [];
  if (!providerEntries.length) return { refundIds: [] };

  const conn = await db.getConnection();
  const refundIds = [];
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.execute(
      `SELECT id, user_id, seat_count, total_amount, reward_coins_used
         FROM busbooking_orders
        WHERE id = ?
        LIMIT 1
        FOR UPDATE`,
      [orderId],
    );
    if (!order) {
      await conn.rollback();
      return { refundIds };
    }

    for (const entry of providerEntries) {
      const cancelId = String(entry?.CancelId ?? "").trim();
      if (!cancelId) continue;

      const [localRows] = await conn.execute(
        `SELECT id
           FROM busbooking_cancellations
          WHERE busbooking_order_id = ? AND provider_cancel_id = ?
          ORDER BY id ASC
          FOR UPDATE`,
        [order.id, cancelId],
      );
      if (!localRows.length) continue;

      const decision = classifyCancellationEntry(entry);
      const providerStatus = String(entry?.Status || "").trim() || null;
      const providerRefundStatus = String(entry?.RefundStatus || "").trim() || null;
      const providerErrorCode = Number(entry?.ErrorCode || 0) || null;
      const providerErrorMessage = String(entry?.ErrorMessage || "").trim() || null;
      const rawResponse = JSON.stringify(entry);
      const ids = localRows.map((row) => row.id);
      const placeholders = ids.map(() => "?").join(",");

      await conn.execute(
        `UPDATE busbooking_cancellations
            SET status = ?, provider_status = ?, provider_refund_status = ?,
                provider_error_code = ?, provider_error_message = ?, raw_response = ?
          WHERE id IN (${placeholders})`,
        [
          decision.localStatus,
          providerStatus,
          providerRefundStatus,
          providerErrorCode,
          providerErrorMessage,
          rawResponse,
          ...ids,
        ],
      );

      if (decision.refundReady) {
        const [[totals]] = await conn.execute(
          `SELECT COALESCE(SUM(amount), 0) AS refunded
             FROM busbooking_refunds
            WHERE busbooking_order_id = ?`,
          [order.id],
        );
        const refundAmount = getRefundableAmount({
          requested: Number(entry?.RefundAmount),
          paid: Number(order.total_amount) - Number(order.reward_coins_used),
          alreadyRefunded: totals.refunded,
        });
        if (refundAmount > 0) {
          const cancellationId = ids[0];
          await conn.execute(
            `UPDATE busbooking_cancellations
                SET refund_status = 'pending', refund_amount = ?
              WHERE id = ?`,
            [refundAmount, cancellationId],
          );
          const refundId = await enqueueRefund(conn, {
            orderId: order.id,
            userId: order.user_id,
            reason: "cancellation",
            refundKey: `busbooking_provider_cancel_${order.id}_${cancelId}`,
            amount: refundAmount,
            cancellationId,
          });
          refundIds.push(refundId);
        }
      }
    }

    const [[cancelled]] = await conn.execute(
      `SELECT COUNT(DISTINCT seat_name) AS count
         FROM busbooking_cancellations
        WHERE busbooking_order_id = ? AND status = 'succeeded'`,
      [order.id],
    );
    if (Number(cancelled.count) >= Number(order.seat_count)) {
      await conn.execute(
        `UPDATE busbooking_orders SET status = 'cancelled' WHERE id = ?`,
        [order.id],
      );
    }

    await conn.commit();
  } catch (error) {
    try { await conn.rollback(); } catch {}
    throw error;
  } finally {
    conn.release();
  }

  for (const refundId of new Set(refundIds)) await processRefund(refundId);
  return { refundIds };
}

/*
|--------------------------------------------------------------------------
| Scheduled reconciliation
|--------------------------------------------------------------------------
*/

// Unpaid orders whose seat hold has lapsed can no longer be paid for.
async function expireStaleBlocks() {
  const [result] = await db.query(
    `UPDATE busbooking_orders
        SET status = 'expired'
      WHERE status = 'pending_payment'
        AND payment_status = 'pending'
        AND created_at < NOW() - INTERVAL ? MINUTE`,
    [getBlockTtlMinutes()],
  );
  return result.affectedRows;
}

// Paid orders the app never came back to book (closed, crashed, offline).
async function bookAbandonedPaidOrders(limit = 20) {
  const [rows] = await db.query(
    `SELECT id
       FROM busbooking_orders
      WHERE status = 'payment_success'
        AND payment_status = 'paid'
        AND updated_at < NOW() - INTERVAL 90 SECOND
      ORDER BY id ASC
      LIMIT ?`,
    [limit],
  );

  for (const row of rows) {
    try {
      await bookOrder(row.id);
    } catch (error) {
      console.error(`[BusBooking][Cron] Booking order ${row.id} failed`, error.message);
    }
  }
  return rows.length;
}

// A Book call that never reported back (process crash, lost DB write).
async function escalateStuckBookings() {
  const [rows] = await db.query(
    `SELECT ${ORDER_COLUMNS}
       FROM busbooking_orders
      WHERE status = 'booking_in_progress'
        AND booking_attempted_at < NOW() - INTERVAL 5 MINUTE`,
  );

  for (const order of rows) {
    await markForReview(order, "Book request never reported an outcome");
  }
  return rows.length;
}

module.exports = {
  bookOrder,
  waitForBookingResult,
  resolveReviewedBooking,
  applyCancellationSuccess,
  resolveCancellation,
  reconcileProviderCancellations,
  expireStaleBlocks,
  bookAbandonedPaidOrders,
  escalateStuckBookings,
};
