const db = require("../config/database");
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path, updatedAt) {
  if (!path) return null;
  const version = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : "";
  return `${CDN_BASE_URL}/${path}${version}`;
}

class CampaignModel {
  //   =======================Helper=================================
  async validateCampaign(campaignId) {
    const [rows] = await db.query(
      `
    SELECT campaign_id
    FROM campaigns
    WHERE campaign_id = ?
    LIMIT 1
    `,
      [campaignId],
    );

    if (!rows.length) {
      const error = new Error("Campaign not found");
      error.statusCode = 404;
      throw error;
    }

    return rows[0];
  }

  async validateCampaignItem(campaignId, variantId) {
    const [rows] = await db.query(
      `
    SELECT id
    FROM campaign_items
    WHERE campaign_id = ?
    AND variant_id = ?
    LIMIT 1
    `,
      [campaignId, variantId],
    );

    if (!rows.length) {
      const error = new Error("Product not found in campaign");
      error.statusCode = 404;
      throw error;
    }

    return rows[0];
  }

  //   =================================Campaign===================================
  async updateCampaignImage(campaignId, bannerImage) {
    await db.query(
      `
    UPDATE campaigns
    SET banner_image = ?
    WHERE campaign_id = ?
    `,
      [bannerImage, campaignId],
    );
  }

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

    return rows.map((item) => ({
      ...item,
      banner_image: getPublicUrl(item.banner_image),
    }));
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

    return {
      ...rows[0],
      banner_image: getPublicUrl(rows[0].banner_image),
    };
  }

  async updateCampaign(id, data, banner_image) {
    await this.validateCampaign(id);

    const fields = [];
    const values = [];

    if (data.title !== undefined) {
      fields.push("title = ?");
      values.push(data.title);
    }

    if (data.campaign_type !== undefined) {
      fields.push("campaign_type = ?");
      values.push(data.campaign_type);
    }

    if (banner_image) {
      fields.push("banner_image = ?");
      values.push(banner_image);
    }

    if (data.start_at !== undefined) {
      fields.push("start_at = ?");
      values.push(data.start_at);
    }

    if (data.end_at !== undefined) {
      fields.push("end_at = ?");
      values.push(data.end_at);
    }

    if (data.redirect_type !== undefined) {
      fields.push("redirect_type = ?");
      values.push(data.redirect_type);
    }

    if (data.redirect_id !== undefined) {
      fields.push("redirect_id = ?");
      values.push(data.redirect_id);
    }

    if (data.redirect_url !== undefined) {
      fields.push("redirect_url = ?");
      values.push(data.redirect_url);
    }

    if (data.display_order !== undefined) {
      fields.push("display_order = ?");
      values.push(data.display_order);
    }

    if (data.status !== undefined) {
      fields.push("status = ?");
      values.push(data.status);
    }

    if (!fields.length) {
      const error = new Error("Nothing to update");
      error.statusCode = 400;
      throw error;
    }

    values.push(id);

    await db.query(
      `
    UPDATE campaigns
    SET ${fields.join(", ")}
    WHERE campaign_id = ?
    `,
      values,
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
    await this.validateCampaign(campaignId);

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
    await this.validateCampaign(campaignId);

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
        AND pv.stock > 0

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
    await this.validateCampaign(campaignId);

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
          const error = new Error(`Variant ${variantId} not found`);
          error.statusCode = 404;
          throw error;
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
    await this.validateCampaign(campaignId);

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
      const error = new Error("Variant not found");
      error.statusCode = 404;
      throw error;
    }

    const salePrice = Number(variantRows[0].sale_price);

    const stock = Number(variantRows[0].stock);

    const fields = [];
    const values = [];

    if (offerPrice !== undefined && offerPrice !== null) {
      if (Number(offerPrice) > salePrice) {
        const error = new Error("Offer price cannot exceed sale price");
        error.statusCode = 400;
        throw error;
      }

      fields.push("offer_price = ?");
      values.push(Number(offerPrice));
    }

    if (maxQty !== undefined && maxQty !== null) {
      if (Number(maxQty) > stock) {
        const error = new Error(`Max quantity cannot exceed stock (${stock})`);
        error.statusCode = 400;
        throw error;
      }

      fields.push("max_qty = ?");
      values.push(Number(maxQty));
    }

    if (!fields.length) {
      const error = new Error("Nothing to update");
      error.statusCode = 400;
      throw error;
    }

    await this.validateCampaignItem(campaignId, variantId);

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
    await this.validateCampaign(campaignId);

    await this.validateCampaignItem(campaignId, variantId);

    await db.query(
      `
      DELETE FROM campaign_items
      WHERE campaign_id = ?
      AND variant_id = ?
      `,
      [campaignId, variantId],
    );
  }

  // ======================================================User===================================
  async getHomeCampaigns() {
    const [posters] = await db.query(
      `
    SELECT
      campaign_id,
      title,
      banner_image,
      updated_at,
      redirect_type,
      redirect_id,
      redirect_url
    FROM campaigns
    WHERE
      campaign_type = 'poster'
      AND status = 'active'
    ORDER BY display_order
    `,
    );

    const [dashboardPosters] = await db.query(
      `
      SELECT
        campaign_id,
        title,
        banner_image,
        updated_at,
        redirect_type,
        redirect_id,
        redirect_url
      FROM campaigns
      WHERE
        campaign_type = 'dashboard_poster'
        AND status = 'active'
      ORDER BY display_order
      `,
    );

    const [flashSales] = await db.query(
      `
    SELECT
      campaign_id,
      title,
      banner_image,
      updated_at,
      start_at,
      end_at
    FROM campaigns
    WHERE
      campaign_type = 'flash_sale'
      AND status = 'active'
      AND NOW() BETWEEN start_at AND end_at
    ORDER BY display_order
    `,
    );

    return {
      posters: posters.map((item) => ({
        ...item,
        banner_image: getPublicUrl(item.banner_image, item.updated_at),
      })),
      dashboard_posters: dashboardPosters.map((item) => ({
        ...item,
        banner_image: getPublicUrl(item.banner_image, item.updated_at),
      })),
      flash_sales: flashSales.map((item) => ({
        ...item,
        banner_image: getPublicUrl(item.banner_image, item.updated_at),
      })),
    };
  }

  async getUserCampaigns(filters = {}) {
    let sql = `
    SELECT
      campaign_id,
      title,
      campaign_type,
      banner_image,
      updated_at,
      start_at,
      end_at
    FROM campaigns
    WHERE
      status = 'active'
  `;

    const values = [];

    if (filters.campaign_type) {
      sql += `
      AND campaign_type = ?
    `;
      values.push(filters.campaign_type);
    }

    sql += `
    ORDER BY display_order
  `;

    const [rows] = await db.query(sql, values);

    return rows.map((item) => ({
      ...item,
      banner_image: getPublicUrl(item.banner_image, item.updated_at),
    }));
  }

  async getUserCampaignById(campaignId) {
    const [rows] = await db.query(
      `
    SELECT
      campaign_id,
      title,
      campaign_type,
      banner_image,
      updated_at,
      start_at,
      end_at,
      redirect_type,
      redirect_id,
      redirect_url
    FROM campaigns
    WHERE
      campaign_id = ?
      AND status = 'active'
    `,
      [campaignId],
    );

    if (!rows.length) {
      const error = new Error("Campaign not found");
      error.statusCode = 404;
      throw error;
    }

    return {
      ...rows[0],
      banner_image: getPublicUrl(rows[0].banner_image, rows[0].updated_at),
    };
  }

  async getCampaignProducts(campaignId) {
    await this.getCampaignById(campaignId);

    const [rows] = await db.query(
      `
    SELECT
      ci.id,

      ep.product_id,
      ep.product_name,
      ep.brand_name,
      ep.category_id,
      ep.subcategory_id,
      ep.is_discount_eligible,

      pv.variant_id,
      pv.mrp,
      pv.sale_price AS original_price,

      CASE
        WHEN ci.offer_price IS NOT NULL
          AND ci.offer_price > 0
        THEN ci.offer_price
        ELSE pv.sale_price
      END AS final_price,

      pi.image_url,
      pi.updated_at AS image_updated_at

    FROM campaign_items ci

    JOIN eproducts ep
      ON ep.product_id = ci.product_id

    JOIN product_variants pv
      ON pv.variant_id = ci.variant_id

    LEFT JOIN (
      SELECT
        product_id,
        MIN(image_id) AS image_id
      FROM product_images
      WHERE type = 'gallery'
      GROUP BY product_id
    ) pim
      ON pim.product_id = ep.product_id

    LEFT JOIN product_images pi
    ON pi.image_id = pim.image_id

    WHERE ci.campaign_id = ?
      AND ep.status = 'approved'
      AND ep.is_visible = 1
      AND pv.is_visible = 1
    `,
      [campaignId],
    );

    return rows;
  }
}

module.exports = new CampaignModel();
