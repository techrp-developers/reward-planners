const db = require("../config/database");

class CampaignModel {
  //   =======================Helper=================================
  async campaignExists(campaignId) {
    const [rows] = await db.query(
      `
    SELECT campaign_id
    FROM campaigns
    WHERE campaign_id = ?
    LIMIT 1
    `,
      [campaignId],
    );

    return rows.length > 0;
  }

  //   =================================Campaign===================================

  async createCampaign(data) {
    const [result] = await db.query(
      `
      INSERT INTO campaigns (
        title,
        campaign_type,
        banner_image,
        start_at,
        end_at,
        redirect_type,
        redirect_id,
        redirect_url,
        display_order,
        status
      )
      VALUES (?,?,?,?,?,?,?,?,?,?)
      `,
      [
        data.title,
        data.campaign_type,
        data.banner_image,
        data.start_at || null,
        data.end_at || null,
        data.redirect_type || null,
        data.redirect_id || null,
        data.redirect_url || null,
        data.display_order || 0,
        data.status || "draft",
      ],
    );

    return result.insertId;
  }

  async getCampaigns(filters = {}) {
    let sql = `
      SELECT *
      FROM campaigns
      WHERE 1=1
    `;

    const values = [];

    if (filters.status) {
      sql += ` AND status = ?`;
      values.push(filters.status);
    }

    if (filters.campaign_type) {
      sql += ` AND campaign_type = ?`;
      values.push(filters.campaign_type);
    }

    sql += `
      ORDER BY display_order ASC,
      campaign_id DESC
    `;

    const [rows] = await db.query(sql, values);

    return rows;
  }

  async getCampaignById(campaignId) {
    const [rows] = await db.query(
      `
      SELECT *
      FROM campaigns
      WHERE campaign_id = ?
      `,
      [campaignId],
    );

    return rows[0];
  }

  async updateCampaign(id, data, banner_image) {
    await db.query(
      `
      UPDATE campaigns
      SET
        title = ?,
        campaign_type = ?,
        banner_image = COALESCE(?, banner_image),
        start_at = ?,
        end_at = ?,
        redirect_type = ?,
        redirect_id = ?,
        redirect_url = ?,
        display_order = ?,
        status = ?
      WHERE campaign_id = ?
      `,
      [
        data.title,
        data.campaign_type,
        banner_image,
        data.start_at || null,
        data.end_at || null,
        data.redirect_type || null,
        data.redirect_id || null,
        data.redirect_url || null,
        data.display_order || 0,
        data.status,
        id,
      ],
    );
  }

  async updateStatus(id, status) {
    await db.query(
      `
      UPDATE campaigns
      SET status = ?
      WHERE campaign_id = ?
      `,
      [status, id],
    );
  }

  async deleteCampaign(id) {
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      await conn.query(
        `
        DELETE FROM campaign_items
        WHERE campaign_id = ?
        `,
        [id],
      );

      await conn.query(
        `
        DELETE FROM campaigns
        WHERE campaign_id = ?
        `,
        [id],
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  //   ================================Campaign Items=============================
  async getCampaignItems(campaignId) {
    const exists = await this.campaignExists(campaignId);

    if (!exists) {
      throw new Error("Campaign not found");
    }

    const [rows] = await db.query(
      `
      SELECT
        ci.id,
        ci.product_id,
        ci.variant_id,
        ci.offer_price,
        ci.max_qty,
        ci.sold_qty,

        ep.product_name,

        pv.sku,
        pv.sale_price,
        pv.mrp,
        pv.stock

      FROM campaign_items ci

      JOIN eproducts ep
        ON ep.product_id = ci.product_id

      JOIN product_variants pv
        ON pv.variant_id = ci.variant_id

      WHERE ci.campaign_id = ?
      `,
      [campaignId],
    );

    return rows;
  }

  async getAvailableVariants(campaignId) {
    const exists = await this.campaignExists(campaignId);

    if (!exists) {
      throw new Error("Campaign not found");
    }

    const [rows] = await db.query(
      `
      SELECT
        ep.product_id,
        ep.product_name,
        pv.variant_id,
        pv.sku,
        pv.sale_price,
        pv.stock

      FROM eproducts ep

      JOIN product_variants pv
        ON pv.product_id = ep.product_id

      WHERE
        ep.status = 'approved'
        AND ep.is_visible = 1
        AND pv.is_visible = 1

        AND pv.variant_id NOT IN (
          SELECT variant_id
          FROM campaign_items
          WHERE campaign_id = ?
        )

      ORDER BY ep.product_name
      `,
      [campaignId],
    );

    return rows;
  }

  async addCampaignItems(campaignId, variantIds) {
    const exists = await this.campaignExists(campaignId);

    if (!exists) {
      throw new Error("Campaign not found");
    }

    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      for (const variantId of variantIds) {
        const [variantRows] = await conn.query(
          `
          SELECT
            variant_id,
            product_id
          FROM product_variants
          WHERE variant_id = ?
          `,
          [variantId],
        );

        if (!variantRows.length) {
          throw new Error(`Variant ${variantId} not found`);
        }

        const productId = variantRows[0].product_id;

        await conn.query(
          `
          INSERT IGNORE INTO campaign_items
          (
            campaign_id,
            product_id,
            variant_id
          )
          VALUES (?,?,?)
          `,
          [campaignId, productId, variantId],
        );
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async updateCampaignItem(campaignId, variantId, offerPrice, maxQty) {
    const exists = await this.campaignExists(campaignId);

    if (!exists) {
      throw new Error("Campaign not found");
    }

    const [variantRows] = await db.query(
      `
      SELECT
        sale_price,
        stock
      FROM product_variants
      WHERE variant_id = ?
      `,
      [variantId],
    );

    if (!variantRows.length) {
      throw new Error("Variant not found");
    }

    const salePrice = Number(variantRows[0].sale_price);

    const stock = Number(variantRows[0].stock);

    const fields = [];
    const values = [];

    if (offerPrice !== undefined && offerPrice !== null) {
      if (Number(offerPrice) > salePrice) {
        throw new Error("Offer price cannot exceed sale price");
      }

      fields.push("offer_price = ?");
      values.push(Number(offerPrice));
    }

    if (maxQty !== undefined && maxQty !== null) {
      if (Number(maxQty) > stock) {
        throw new Error(`Max quantity cannot exceed stock (${stock})`);
      }

      fields.push("max_qty = ?");
      values.push(Number(maxQty));
    }

    if (!fields.length) {
      throw new Error("Nothing to update");
    }

    values.push(campaignId);
    values.push(variantId);

    await db.query(
      `
      UPDATE campaign_items
      SET ${fields.join(", ")}
      WHERE campaign_id = ?
      AND variant_id = ?
      `,
      values,
    );
  }

  async removeCampaignItem(campaignId, variantId) {
    const exists = await this.campaignExists(campaignId);

    if (!exists) {
      throw new Error("Campaign not found");
    }

    await db.query(
      `
      DELETE FROM campaign_items
      WHERE campaign_id = ?
      AND variant_id = ?
      `,
      [campaignId, variantId],
    );
  }
}

module.exports = new CampaignModel();
