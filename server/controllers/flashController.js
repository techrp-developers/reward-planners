const db = require("../config/database");

class flashController {
  // create flash sale
  async createFlashSale(req, res) {
    try {
      const { title, start_at, end_at } = req.body;

      // Multer file
      const banner_image = req.file ? req.file.filename : null;

      if (!banner_image) {
        return res.status(400).json({
          success: false,
          message: "Banner image is required",
        });
      }

      if (new Date(start_at) >= new Date(end_at)) {
        return res.status(400).json({
          success: false,
          message: "End time must be after start time",
        });
      }

      const [result] = await db.query(
        `INSERT INTO flash_sales
       (title, banner_image, start_at, end_at, status)
       VALUES (?, ?, ?, ?, 'draft')`,
        [title, banner_image, start_at, end_at],
      );

      res.json({
        success: true,
        flash_id: result.insertId,
        message: "Flash sale created",
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // get Flash sale details
  async getFlashSales(req, res) {
    try {
      const [rows] = await db.query(`
      SELECT
        fs.flash_sale_id AS flash_id,
        fs.title,
        fs.banner_image,
        fs.start_at,
        fs.end_at,
        fs.status AS admin_status,
        CASE
          WHEN fs.status = 'draft' THEN 'Draft'
          WHEN fs.status = 'archived' THEN 'Archived'
          WHEN NOW() < fs.start_at THEN 'Upcoming'
          WHEN NOW() BETWEEN fs.start_at AND fs.end_at THEN 'Live'
          ELSE 'Expired'
        END AS display_status,
        COUNT(fsi.id) AS total_items
      FROM flash_sales fs
      LEFT JOIN flash_sale_items fsi
        ON fs.flash_sale_id = fsi.flash_sale_id
      GROUP BY 
        fs.flash_sale_id,
        fs.title,
        fs.banner_image,
        fs.start_at,
        fs.end_at,
        fs.status
      ORDER BY fs.start_at DESC
    `);

      return res.status(200).json({
        success: true,
        count: rows.length,
        data: rows,
      });
    } catch (err) {
      console.error("Error fetching flash sales:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch flash sales",
        error: err.message,
      });
    }
  }

  // get flash sale details by id
  async getFlashSaleById(req, res) {
    try {
      const { id } = req.params;

      const [rows] = await db.query(
        `
      SELECT
        flash_sale_id AS flash_id,
        title,
        banner_image,
        start_at,
        end_at,
        status
      FROM flash_sales
      WHERE flash_sale_id = ?
      `,
        [id],
      );

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Flash sale not found",
        });
      }

      return res.json({
        success: true,
        data: rows[0],
      });
    } catch (err) {
      console.error("Fetch flash sale error:", err);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // update Flash sale
  async updateFlashSale(req, res) {
    try {
      const { id } = req.params;
      const { title, start_at, end_at } = req.body;

      const banner_image = req.file ? req.file.filename : null;

      const [result] = await db.query(
        `
      UPDATE flash_sales
      SET 
        title = ?,
        start_at = ?,
        end_at = ?,
        banner_image = COALESCE(?, banner_image),
        updated_at = NOW()
      WHERE flash_sale_id = ?
      `,
        [title, start_at, end_at, banner_image, id],
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Flash sale not found",
        });
      }

      return res.json({
        success: true,
        flash_id: id,
        message: "Flash sale updated",
      });
    } catch (err) {
      console.error("Update flash sale error:", err);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // activate flash sale
  async activate(req, res) {
    try {
      const id = req.params.id;

      await db.query(
        `UPDATE flash_sales SET status = 'active' WHERE flash_sale_id = ?`,
        [id],
      );

      res.json({ success: true, message: "Flash sale activated" });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  //   fetch active flash sale products
  async getActiveProducts(req, res) {
    try {
      const [rows] = await db.query(`
      SELECT
        fs.flash_sale_id,
        ep.product_id,
        pv.variant_id,
        ep.product_name,
        pv.variant_attributes,
        pv.mrp,
        pv.sale_price AS original_price,
        CASE 
         WHEN fsi.offer_price IS NOT NULL AND fsi.offer_price > 0
            THEN fsi.offer_price
            ELSE pv.sale_price
          END AS final_price, 
        fs.start_at,
        fs.end_at
      FROM flash_sales fs
      JOIN flash_sale_items fsi
        ON fs.flash_sale_id = fsi.flash_sale_id
      JOIN eproducts ep
        ON ep.product_id = fsi.product_id
      LEFT JOIN product_variants pv
        ON (
            (fsi.variant_id IS NULL AND pv.product_id = ep.product_id)
            OR
            (fsi.variant_id = pv.variant_id)
        )
      WHERE
        fs.status = 'active'
        AND NOW() BETWEEN fs.start_at AND fs.end_at
        AND (fsi.max_qty IS NULL OR fsi.sold_qty < fsi.max_qty)
        AND ep.status = 'approved'
        AND ep.is_visible = 1
        AND pv.is_visible = 1
    `);

      res.json({ success: true, data: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // =============================Product to Flash sale==============================

  // get variants already added to flash sale
  async getFlashSaleVariants(req, res) {
    try {
      const { flashId } = req.params;

      const [rows] = await db.query(
        `
      SELECT
        pv.variant_id,
        ep.product_name,
        pv.sku,
        pv.sale_price,
        fsi.offer_price AS flash_price,
        fsi.max_qty,
        fsi.sold_qty,
        (fsi.max_qty - fsi.sold_qty) AS remaining_qty
      FROM flash_sale_items fsi
      JOIN product_variants pv
        ON pv.variant_id = fsi.variant_id
      JOIN eproducts ep
        ON ep.product_id = pv.product_id
      WHERE fsi.flash_sale_id = ?
      `,
        [flashId],
      );

      return res.json({
        success: true,
        data: rows,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // available products to sale
  async getAvailableVariants(req, res) {
    try {
      const { flashId } = req.params;

      const [rows] = await db.query(
        `
      SELECT
        ep.product_id,
        ep.product_name,
        pv.variant_id,
        pv.sku,
        pv.sale_price
      FROM eproducts ep
      JOIN product_variants pv
        ON pv.product_id = ep.product_id
      WHERE
        ep.status = 'approved'
        AND ep.is_visible = 1
        AND pv.is_visible = 1
        AND pv.variant_id NOT IN (
          SELECT variant_id
          FROM flash_sale_items
          WHERE flash_sale_id = ?
        )
      ORDER BY ep.product_name
      `,
        [flashId],
      );

      return res.json({ success: true, data: rows });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // add variants to flash sale
  async addVariantsToFlashSale(req, res) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const { flashId } = req.params;
      const { variant_ids } = req.body;

      if (!variant_ids || !variant_ids.length) {
        return res.status(400).json({
          success: false,
          message: "No variants selected",
        });
      }

      for (const variantId of variant_ids) {
        await conn.query(
          `
        INSERT IGNORE INTO flash_sale_items
        (flash_sale_id, variant_id, offer_price)
        VALUES (?, ?, 0)
        `,
          [flashId, variantId],
        );
      }

      await conn.commit();

      return res.json({
        success: true,
        message: "Variants added successfully",
      });
    } catch (err) {
      await conn.rollback();
      console.error(err);
      return res.status(500).json({ success: false, message: err.message });
    } finally {
      conn.release();
    }
  }

  // update flash price
  async updateFlashPrice(req, res) {
    try {
      const { flashId, variantId } = req.params;
      const { offer_price, max_qty } = req.body;

      // Fetch sale price & stock
      const [rows] = await db.query(
        `SELECT sale_price, stock FROM product_variants WHERE variant_id = ?`,
        [variantId],
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Variant not found",
        });
      }

      const salePrice = Number(rows[0].sale_price);
      const stockCount = Number(rows[0].stock);

      let fields = [];
      let values = [];

      /* ==========================
       PRICE VALIDATION
    ========================== */
      if (offer_price !== undefined && offer_price !== null) {
        if (Number(offer_price) > salePrice) {
          return res.status(400).json({
            success: false,
            message: "Flash price must be lower than or equal to sale price",
          });
        }

        fields.push("offer_price = ?");
        values.push(Number(offer_price));
      }

      /* ==========================
       MAX QTY VALIDATION
    ========================== */
      if (max_qty !== undefined && max_qty !== null) {
        const qty = Number(max_qty);

        if (qty <= 0) {
          return res.status(400).json({
            success: false,
            message: "Max quantity must be greater than 0",
          });
        }

        if (qty > stockCount) {
          return res.status(400).json({
            success: false,
            message: `Max quantity cannot exceed stock (${stockCount})`,
          });
        }

        fields.push("max_qty = ?");
        values.push(qty);
      }

      if (fields.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Nothing to update",
        });
      }

      values.push(flashId, variantId);

      await db.query(
        `
      UPDATE flash_sale_items
      SET ${fields.join(", ")}
      WHERE flash_sale_id = ?
        AND variant_id = ?
      `,
        values,
      );

      return res.json({
        success: true,
        message: "Flash sale updated successfully",
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // remove product from flash sale
  async removeVariantFromFlashSale(req, res) {
    try {
      const { flashId, variantId } = req.params;

      await db.query(
        `
      DELETE FROM flash_sale_items
      WHERE flash_sale_id = ? AND variant_id = ?
      `,
        [flashId, variantId],
      );

      return res.json({
        success: true,
        message: "Variant removed from flash sale",
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = new flashController();
