const db = require("../../config/database");
const { sendMailBestEffort } = require("../mailService");

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g,
  (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const money = (value) => `INR ${Number(value || 0).toFixed(2)}`;

function confirmationContent(name, intro, details) {
  const rows = details.filter(([, value]) => value !== null && value !== undefined && value !== "");
  return {
    text: `Hello ${name || "Customer"},\n\n${intro}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\nThank you for choosing Reward Planners.`,
    html: `<p>Hello ${escapeHtml(name || "Customer")},</p><p>${escapeHtml(intro)}</p><table cellpadding="8">${rows.map(([label, value]) => `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</table><p>Thank you for choosing Reward Planners.</p>`,
  };
}

// Called only after the successful state transition is committed. Email
// failures must never enter payment/booking rollback or refund handling.
async function sendTransactionSuccessEmail(module, id) {
  try {
    let row, subject, intro, details;
    if (module === "bbps") {
      [[row]] = await db.execute(`SELECT t.*, c.name AS customer_name, c.email AS customer_email
        FROM bbps_transactions t JOIN customer c ON c.user_id = t.user_id
        WHERE t.id = ? AND t.bbps_status = 'PAID' LIMIT 1`, [id]);
      if (!row) return { ok: false, skipped: true };
      subject = `Bill payment successful - ${row.id}`;
      intro = "Your bill payment has completed successfully.";
      details = [["Transaction", row.id], ["Reference", row.provider_client_ref_id],
        ["Operator ID", row.operator_id], ["Account ending", String(row.utility_acc_no || "").slice(-4)],
        ["Amount", money(row.amount)], ["Status", "Successful"]];
    } else if (module === "bus") {
      [[row]] = await db.execute(`SELECT o.*, c.name AS customer_name, c.email AS customer_email
        FROM busbooking_orders o JOIN customer c ON c.user_id = o.user_id
        WHERE o.id = ? AND o.status = 'confirmed' LIMIT 1`, [id]);
      if (!row) return { ok: false, skipped: true };
      subject = `Bus booking confirmed - ${row.order_ref}`;
      intro = "Your bus ticket booking is confirmed.";
      details = [["Order", row.order_ref], ["Ticket", row.ticket_no], ["PNR", row.travel_operator_pnr],
        ["Operator", row.operator_name], ["From", row.source_city], ["To", row.destination_city],
        ["Journey date", row.journey_date], ["Departure", row.departure_time],
        ["Boarding point", row.boarding_point_name], ["Seats", row.seat_count],
        ["Booking total", money(row.total_amount)], ["Reward coins used", row.reward_coins_used], ["Status", "Confirmed"]];
    } else {
      return { ok: false, skipped: true };
    }
    if (!row.customer_email?.trim()) return { ok: false, reason: "customer_email_missing" };
    return await sendMailBestEffort({ to: row.customer_email, subject,
      ...confirmationContent(row.customer_name, intro, details) }, `${module} transaction success`);
  } catch (error) {
    console.error(`[transaction email] ${module} ${id}:`, error.message);
    return { ok: false, error: error.message };
  }
}

module.exports = { sendTransactionSuccessEmail, confirmationContent, money };
