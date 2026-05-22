const db = require("../config/database");

class ManagerModel {
  // ================================
  //  1. BASIC STATS (CARDS)
  // ================================
  async fetchStats() {
    const [[vendorCount]] = await db.execute(
      `SELECT COUNT(*) AS totalVendors FROM vendors`,
    );
    const [[pendingVendors]] = await db.execute(
      `SELECT COUNT(*) AS pendingApprovals FROM vendors WHERE status='pending'`,
    );

    const [[activeProducts]] = await db.execute(
      `SELECT COUNT(*) AS activeProducts FROM eproducts WHERE status='approved'`,
    );

    const [[revenue]] = await db.execute(`
      SELECT COALESCE(SUM(sale_price * stock), 0) AS totalRevenue 
      FROM eproducts 
      WHERE status='approved'
    `);

    return {
      totalVendors: vendorCount.totalVendors,
      pendingApprovals: pendingVendors.pendingApprovals,
      activeProducts: activeProducts.activeProducts,
      totalRevenue: revenue.totalRevenue,
    };
  }

  // ================================
  //  2. CHARTS DATA
  // ================================
  async fetchCharts() {
    // --- MONTHLY REVENUE ---
    const [monthlyRevenue] = await db.execute(`
      SELECT 
        DATE_FORMAT(created_at, '%b') AS month,
        COALESCE(SUM(sale_price * stock), 0) AS revenue
      FROM eproducts
      WHERE status='approved'
      GROUP BY MONTH(created_at)
      ORDER BY MONTH(created_at)
    `);

    // --- MONTHLY VENDORS ---
    const [monthlyVendors] = await db.execute(`
      SELECT 
        DATE_FORMAT(created_at, '%b') AS month,
        COUNT(*) AS total
      FROM vendors
      GROUP BY MONTH(created_at)
      ORDER BY MONTH(created_at)
    `);

    // --- MONTHLY PRODUCTS ---
    const [monthlyProducts] = await db.execute(`
      SELECT 
        DATE_FORMAT(created_at, '%b') AS month,
        COUNT(*) AS total
      FROM eproducts
      GROUP BY MONTH(created_at)
      ORDER BY MONTH(created_at)
    `);

    // --- WEEKLY VENDORS ---
    const [weeklyVendors] = await db.execute(`
      SELECT 
        DATE_FORMAT(created_at, '%a') AS day,
        COUNT(*) AS total
      FROM vendors
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY created_at
    `);

    // --- WEEKLY PRODUCTS ---
    const [weeklyProducts] = await db.execute(`
      SELECT 
        DATE_FORMAT(created_at, '%a') AS day,
        COUNT(*) AS total
      FROM eproducts
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY created_at
    `);

    return {
      monthlyRevenue,
      monthlyVendors,
      monthlyProducts,
      weeklyVendors,
      weeklyProducts,
    };
  }

  // Download vendor Report
  async getVendorReport({ status, fromDate, toDate }) {
    try {
      const conditions = ["v.status != 'pending'"];
      const params = [];

      if (status) {
        conditions.push("v.status = ?");
        params.push(status);
      }

      if (fromDate && toDate) {
        conditions.push("DATE(v.created_at) BETWEEN ? AND ?");
        params.push(fromDate, toDate);
      } else if (fromDate) {
        conditions.push("DATE(v.created_at) >= ?");
        params.push(fromDate);
      } else if (toDate) {
        conditions.push("DATE(v.created_at) <= ?");
        params.push(toDate);
      }

      const whereClause = `WHERE ${conditions.join(" AND ")}`;

      const query = `
      SELECT 
        v.vendor_id,
        v.company_name,
        v.full_name,
        v.gstin,
        v.pan_number,
        v.status,
        v.created_at,
        u.email,
        u.phone
      FROM vendors v
      JOIN eusers u ON v.user_id = u.user_id
      ${whereClause}
      ORDER BY v.created_at DESC
    `;

      const [rows] = await db.execute(query, params);

      return rows;
    } catch (err) {
      throw err;
    }
  }
}

module.exports = new ManagerModel();
