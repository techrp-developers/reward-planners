const db = require("../config/database");
const xpressService = require("../services/ExpressBees/xpressbees_service");

class LogisticsController {
  // Resolve NDR
  async resolveNdr(req, res) {
    try {
      const { shipmentId } = req.params;
      const { action, new_address_id, notes } = req.body;

      const allowedActions = ["retry", "address_update", "cancel", "rto"];

      if (!allowedActions.includes(action)) {
        return res.status(400).json({
          success: false,
          message: "Invalid action",
        });
      }

      if (action === "address_update" && !new_address_id) {
        return res.status(400).json({
          success: false,
          message: "Address is required for address_update",
        });
      }
      // {
      //   "action": "retry",
      //   "new_address_id": 12,
      //   "notes": "Customer confirmed availability"
      // }

      await xpressService.resolveNDR({
        shipmentId,
        action,
        new_address_id,
        notes,
      });

      return res.json({
        success: true,
        message: "NDR resolved successfully",
      });
    } catch (err) {
      console.error(err);

      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // ==========================
  // SUMMARY
  // ==========================
  async getSummary(req, res) {
    try {
      const [rows] = await db.query(`
        SELECT 
          COUNT(*) AS total,
          SUM(CASE WHEN shipping_status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
          SUM(CASE WHEN shipping_status = 'in_transit' THEN 1 ELSE 0 END) AS in_transit,
          SUM(CASE WHEN shipping_status = 'ndr' THEN 1 ELSE 0 END) AS ndr,
          SUM(CASE WHEN shipping_status = 'rto' THEN 1 ELSE 0 END) AS rto,
          SUM(CASE WHEN sla_status = 'breached' THEN 1 ELSE 0 END) AS sla_breached
        FROM order_shipments
        WHERE DATE(created_at) = CURDATE()
      `);

      return res.json({
        success: true,
        data: rows[0],
      });
    } catch (err) {
      console.error("Summary error:", err);
      return res.status(500).json({ success: false });
    }
  }

  // ==========================
  // STATUS BREAKDOWN
  // ==========================
  async getStatusBreakdown(req, res) {
    try {
      const [rows] = await db.query(`
        SELECT shipping_status, COUNT(*) as count
        FROM order_shipments
        GROUP BY shipping_status
      `);

      return res.json({
        success: true,
        data: rows,
      });
    } catch (err) {
      console.error("Status breakdown error:", err);
      return res.status(500).json({ success: false });
    }
  }

  // ==========================
  // NDR LIST
  // ==========================
  async getNDRList(req, res) {
    try {
      const [rows] = await db.query(`
        SELECT 
          os.id,
          os.awb_number,
          os.ndr_reason,
          os.ndr_count,
          os.updated_at,
          eo.order_id,
          eo.user_id
        FROM order_shipments os
        JOIN eorders eo ON os.order_id = eo.order_id
        WHERE os.is_ndr_active = 1
        ORDER BY os.updated_at DESC
      `);

      return res.json({
        success: true,
        data: rows,
      });
    } catch (err) {
      console.error("NDR list error:", err);
      return res.status(500).json({ success: false });
    }
  }

  // ==========================
  // SLA METRICS
  // ==========================
  async getSLAMetrics(req, res) {
    try {
      const [rows] = await db.query(`
        SELECT 
          COUNT(*) AS total,
          SUM(CASE WHEN sla_status = 'met' THEN 1 ELSE 0 END) AS met,
          SUM(CASE WHEN sla_status = 'breached' THEN 1 ELSE 0 END) AS breached,
          AVG(delivery_delay_hours) AS avg_delay
        FROM order_shipments
        WHERE shipping_status = 'delivered'
      `);

      return res.json({
        success: true,
        data: rows[0],
      });
    } catch (err) {
      console.error("SLA error:", err);
      return res.status(500).json({ success: false });
    }
  }

  // ==========================
  // COURIER PERFORMANCE
  // ==========================
  async getCourierPerformance(req, res) {
    try {
      const [rows] = await db.query(`
        SELECT 
          courier_name,
          COUNT(*) AS total,
          SUM(CASE WHEN shipping_status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
          SUM(CASE WHEN shipping_status = 'ndr' THEN 1 ELSE 0 END) AS ndr,
          SUM(CASE WHEN shipping_status = 'rto' THEN 1 ELSE 0 END) AS rto,
          SUM(CASE WHEN sla_status = 'breached' THEN 1 ELSE 0 END) AS sla_breached
        FROM order_shipments
        WHERE courier_name IS NOT NULL
        GROUP BY courier_name
      `);

      return res.json({
        success: true,
        data: rows,
      });
    } catch (err) {
      console.error("Courier performance error:", err);
      return res.status(500).json({ success: false });
    }
  }

  // ==========================
  // RECENT EVENTS
  // ==========================
  async getRecentEvents(req, res) {
    try {
      const [rows] = await db.query(`
        SELECT *
        FROM shipment_events
        ORDER BY created_at DESC
        LIMIT 20
      `);

      return res.json({
        success: true,
        data: rows,
      });
    } catch (err) {
      console.error("Events error:", err);
      return res.status(500).json({ success: false });
    }
  }
}

module.exports = new LogisticsController();
