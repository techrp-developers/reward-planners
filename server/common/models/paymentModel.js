const db = require("../../config/database");

class PaymentModel {
  async createOrder({ orderId, razorpayOrderId, amount }) {
    return await db.query(
      `INSERT INTO order_payments 
       (order_id, razorpay_order_id, amount, status) 
       VALUES (?, ?, ?, ?)`,
      [orderId, razorpayOrderId, amount, "created"],
    );
  }

  async updateStatus(razorpayOrderId, status) {
    return await db.query(
      `UPDATE order_payments 
       SET status = ? 
       WHERE razorpay_order_id = ?`,
      [status, razorpayOrderId],
    );
  }
}

module.exports = new PaymentModel();
