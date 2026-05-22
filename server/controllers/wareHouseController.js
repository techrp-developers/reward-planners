const db = require("../config/database");

// generate random grn number
const generateGRN = () => {
  const date = new Date();

  const formattedDate = date.toISOString().slice(0, 10).replace(/-/g, "");

  const randomNum = Math.floor(10000 + Math.random() * 90000);

  return `GRN-${formattedDate}-${randomNum}`;
};

class wareHouseController {
  // new entry
  async stockIn(req, res) {
    try {
      const wareHouseManagerId = req.user.user_id;

      if (!wareHouseManagerId) {
        return res.status(400).json({
          success: false,
          message: "wareHouseManagerId is required",
        });
      }

      const {
        vendorId,
        productId,
        variantId,
        totalQuantity,
        passedQuantity,
        failedQuantity,
        stockInDate,
        expiryDate,
      } = req.body;

      if (!productId || totalQuantity <= 0) {
        return res.status(500).json({
          success: false,
          message: "Product and total quantity required",
        });
      }

      if (passedQuantity + failedQuantity !== totalQuantity) {
        return res.status(400).json({
          success: false,
          message: "Total quantity must equal passed + failed quantity",
        });
      }

      // Generate GRN (no DB lookup)
      const grnNumber = generateGRN();

      // Insert
      await db.query(
        `INSERT INTO stock_in_entries
            (grn,warehousemanager_id, product_id, vendor_id, variant_id, total_quantity, passed_quantity, failed_quantity, stock_in_date, expiry_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          grnNumber,
          wareHouseManagerId,
          productId,
          vendorId,
          variantId,
          totalQuantity,
          passedQuantity,
          failedQuantity,
          stockInDate,
          expiryDate || null,
        ]
      );

      res.json({
        success: true,
        message: "Stock-In entry created",
        grn: grnNumber,
      });
    } catch (err) {
      console.error("stock In Error:", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // fetch all warehouse List
  async allWareHouses(req, res) {
    try {
      const [rows] = await db.execute(` SELECT * from warehouses;`);

      return res.json({
        success: true,
        rows,
      });
    } catch (error) {
      console.error("Fetching warehouse error:", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // get all stock info
  async getDetails(req, res) {
    try {
      const status = req.query.status || "Pending";
      const search = req.query.search || "";

      let query = `
      SELECT 
        s.id,
        s.warehousemanager_id,
        s.vendor_id,
        s.variant_id,
        s.product_id,
        s.grn,
        s.total_quantity,
        s.passed_quantity,
        s.failed_quantity,
        s.stock_in_date,
        s.expiry_date,
        s.status,
        p.product_name AS productName,
        COALESCE(c.category_name, p.custom_category) AS categoryName,
        v.full_name AS vendorName,
        u.name AS WarehousemanagerName,
        pv.sku AS sku
      FROM stock_in_entries s
      JOIN eproducts p ON s.product_id = p.product_id
      LEFT JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN vendors v ON p.vendor_id = v.vendor_id
      JOIN eusers u ON s.warehousemanager_id = u.user_id
      WHERE s.status = ?
    `;

      const params = [status];

      if (search) {
        query += `
        AND (
          s.grn LIKE ?
          OR pv.sku LIKE ?
          OR p.product_name LIKE ?
          OR v.full_name LIKE ?
        )
      `;
        const like = `%${search}%`;
        params.push(like, like, like, like);
      }

      const [rows] = await db.query(query, params);

      res.json({ success: true, data: rows });
    } catch (err) {
      console.error("Fetching stock record Error:", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // get details by ID
  async getStockInByGrn(req, res) {
    try {
      const { grn } = req.params;

      if (!grn) {
        return res.status(400).json({
          success: false,
          message: "GRN is required",
        });
      }

      const [rows] = await db.query(
        `
      SELECT 
        s.grn,
        s.total_quantity,
        s.passed_quantity,
        s.failed_quantity,
        s.stock_in_date,
        s.expiry_date,
        p.product_name AS productName,
        pv.sku AS sku,
        v.full_name AS vendorName,
        COALESCE(c.category_name, p.custom_category) AS category
      FROM stock_in_entries s
      JOIN eproducts p ON s.product_id = p.product_id
      LEFT JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN vendors v ON p.vendor_id = v.vendor_id
      WHERE s.grn = ?
      `,
        [grn]
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Stock entry not found",
        });
      }

      res.json({ success: true, data: rows[0] });
    } catch (err) {
      console.error("Fetch stock-in by GRN error:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // send to Inventory
  async sendToInventory(req, res) {
    let connection;
    const { grn, warehouse_id, warehouseLocation } = req.body;

    if (!grn || !warehouse_id || !warehouseLocation) {
      return res.status(400).json({
        success: false,
        message: "GRN, warehouse, and location are required",
      });
    }

    try {
      //  Fetch the stock entry
      connection = await db.getConnection();
      await connection.beginTransaction();

      const [stockRows] = await connection.query(
        `SELECT * FROM stock_in_entries WHERE grn = ? AND status = 'Pending'`,
        [grn]
      );

      if (stockRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Stock not found or already sent",
        });
      }

      const stock = stockRows[0];

      // Check if the product+variant+warehouse already exists in inventory
      const [inventoryRows] = await connection.query(
        `SELECT * FROM inventory WHERE product_id = ? AND variant_id = ? AND warehouse_id = ?`,
        [stock.product_id, stock.variant_id, warehouse_id]
      );

      if (inventoryRows.length > 0) {
        //  Already exists → update quantity and location
        const existingInventory = inventoryRows[0];
        await connection.query(
          `UPDATE inventory
         SET quantity = quantity + ?, location = ?, expiry_date = ?
         WHERE inventory_id = ?`,
          [
            stock.passed_quantity,
            warehouseLocation,
            stock.expiry_date || existingInventory.expiry_date,
            existingInventory.inventory_id,
          ]
        );
      } else {
        //  Does not exist → insert new inventory record
        await connection.query(
          `INSERT INTO inventory
         (product_id, variant_id, warehouse_id, quantity, location, expiry_date, vendor_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            stock.product_id,
            stock.variant_id,
            warehouse_id,
            stock.passed_quantity,
            warehouseLocation,
            stock.expiry_date,
            stock.vendor_id,
          ]
        );
      }

      //  Mark the stock_in_entries as sent
      await connection.query(
        `UPDATE stock_in_entries
       SET status = 'Sent'
       WHERE grn = ?`,
        [grn]
      );

      // Commit transaction
      await connection.commit();
      return res.json({
        success: true,
        message: "Stock sent to inventory successfully",
      });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error("Send to inventory error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    } finally {
      if (connection) connection.release();
    }
  }

  // update a stock in record
  async updateStockIn(req, res) {
    try {
      const { grn } = req.params;
      if (!grn) {
        return res.status(400).json({
          success: false,
          message: "GRN is required",
        });
      }

      const {
        total_quantity,
        passed_quantity,
        failed_quantity,
        stock_in_date,
        expiry_date,
      } = req.body;

      if (passed_quantity + failed_quantity !== total_quantity) {
        return res.status(400).json({
          success: false,
          message: "Total quantity must equal passed + failed quantity",
        });
      }

      await db.query(
        `
      UPDATE stock_in_entries
      SET
        total_quantity = ?,
        passed_quantity = ?,
        failed_quantity = ?,
        stock_in_date = ?,
        expiry_date = ?
      WHERE grn = ?
      `,
        [
          total_quantity,
          passed_quantity,
          failed_quantity,
          stock_in_date,
          expiry_date || null,
          grn,
        ]
      );

      res.json({ success: true, message: "Stock-In updated successfully" });
    } catch (err) {
      console.error("Update stock-in error:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // fetch all the inventory record
  async getInventoryRecord(req, res) {
    try {
      const { search = "", lowStock = "false", expiry = "false" } = req.query;

      let whereClauses = [];
      let params = [];

      // Search filter
      if (search) {
        whereClauses.push(`
        (
          p.product_name LIKE ?
          OR v.full_name LIKE ?
          OR pv.sku LIKE ?
        )
      `);
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      // Low stock filter
      if (lowStock === "true") {
        whereClauses.push(`i.quantity < 10`);
      }

      // Expiry filter (next 30 days)
      if (expiry === "true") {
        whereClauses.push(`
        i.expiry_date IS NOT NULL
        AND i.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
      `);
      }

      const whereSQL =
        whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

      const sqlQuery = `
      SELECT 
        i.inventory_id,
        i.quantity,
        i.expiry_date,
        i.location,

        CASE
          WHEN i.quantity > 10 THEN 'Available'
          WHEN i.quantity > 0 THEN 'Reserved'
          ELSE 'Out of Stock'
        END AS status,

        p.product_name,
        pv.sku,
        v.full_name,
        w.name
      FROM inventory i
      JOIN eproducts p ON i.product_id = p.product_id
      JOIN vendors v ON i.vendor_id = v.vendor_id
      JOIN warehouses w ON i.warehouse_id = w.warehouse_id
      LEFT JOIN product_variants pv ON i.variant_id = pv.variant_id
      ${whereSQL}
      ORDER BY i.inventory_id DESC;
    `;

      const [rows] = await db.query(sqlQuery, params);

      return res.json({
        success: true,
        data: rows,
      });
    } catch (error) {
      console.error("Error fetching inventory records:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching inventory records",
      });
    }
  }

  // search listed product item by name in Inventory
  async searchInventory(req, res) {
    try {
      const { query } = req.query;

      if (!query) {
        return res.json({ success: true, data: [] });
      }

      const [rows] = await db.query(
        `
      SELECT
        i.inventory_id,
        i.quantity,
        i.location,
        i.expiry_date,
        i.product_id,
        p.product_name,
        i.vendor_id,
        v.full_name,
        i.warehouse_id,
        pv.sku,
        w.name AS warehouse_name
        FROM inventory i
        JOIN eproducts p ON p.product_id = i.product_id
        LEFT JOIN vendors v ON v.vendor_id = i.vendor_id
        LEFT JOIN warehouses w ON w.warehouse_id = i.warehouse_id
        LEFT JOIN product_variants pv ON pv.variant_id = i.variant_id
        WHERE p.product_name LIKE ? OR pv.sku LIKE ?
        ORDER BY p.product_name
        `,
        [`%${query}%`, `%${query}%`]
      );

      res.json({ success: true, data: rows });
    } catch (err) {
      console.error("Error searching products:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // create stock adjustment record
  async stockAdjustment(req, res) {
    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      const { inventory_id, quantity, adjustment_type, reason, date } =
        req.body;

      // Validate the input data
      if (!inventory_id || !quantity || !adjustment_type || !reason || !date) {
        return res
          .status(400)
          .json({ success: false, message: "All fields are required" });
      }

      if (quantity <= 0) {
        return res.status(400).json({
          success: false,
          message: "Quantity must be a positive number",
        });
      }

      // Get current stock and lock row for update
      const [inventoryRows] = await connection.query(
        "SELECT quantity FROM inventory WHERE inventory_id = ? FOR UPDATE",
        [inventory_id]
      );

      if (inventoryRows.length === 0) {
        await connection.rollback();
        return res
          .status(404)
          .json({ success: false, message: "Inventory not found" });
      }

      let currentQty = inventoryRows[0].quantity;
      let newQty = currentQty;

      // Adjust the quantity based on the adjustment type
      if (adjustment_type === "OUT") {
        newQty -= quantity;
        if (newQty < 0) {
          await connection.rollback();
          return res
            .status(400)
            .json({ success: false, message: "Insufficient stock" });
        }
      } else if (adjustment_type === "IN") {
        newQty += quantity;
      } else {
        // Invalid adjustment type
        await connection.rollback();
        return res
          .status(400)
          .json({ success: false, message: "Invalid adjustment type" });
      }

      // Update the inventory quantity
      await connection.query(
        "UPDATE inventory SET quantity = ? WHERE inventory_id = ?",
        [newQty, inventory_id]
      );

      // Insert the stock adjustment record
      await connection.query(
        "INSERT INTO stock_adjustments (inventory_id, quantity, adjustment_type, reason, adjusted_date) VALUES (?, ?, ?, ?, ?)",
        [inventory_id, quantity, adjustment_type, reason, date]
      );

      // Commit transaction
      await connection.commit();
      return res.json({
        success: true,
        message: "Stock adjusted successfully",
      });
    } catch (err) {
      if (connection) await connection.rollback();
      console.error("stock adjustment Error:", err);
      return res.status(500).json({ success: false, message: err.message });
    } finally {
      if (connection) connection.release();
    }
  }

  // Fetch Adjusted Record
  async getStockAdjustments(req, res) {
    let connection;
    try {
      connection = await db.getConnection();

      // Query to fetch stock adjustments from the database
      const query = `
        SELECT sa.adjustment_id, 
        sa.inventory_id, 
        sa.quantity, 
        sa.adjustment_type, 
        sa.reason, 
        sa.adjusted_date, 
        sa.created_at,
        p.product_name, 
        pv.sku, 
        v.full_name, 
        w.name,
        iv.location,
        iv.expiry_date
        FROM stock_adjustments sa
        JOIN inventory iv ON sa.inventory_id = iv.inventory_id
        JOIN eproducts p ON iv.product_id = p.product_id
        JOIN product_variants pv ON iv.variant_id = pv.variant_id
        JOIN vendors v ON iv.vendor_id = v.vendor_id
        JOIN warehouses w ON iv.warehouse_id = w.warehouse_id
        ORDER BY sa.created_at DESC;
    `;

      const [rows] = await connection.query(query);

      if (rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "No adjustments found" });
      }

      return res.json({
        success: true,
        data: rows,
      });
    } catch (err) {
      console.error("Error fetching stock adjustments:", err);
      return res.status(500).json({ success: false, message: err.message });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
}

module.exports = new wareHouseController();
