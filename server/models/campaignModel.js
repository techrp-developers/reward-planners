const db = require("../config/database");
const { contentTargetIds, campaignNavigation } = require("../utils/contentNavigation");
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path, updatedAt) {
  if (!path) return null;
  const version = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : "";
  return `${CDN_BASE_URL}/${path}${version}`;
}

const LIVE_WINDOW_SQL = "(start_at IS NULL OR start_at <= NOW()) AND (end_at IS NULL OR end_at >= NOW())";

const POSTER_TYPES = ["poster", "dashboard_poster"];
const POSTER_PRODUCT_COLUMNS = {
  product: "ep.product_id",
  category: "ep.category_id",
  subcategory: "ep.subcategory_id",
};
const POSTER_SERVICE_COLUMNS = {
  service: "s.id",
  service_category: "s.category_id",
};
const BULK_TARGET_COLUMNS = {
  product: POSTER_PRODUCT_COLUMNS,
  service: POSTER_SERVICE_COLUMNS,
};
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

const pageOf = ({ page, limit } = {}) => {
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(limit) || DEFAULT_PAGE_SIZE));
  return { size, offset: (Math.max(1, Number(page) || 1) - 1) * size };
};

const publicPoster = (item) => ({
  ...item,
  redirect_ids: contentTargetIds({ target_ids: item.redirect_ids }),
  banner_image: getPublicUrl(item.banner_image, item.updated_at),
  navigation: campaignNavigation(item),
});

const notFound = (message = "Campaign not found") => {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
};

class CampaignModel {
  //   =======================Helper=================================
  async validateCampaign(campaignId) {
    const [rows] = await db.query(
      `
    SELECT campaign_id, campaign_type, module
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

  async validateCampaignItem(campaignId, variantId, table = "campaign_items") {
    const [rows] = await db.query(
      `
    SELECT id
    FROM ${table}
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

  async getRedirectTargets(type, search = "", selectedId = null) {
    const term = `%${String(search).trim()}%`;
    const queries = {
      product: ["SELECT product_id AS id, product_name AS label FROM eproducts WHERE is_deleted = 0 AND product_name LIKE ? ORDER BY product_name LIMIT 40", [term]],
      category: ["SELECT category_id AS id, category_name AS label FROM categories WHERE category_name LIKE ? ORDER BY category_name LIMIT 40", [term]],
      subcategory: ["SELECT sc.subcategory_id AS id, CONCAT(COALESCE(c.category_name, 'Category'), ' / ', sc.subcategory_name) AS label FROM sub_categories sc LEFT JOIN categories c ON c.category_id = sc.category_id WHERE sc.subcategory_name LIKE ? OR c.category_name LIKE ? ORDER BY c.category_name, sc.subcategory_name LIMIT 40", [term, term]],
      service: ["SELECT id, name AS label FROM services WHERE status = 1 AND name LIKE ? ORDER BY name LIMIT 40", [term]],
      service_category: ["SELECT id, name AS label FROM service_categories WHERE status = 1 AND name LIKE ? ORDER BY name LIMIT 40", [term]],
      service_bundle: ["SELECT id, name AS label FROM service_bundles WHERE status = 1 AND name LIKE ? ORDER BY name LIMIT 40", [term]],
    };
    if (!queries[type]) {
      const error = new Error("Redirect target type must be product, category, subcategory, service, service_category, or service_bundle");
      error.statusCode = 400;
      throw error;
    }
    const [sql, params] = queries[type];
    const [rows] = await db.query(sql, params);
    const result = rows.map((row) => ({ id: Number(row.id), label: row.label }));

    const numericSelectedId = Number(selectedId);
    if (Number.isInteger(numericSelectedId) && numericSelectedId > 0 && !result.some((row) => row.id === numericSelectedId)) {
      const selectedQueries = {
        product: ["SELECT product_id AS id, product_name AS label FROM eproducts WHERE product_id = ? AND is_deleted = 0", [numericSelectedId]],
        category: ["SELECT category_id AS id, category_name AS label FROM categories WHERE category_id = ?", [numericSelectedId]],
        subcategory: ["SELECT sc.subcategory_id AS id, CONCAT(COALESCE(c.category_name, 'Category'), ' / ', sc.subcategory_name) AS label FROM sub_categories sc LEFT JOIN categories c ON c.category_id = sc.category_id WHERE sc.subcategory_id = ?", [numericSelectedId]],
        service: ["SELECT id, name AS label FROM services WHERE id = ? AND status = 1", [numericSelectedId]],
        service_category: ["SELECT id, name AS label FROM service_categories WHERE id = ? AND status = 1", [numericSelectedId]],
        service_bundle: ["SELECT id, name AS label FROM service_bundles WHERE id = ? AND status = 1", [numericSelectedId]],
      };
      const [selectedSql, selectedParams] = selectedQueries[type];
      const [selectedRows] = await db.query(selectedSql, selectedParams);
      if (selectedRows[0]) result.unshift({ id: Number(selectedRows[0].id), label: selectedRows[0].label });
    }
    return result;
  }

  async redirectTargetExists(type, id) {
    const rows = await this.getRedirectTargets(type, "", id);
    return rows.some((row) => row.id === Number(id));
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
    if (data.campaign_type === "featured" && data.status === "active") {
      const error = new Error("Create the featured campaign as a draft, add products, then activate it");
      error.statusCode = 400;
      throw error;
    }
    const [result] = await db.query(
      `
      INSERT INTO campaigns (
        title,
        campaign_type,
        module,
        banner_image,
        start_at,
        end_at,
        redirect_type,
        redirect_id,
        redirect_ids,
        redirect_url,
        display_order,
        status,
        background_type,
        background_color,
        gradient_end_color,
        text_color,
        cta_text
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `,
      [
        data.title,
        data.campaign_type,
        data.module || "product",
        data.banner_image,
        data.start_at || null,
        data.end_at || null,
        data.redirect_type || null,
        Number.isInteger(Number(data.redirect_id)) && Number(data.redirect_id) > 0
          ? Number(data.redirect_id)
          : null,
        data.redirect_ids || null,
        data.redirect_url || null,
        data.display_order || 0,
        data.status || "draft",
        data.background_type || "gradient",
        data.background_color || "#4B0082",
        data.gradient_end_color || "#6A00FF",
        data.text_color || "#FFFFFF",
        data.cta_text || "Explore More",
      ],
    );

    return result.insertId;
  }

  async getCampaigns(filters = {}) {
    let sql = `
      SELECT campaigns.*,
        (SELECT COUNT(*) FROM campaign_featured_products cfp
         WHERE cfp.campaign_id = campaigns.campaign_id) AS featured_product_count
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

    if (filters.module) {
      sql += ` AND module = ?`;
      values.push(filters.module);
    }

    sql += `
      ORDER BY display_order ASC,
      campaign_id DESC
    `;

    const [rows] = await db.query(sql, values);

    return rows.map((item) => ({
      ...item,
      redirect_ids: contentTargetIds({ target_ids: item.redirect_ids }),
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

    if (!rows.length) return null;

    return {
      ...rows[0],
      redirect_ids: contentTargetIds({ target_ids: rows[0].redirect_ids }),
      banner_image_path: rows[0].banner_image,
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

    if (data.module !== undefined) {
      fields.push("module = ?");
      values.push(data.module);
    }

    if (banner_image) {
      fields.push("banner_image = ?");
      values.push(banner_image);
    }

    if (data.start_at !== undefined) {
      fields.push("start_at = ?");
      values.push(data.start_at || null);
    }

    if (data.end_at !== undefined) {
      fields.push("end_at = ?");
      values.push(data.end_at || null);
    }

    if (data.redirect_type !== undefined) {
      fields.push("redirect_type = ?");
      values.push(data.redirect_type);
    }

    if (data.redirect_id !== undefined) {
      fields.push("redirect_id = ?");
      values.push(
        Number.isInteger(Number(data.redirect_id)) && Number(data.redirect_id) > 0
          ? Number(data.redirect_id)
          : null,
      );
    }

    if (data.redirect_ids !== undefined) {
      fields.push("redirect_ids = ?");
      values.push(data.redirect_ids);
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
      if (data.status === "active") {
        await this.assertFeaturedCampaignCanActivate(id, {
          ...data,
          banner_image: banner_image || data.banner_image,
        });
      }
      fields.push("status = ?");
      values.push(data.status);
    }

    for (const field of [
      "background_type",
      "background_color",
      "gradient_end_color",
      "text_color",
      "cta_text",
    ]) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(data[field]);
      }
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
    if (status === "active") {
      await this.assertFeaturedCampaignCanActivate(id);
    }
    await db.query(
      `
      UPDATE campaigns
      SET status = ?
      WHERE campaign_id = ?
      `,
      [status, id],
    );
  }

  async assertFeaturedCampaignCanActivate(campaignId, pending = {}) {
    const [[campaign]] = await db.query(
      `SELECT campaign_type, module, title, background_type, background_color,
         gradient_end_color, text_color, banner_image, start_at, end_at
       FROM campaigns WHERE campaign_id = ? LIMIT 1`,
      [campaignId],
    );
    if ((pending.campaign_type || campaign?.campaign_type) !== "featured") return;
    const configuration = {
      module: pending.module ?? campaign?.module,
      title: pending.title ?? campaign?.title,
      background_type: pending.background_type ?? campaign?.background_type ?? "gradient",
      background_color: pending.background_color ?? campaign?.background_color ?? "#4B0082",
      gradient_end_color: pending.gradient_end_color ?? campaign?.gradient_end_color ?? "#6A00FF",
      text_color: pending.text_color ?? campaign?.text_color ?? "#FFFFFF",
      banner_image: pending.banner_image ?? campaign?.banner_image,
      start_at: pending.start_at ?? campaign?.start_at,
      end_at: pending.end_at ?? campaign?.end_at,
    };
    if (configuration.module !== "product" || !String(configuration.title || "").trim()) {
      const error = new Error("Featured campaigns require a product module and a title");
      error.statusCode = 400;
      throw error;
    }
    if (!["solid", "gradient", "image"].includes(configuration.background_type)) {
      const error = new Error("Featured campaign background type is invalid");
      error.statusCode = 400;
      throw error;
    }
    if (
      !/^#[0-9A-Fa-f]{6}$/.test(String(configuration.background_color)) ||
      !/^#[0-9A-Fa-f]{6}$/.test(String(configuration.gradient_end_color)) ||
      !/^#[0-9A-Fa-f]{6}$/.test(String(configuration.text_color)) ||
      (configuration.background_type === "image" && !configuration.banner_image)
    ) {
      const error = new Error("Featured campaign background configuration is invalid");
      error.statusCode = 400;
      throw error;
    }
    if (
      configuration.start_at &&
      configuration.end_at &&
      new Date(configuration.start_at) >= new Date(configuration.end_at)
    ) {
      const error = new Error("End date must be after start date");
      error.statusCode = 400;
      throw error;
    }

    const [[{ total }]] = await db.query(
      `SELECT COUNT(DISTINCT fp.product_id) AS total
       FROM campaign_featured_products fp
       JOIN eproducts p ON p.product_id = fp.product_id
       WHERE fp.campaign_id = ?
         AND p.status = 'approved'
         AND p.is_visible = 1
         AND p.is_deleted = 0
         AND EXISTS (
           SELECT 1 FROM product_variants v
           WHERE v.product_id = p.product_id
             AND v.is_visible = 1
             AND v.sale_price > 0
             AND v.stock > 0
         )`,
      [campaignId],
    );
    if (!Number(total)) {
      const error = new Error("Add at least one available product before activating this featured campaign");
      error.statusCode = 400;
      throw error;
    }
  }

  async deleteCampaign(id) {
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      await conn.query(
        `DELETE FROM campaign_featured_products WHERE campaign_id = ?`,
        [id],
      );

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
    const campaign = await this.validateCampaign(campaignId);

    if (campaign.module === "service") {
      // Same field names as product items, so the manager editor renders both.
      const [serviceRows] = await db.query(
        `
        SELECT
          csi.id,
          csi.service_id AS product_id,
          csi.variant_id,
          csi.offer_price,
          NULL AS max_qty,
          0 AS sold_qty,
          s.name AS product_name,
          sv.variant_name AS sku,
          sv.price AS sale_price,
          sv.original_price AS mrp,
          NULL AS stock
        FROM campaign_service_items csi
        JOIN services s ON s.id = csi.service_id
        JOIN service_variants sv ON sv.id = csi.variant_id
        WHERE csi.campaign_id = ?
        `,
        [campaignId],
      );

      return serviceRows;
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

  /** Sale-eligible variants not yet in the campaign, optionally limited by a catalogue column. */
  async getAvailableVariants(campaignId, { column = null, ids = [] } = {}) {
    const campaign = await this.validateCampaign(campaignId);
    const scope = column ? `AND ${column} IN (?)` : "";
    const params = column ? [campaignId, ids] : [campaignId];

    if (campaign.module === "service") {
      const [serviceRows] = await db.query(
        `
        SELECT
          s.id AS product_id,
          s.name AS product_name,
          sv.id AS variant_id,
          sv.variant_name AS sku,
          sv.price AS sale_price,
          NULL AS stock,
          sc.name AS category_name
        FROM services s
        JOIN service_categories sc ON sc.id = s.category_id
        JOIN service_variants sv ON sv.service_id = s.id
        WHERE s.status = 1 AND sc.status = 1 AND sv.status = 1
          AND sv.id NOT IN (
            SELECT variant_id FROM campaign_service_items WHERE campaign_id = ?
          )
          ${scope}
        ORDER BY s.name, sv.id
        `,
        params,
      );

      return serviceRows;
    }

    const [rows] = await db.query(
      `
      SELECT
        ep.product_id,
        ep.product_name,
        pv.variant_id,
        pv.sku,
        pv.sale_price,
        pv.stock,
        c.category_name

      FROM eproducts ep

      JOIN product_variants pv
        ON pv.product_id = ep.product_id

      LEFT JOIN categories c
        ON c.category_id = ep.category_id

      WHERE
        ep.is_deleted = 0
        AND ep.status = 'approved'
        AND ep.is_visible = 1
        AND pv.is_visible = 1
        AND pv.stock > 0

        AND pv.variant_id NOT IN (
          SELECT variant_id
          FROM campaign_items
          WHERE campaign_id = ?
        )
        ${scope}

      ORDER BY ep.product_name
      `,
      params,
    );

    return rows;
  }

  /**
   * Expands products or a category/subcategory into explicit priced items, so a
   * flash sale keeps per-variant prices and limits. Existing items stay as they are.
   */
  async bulkAddCampaignItems(campaignId, { target_type, target_ids, discount_percent, max_qty }) {
    const campaign = await this.validateCampaign(campaignId);
    const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

    if (campaign.campaign_type !== "flash_sale") throw badRequest("Only flash sales support bulk items");

    const service = campaign.module === "service";
    const column = BULK_TARGET_COLUMNS[service ? "service" : "product"][target_type];
    if (!column) throw badRequest("Invalid target type for this flash sale");

    const ids = [...new Set((Array.isArray(target_ids) ? target_ids : []).map(Number))];
    if (!ids.length || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw badRequest("target_ids must be a non-empty list of ids");
    }

    const discount = Number(discount_percent);
    if (!Number.isFinite(discount) || discount <= 0 || discount >= 100) {
      throw badRequest("Discount must be greater than 0 and less than 100 percent");
    }

    const hasLimit = max_qty !== undefined && max_qty !== null && max_qty !== "";
    if (hasLimit && (!Number.isInteger(Number(max_qty)) || Number(max_qty) < 1)) {
      throw badRequest("Max quantity must be a whole number of at least 1");
    }

    const variants = await this.getAvailableVariants(campaignId, { column, ids });
    if (!variants.length) return { added: 0 };

    const offerPrice = (variant) =>
      Math.max(0.01, Math.round(Number(variant.sale_price) * (100 - discount)) / 100);

    if (service) {
      await db.query(
        `INSERT IGNORE INTO campaign_service_items (campaign_id, service_id, variant_id, offer_price) VALUES ?`,
        [variants.map((variant) => [campaignId, variant.product_id, variant.variant_id, offerPrice(variant)])],
      );
    } else {
      await db.query(
        `INSERT IGNORE INTO campaign_items (campaign_id, product_id, variant_id, offer_price, max_qty) VALUES ?`,
        [variants.map((variant) => [
          campaignId,
          variant.product_id,
          variant.variant_id,
          offerPrice(variant),
          hasLimit ? Math.min(Number(max_qty), Number(variant.stock)) : Number(variant.stock),
        ])],
      );
    }

    return { added: variants.length };
  }

  async addCampaignItems(campaignId, variantIds) {
    const campaign = await this.validateCampaign(campaignId);

    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      for (const variantId of variantIds) {
        if (campaign.module === "service") {
          const [serviceRows] = await conn.query(
            `SELECT id, service_id FROM service_variants WHERE id = ? AND status = 1`,
            [variantId],
          );

          if (!serviceRows.length) {
            const error = new Error(`Service variant ${variantId} not found`);
            error.statusCode = 404;
            throw error;
          }

          await conn.query(
            `INSERT IGNORE INTO campaign_service_items (campaign_id, service_id, variant_id) VALUES (?,?,?)`,
            [campaignId, serviceRows[0].service_id, variantId],
          );
          continue;
        }

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

  async updateCampaignServiceItem(campaignId, variantId, offerPrice) {
    await this.validateCampaignItem(campaignId, variantId, "campaign_service_items");

    const [variantRows] = await db.query(
      `SELECT price FROM service_variants WHERE id = ?`,
      [variantId],
    );
    const price = Number(offerPrice);

    if (!Number.isFinite(price) || price <= 0 || Math.round(price * 100) / 100 !== price) {
      const error = new Error("Offer price must be a positive number with at most two decimals");
      error.statusCode = 400;
      throw error;
    }

    // The cheapest live offer is charged, so a higher price would raise what customers pay.
    if (variantRows.length && price >= Number(variantRows[0].price)) {
      const error = new Error(`Offer price must be below the normal price of ₹${variantRows[0].price}`);
      error.statusCode = 400;
      throw error;
    }

    await db.query(
      `UPDATE campaign_service_items SET offer_price = ? WHERE campaign_id = ? AND variant_id = ?`,
      [price, campaignId, variantId],
    );
  }

  async updateCampaignItem(campaignId, variantId, offerPrice, maxQty) {
    const campaign = await this.validateCampaign(campaignId);

    if (campaign.module === "service") {
      return this.updateCampaignServiceItem(campaignId, variantId, offerPrice);
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
      const error = new Error("Variant not found");
      error.statusCode = 404;
      throw error;
    }


    const stock = Number(variantRows[0].stock);

    const fields = [];
    const values = [];

    if (offerPrice !== undefined && offerPrice !== null) {
      if (!Number.isFinite(Number(offerPrice)) || Number(offerPrice) <= 0) {
        const error = new Error("Offer price must be a positive number");
        error.statusCode = 400;
        throw error;
      }

      // The cheapest live offer is charged, so a higher price would raise what customers pay.
      if (Number(offerPrice) >= Number(variantRows[0].sale_price)) {
        const error = new Error(`Offer price must be below the normal price of ₹${variantRows[0].sale_price}`);
        error.statusCode = 400;
        throw error;
      }

      fields.push("offer_price = ?");
      values.push(Number(offerPrice));
    }

    if (maxQty !== undefined && maxQty !== null) {
      if (!Number.isInteger(Number(maxQty)) || Number(maxQty) < 1 || Number(maxQty) > stock) {
        const error = new Error(`Max quantity must be a whole number between 1 and ${stock}`);
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
    const campaign = await this.validateCampaign(campaignId);
    const table = campaign.module === "service" ? "campaign_service_items" : "campaign_items";

    await this.validateCampaignItem(campaignId, variantId, table);

    await db.query(
      `
      DELETE FROM ${table}
      WHERE campaign_id = ?
      AND variant_id = ?
      `,
      [campaignId, variantId],
    );
  }

  // ======================================================User===================================
  async getHomeCampaigns(module = "product") {
    const posterColumns = `
      campaign_id,
      title,
      module,
      banner_image,
      updated_at,
      start_at,
      end_at,
      redirect_type,
      redirect_id,
      redirect_ids,
      redirect_url`;

    const [posters] = await db.query(
      `
    SELECT ${posterColumns}
    FROM campaigns
    WHERE
      campaign_type = 'poster'
      AND module = ?
      AND status = 'active'
      AND ${LIVE_WINDOW_SQL}
    ORDER BY display_order
    `,
      [module],
    );

    const [dashboardPosters] = await db.query(
      `
      SELECT ${posterColumns}
      FROM campaigns
      WHERE
        campaign_type = 'dashboard_poster'
        AND status = 'active'
        AND ${LIVE_WINDOW_SQL}
      ORDER BY display_order
      `,
    );

    const eligibleItems = module === "service"
      ? `
        SELECT 1 FROM campaign_service_items csi
        JOIN services s ON s.id = csi.service_id
        JOIN service_categories sc ON sc.id = s.category_id
        JOIN service_variants sv ON sv.id = csi.variant_id AND sv.service_id = s.id
        WHERE csi.campaign_id = campaigns.campaign_id
          AND s.status = 1 AND sc.status = 1 AND sv.status = 1
          AND csi.offer_price > 0 AND csi.offer_price < sv.price`
      : `
        SELECT 1 FROM campaign_items ci
        JOIN eproducts ep ON ep.product_id = ci.product_id
        JOIN product_variants pv ON pv.variant_id = ci.variant_id AND pv.product_id = ep.product_id
        WHERE ci.campaign_id = campaigns.campaign_id
          AND ep.status = 'approved' AND ep.is_visible = 1 AND ep.is_deleted = 0
          AND pv.is_visible = 1 AND pv.stock > 0
          AND ci.offer_price > 0 AND ci.offer_price < pv.sale_price
          AND ci.max_qty > COALESCE(ci.sold_qty, 0)`;

    const [flashSales] = await db.query(
      `
    SELECT
      campaign_id,
      title,
      module,
      banner_image,
      updated_at,
      start_at,
      end_at
    FROM campaigns
    WHERE
      campaign_type = 'flash_sale'
      AND module = ?
      AND status = 'active'
      AND NOW() BETWEEN start_at AND end_at
      AND EXISTS (${eligibleItems}
      )
    ORDER BY display_order
    `,
      [module],
    );

    return {
      posters: posters.map(publicPoster),
      dashboard_posters: dashboardPosters.map(publicPoster),
      show_flash_sale: flashSales.length > 0,
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
      module,
      banner_image,
      updated_at,
      start_at,
      end_at,
      redirect_type,
      redirect_id,
      redirect_ids,
      redirect_url
    FROM campaigns
    WHERE
      status = 'active'
      AND module = ?
      AND ${LIVE_WINDOW_SQL}
  `;

    const values = [filters.module || "product"];

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

    return rows.map(publicPoster);
  }

  async getUserCampaignById(campaignId, module = "product") {
    const [rows] = await db.query(
      `
    SELECT
      campaign_id,
      title,
      campaign_type,
      module,
      banner_image,
      updated_at,
      start_at,
      end_at,
      redirect_type,
      redirect_id,
      redirect_ids,
      redirect_url
    FROM campaigns
    WHERE
      campaign_id = ?
      AND module = ?
      AND status = 'active'
      AND ${LIVE_WINDOW_SQL}
    `,
      [campaignId, module],
    );

    if (!rows.length) throw notFound();

    return publicPoster(rows[0]);
  }

  /** Product cards a poster opens: its chosen products, or its category/subcategory. */
  async getPosterProducts(campaign, query) {
    const column = POSTER_PRODUCT_COLUMNS[campaign.redirect_type];
    if (!column) return [];

    const curated = campaign.redirect_type === "product";
    const ids = contentTargetIds({ target_ids: campaign.redirect_ids, target_id: campaign.redirect_id });
    if (!ids.length) return [];

    const { size, offset } = pageOf(query);
    const [rows] = await db.query(
      `
      SELECT
        ? AS campaign_id,
        ep.product_id,
        ep.product_name,
        ep.brand_name,
        ep.category_id,
        ep.subcategory_id,
        ep.is_discount_eligible,
        pv.variant_id,
        pv.mrp,
        pv.sale_price AS original_price,
        pv.sale_price AS final_price,
        pi.image_url,
        pi.updated_at AS image_updated_at
      FROM eproducts ep
      JOIN product_variants pv ON pv.variant_id = (
        SELECT v.variant_id FROM product_variants v
        WHERE v.product_id = ep.product_id AND v.is_visible = 1 AND v.sale_price IS NOT NULL
        ORDER BY v.sale_price ASC, v.variant_id ASC LIMIT 1
      )
      LEFT JOIN product_images pi ON pi.image_id = (
        SELECT pi2.image_id FROM product_images pi2
        WHERE pi2.product_id = ep.product_id
        ORDER BY (pi2.type = 'gallery') DESC, pi2.sort_order ASC, pi2.image_id ASC LIMIT 1
      )
      WHERE ${column} IN (?)
        AND ep.status = 'approved'
        AND ep.is_visible = 1
        AND ep.is_deleted = 0
      ORDER BY ${curated ? "FIELD(ep.product_id, ?)" : "ep.product_name"}
      LIMIT ? OFFSET ?
      `,
      curated
        ? [campaign.campaign_id, ids, ids, size, offset]
        : [campaign.campaign_id, ids, size, offset],
    );

    return rows;
  }

  /** Flash sales list their variants; posters list their services or service category. */
  async getCampaignServices(campaignId, query = {}) {
    const campaign = await this.getCampaignById(campaignId);
    if (!campaign || campaign.module !== "service" || campaign.status !== "active") throw notFound();

    if (campaign.campaign_type === "flash_sale") {
      const [rows] = await db.query(
        `
        SELECT
          csi.campaign_id,
          s.id AS service_id,
          s.name,
          s.service_image,
          s.updated_at,
          s.rating,
          s.rating_count,
          s.estimated_days,
          sc.name AS category_name,
          sv.id AS variant_id,
          sv.variant_name,
          sv.title,
          sv.price
        FROM campaign_service_items csi
        JOIN campaigns c ON c.campaign_id = csi.campaign_id
        JOIN services s ON s.id = csi.service_id
        JOIN service_categories sc ON sc.id = s.category_id
        JOIN service_variants sv ON sv.id = csi.variant_id AND sv.service_id = s.id
        WHERE csi.campaign_id = ?
          AND csi.offer_price > 0 AND csi.offer_price < sv.price
          AND s.status = 1 AND sc.status = 1 AND sv.status = 1
          AND c.status = 'active' AND NOW() BETWEEN c.start_at AND c.end_at
        ORDER BY s.sort_order, s.name, sv.id
        `,
        [campaignId],
      );

      return rows;
    }

    if (!POSTER_TYPES.includes(campaign.campaign_type)) return [];

    const column = POSTER_SERVICE_COLUMNS[campaign.redirect_type];
    if (!column) return [];

    const ids = contentTargetIds({ target_ids: campaign.redirect_ids, target_id: campaign.redirect_id });
    if (!ids.length) return [];

    const curated = campaign.redirect_type === "service";
    const { size, offset } = pageOf(query);
    const [rows] = await db.query(
      `
      SELECT
        ? AS campaign_id,
        s.id AS service_id,
        s.name,
        s.service_image,
        s.updated_at,
        s.rating,
        s.rating_count,
        s.estimated_days,
        sc.name AS category_name,
        NULL AS variant_id,
        NULL AS variant_name,
        NULL AS title,
        s.price
      FROM services s
      JOIN service_categories sc ON sc.id = s.category_id
      WHERE ${column} IN (?)
        AND s.status = 1 AND sc.status = 1
      ORDER BY ${curated ? "FIELD(s.id, ?)" : "s.sort_order, s.name"}
      LIMIT ? OFFSET ?
      `,
      curated
        ? [campaignId, ids, ids, size, offset]
        : [campaignId, ids, size, offset],
    );

    return rows;
  }

  async getCampaignProducts(campaignId, query = {}) {
    const campaign = await this.getCampaignById(campaignId);
    if (!campaign || campaign.module === "service") throw notFound();

    if (POSTER_TYPES.includes(campaign.campaign_type)) {
      if (campaign.status !== "active") throw notFound();
      return this.getPosterProducts(campaign, query);
    }

    const [rows] = await db.query(
      `
    SELECT
      ci.id,
      ci.campaign_id,

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
      AND ep.is_deleted = 0
      ${campaign.campaign_type === 'flash_sale' ? `
      AND pv.stock > 0 AND ci.offer_price > 0 AND ci.offer_price < pv.sale_price
      AND ci.max_qty > COALESCE(ci.sold_qty, 0)
      AND EXISTS (SELECT 1 FROM campaigns c WHERE c.campaign_id = ci.campaign_id
        AND c.status = 'active' AND NOW() BETWEEN c.start_at AND c.end_at)
      ` : ''}
    `,
      [campaignId],
    );

    return rows;
  }

  async getFeaturedProductOptions(search = "") {
    const term = `%${String(search).trim()}%`;
    const numericSearch = /^[1-9]\d*$/.test(String(search).trim())
      ? Number(search)
      : null;
    const [rows] = await db.query(
      `SELECT
         p.product_id,
         p.product_name,
         p.brand_name,
         p.category_id,
         c.category_name,
         pv.variant_id,
         pv.sale_price,
         pv.mrp,
         pi.image_url,
         pi.updated_at AS image_updated_at
       FROM eproducts p
       LEFT JOIN categories c ON c.category_id = p.category_id
       JOIN product_variants pv ON pv.variant_id = (
         SELECT v.variant_id
         FROM product_variants v
         WHERE v.product_id = p.product_id
           AND v.is_visible = 1
           AND v.sale_price > 0
           AND v.stock > 0
         ORDER BY v.sale_price, v.variant_id
         LIMIT 1
       )
       LEFT JOIN product_images pi ON pi.image_id = (
         SELECT i.image_id
         FROM product_images i
         WHERE i.product_id = p.product_id
         ORDER BY (i.type = 'gallery') DESC, i.sort_order, i.image_id
         LIMIT 1
       )
       WHERE p.status = 'approved'
         AND p.is_visible = 1
         AND p.is_deleted = 0
         AND pv.stock > 0
         AND (
           p.product_name LIKE ?
           OR p.brand_name LIKE ?
           OR c.category_name LIKE ?
           OR (? IS NOT NULL AND p.product_id = ?)
         )
       ORDER BY p.product_name, p.product_id
       LIMIT 50`,
      [term, term, term, numericSearch, numericSearch],
    );
    return rows.map((row) => ({
      ...row,
      image_url: getPublicUrl(row.image_url, row.image_updated_at),
    }));
  }

  async getFeaturedProducts(campaignId) {
    const [rows] = await db.query(
      `SELECT
         fp.product_id,
         fp.display_order,
         p.product_name,
         p.brand_name,
         p.category_id,
         c.category_name,
         v.variant_id,
         v.sale_price,
         v.mrp,
         v.stock,
         p.status AS product_status,
         p.is_visible AS product_is_visible,
         p.is_deleted AS product_is_deleted,
         i.image_url,
         i.updated_at AS image_updated_at
       FROM campaign_featured_products fp
       LEFT JOIN eproducts p ON p.product_id = fp.product_id
       LEFT JOIN categories c ON c.category_id = p.category_id
       LEFT JOIN product_variants v ON v.variant_id = (
         SELECT pv.variant_id
         FROM product_variants pv
         WHERE pv.product_id = fp.product_id
           AND pv.is_visible = 1
           AND pv.sale_price > 0
           AND pv.stock > 0
         ORDER BY pv.sale_price, pv.variant_id
         LIMIT 1
       )
       LEFT JOIN product_images i ON i.image_id = (
         SELECT pi.image_id
         FROM product_images pi
         WHERE pi.product_id = fp.product_id
         ORDER BY (pi.type = 'gallery') DESC, pi.sort_order, pi.image_id
         LIMIT 1
       )
       WHERE fp.campaign_id = ?
       ORDER BY fp.display_order, fp.product_id`,
      [campaignId],
    );
    return rows.map((row) => ({
      ...row,
      image_url: getPublicUrl(row.image_url, row.image_updated_at),
      is_eligible: Boolean(
        row.product_status === "approved" &&
        Number(row.product_is_visible) === 1 &&
        Number(row.product_is_deleted) === 0 &&
        row.variant_id &&
        Number(row.stock) > 0,
      ),
    }));
  }

  async saveFeaturedProducts(campaignId, productIds) {
    if (!Array.isArray(productIds)) {
      const error = new Error("product_ids must be an array of positive product IDs");
      error.statusCode = 400;
      throw error;
    }
    const normalizedIds = [];
    const seenIds = new Set();
    for (const value of productIds) {
      const id = Number(value);
      if (!Number.isSafeInteger(id) || id <= 0) {
        const error = new Error("product_ids must contain only positive integer IDs");
        error.statusCode = 400;
        throw error;
      }
      if (!seenIds.has(id)) {
        normalizedIds.push(id);
        seenIds.add(id);
      }
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [[campaign]] = await conn.query(
        `SELECT campaign_type, module, status
         FROM campaigns WHERE campaign_id = ? FOR UPDATE`,
        [campaignId],
      );
      if (!campaign || campaign.campaign_type !== "featured" || campaign.module !== "product") {
        const error = new Error("Featured product selections require a product featured campaign");
        error.statusCode = campaign ? 400 : 404;
        throw error;
      }
      if (campaign.status === "active" && !normalizedIds.length) {
        const error = new Error("Set the campaign to draft before removing all featured products");
        error.statusCode = 400;
        throw error;
      }

      if (normalizedIds.length) {
        const [eligibleRows] = await conn.query(
          `SELECT p.product_id
           FROM eproducts p
           WHERE p.product_id IN (?)
             AND p.status = 'approved'
             AND p.is_visible = 1
             AND p.is_deleted = 0
             AND EXISTS (
               SELECT 1 FROM product_variants v
               WHERE v.product_id = p.product_id
                 AND v.is_visible = 1
                 AND v.sale_price > 0
                 AND v.stock > 0
             )`,
          [normalizedIds],
        );
        const eligibleIds = new Set(eligibleRows.map((row) => Number(row.product_id)));
        const invalidIds = normalizedIds.filter((id) => !eligibleIds.has(id));
        if (invalidIds.length) {
          const error = new Error(`Selected products are unavailable or not approved: ${invalidIds.join(", ")}`);
          error.statusCode = 400;
          throw error;
        }
      }

      await conn.query(
        `DELETE FROM campaign_featured_products WHERE campaign_id = ?`,
        [campaignId],
      );
      if (normalizedIds.length) {
        await conn.query(
          `INSERT INTO campaign_featured_products (campaign_id, product_id, display_order)
           VALUES ?`,
          [normalizedIds.map((productId, index) => [campaignId, productId, index + 1])],
        );
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
    return this.getFeaturedProducts(campaignId);
  }

  async getActiveFeaturedCampaign() {
    const [rows] = await db.query(
      `SELECT c.campaign_id, c.title, c.banner_image, c.updated_at,
         c.background_type, c.background_color, c.gradient_end_color,
         c.text_color, c.cta_text, c.display_order,
         (SELECT COUNT(DISTINCT fp.product_id)
          FROM campaign_featured_products fp
          JOIN eproducts p ON p.product_id = fp.product_id
          WHERE fp.campaign_id = c.campaign_id
            AND p.status = 'approved' AND p.is_visible = 1 AND p.is_deleted = 0
            AND EXISTS (
              SELECT 1 FROM product_variants v
              WHERE v.product_id = p.product_id
                AND v.is_visible = 1 AND v.sale_price > 0 AND v.stock > 0
            )) AS total_products
       FROM campaigns c
       WHERE c.campaign_type = 'featured'
         AND c.module = 'product'
         AND c.status = 'active'
         AND (c.start_at IS NULL OR c.start_at <= NOW())
         AND (c.end_at IS NULL OR c.end_at >= NOW())
         AND EXISTS (
           SELECT 1 FROM campaign_featured_products fp
           JOIN eproducts p ON p.product_id = fp.product_id
           WHERE fp.campaign_id = c.campaign_id
             AND p.status = 'approved' AND p.is_visible = 1 AND p.is_deleted = 0
             AND EXISTS (
               SELECT 1 FROM product_variants v
               WHERE v.product_id = p.product_id
                 AND v.is_visible = 1 AND v.sale_price > 0 AND v.stock > 0
             )
         )
       ORDER BY c.display_order, c.campaign_id DESC
       LIMIT 1`,
    );
    if (!rows.length) return null;
    return {
      ...rows[0],
      background: {
        type: rows[0].background_type,
        colors: rows[0].background_type === "gradient"
          ? [rows[0].background_color, rows[0].gradient_end_color]
          : [rows[0].background_color],
        image_url: rows[0].background_type === "image"
          ? getPublicUrl(rows[0].banner_image, rows[0].updated_at)
          : null,
        text_color: rows[0].text_color,
      },
      cta_text: rows[0].cta_text,
      total_products: Number(rows[0].total_products),
      banner_image: undefined,
      background_type: undefined,
      background_color: undefined,
      gradient_end_color: undefined,
      text_color: undefined,
      updated_at: undefined,
    };
  }

  async getPublicFeaturedProducts(campaignId, page = 1, limit = 20) {
    const currentPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
    const offset = (currentPage - 1) * pageSize;
    const [[campaign]] = await db.query(
      `SELECT campaign_id, title
       FROM campaigns
       WHERE campaign_id = ?
         AND campaign_type = 'featured'
         AND module = 'product'
         AND status = 'active'
         AND (start_at IS NULL OR start_at <= NOW())
         AND (end_at IS NULL OR end_at >= NOW())
       LIMIT 1`,
      [campaignId],
    );
    if (!campaign) throw notFound();

    const eligibility = `fp.campaign_id = ?
      AND p.status = 'approved'
      AND p.is_visible = 1
      AND p.is_deleted = 0
      AND EXISTS (
        SELECT 1 FROM product_variants ev
        WHERE ev.product_id = p.product_id
          AND ev.is_visible = 1
          AND ev.sale_price > 0
          AND ev.stock > 0
      )`;
    const [[{ total }]] = await db.query(
      `SELECT COUNT(DISTINCT fp.product_id) AS total
       FROM campaign_featured_products fp
       JOIN eproducts p ON p.product_id = fp.product_id
       WHERE ${eligibility}`,
      [campaignId],
    );
    if (offset >= Number(total)) {
      return {
        campaign_id: campaign.campaign_id,
        title: campaign.title,
        products: [],
        pagination: {
          page: currentPage,
          limit: pageSize,
          total: Number(total),
          totalPages: Math.ceil(Number(total) / pageSize),
        },
      };
    }
    const [products] = await db.query(
      `SELECT
         fp.product_id,
         p.product_name,
         p.brand_name,
         p.category_id,
         p.subcategory_id,
         p.is_discount_eligible,
         pv.variant_id,
         pv.mrp,
         pv.sale_price AS original_price,
         pv.sale_price AS final_price,
         pv.stock,
         fp.campaign_id,
         pi.image_url,
         pi.updated_at AS image_updated_at,
         COALESCE(reviews.avg_rating, 0) AS avg_rating,
         COALESCE(reviews.total_reviews, 0) AS total_reviews
       FROM campaign_featured_products fp
       JOIN eproducts p ON p.product_id = fp.product_id
       JOIN product_variants pv ON pv.variant_id = (
         SELECT v.variant_id
         FROM product_variants v
         WHERE v.product_id = p.product_id
           AND v.is_visible = 1
           AND v.sale_price > 0
           AND v.stock > 0
         ORDER BY v.sale_price, v.variant_id
         LIMIT 1
       )
       LEFT JOIN product_images pi ON pi.image_id = (
         SELECT i.image_id
         FROM product_images i
         WHERE i.product_id = p.product_id
         ORDER BY (i.type = 'gallery') DESC, i.sort_order, i.image_id
         LIMIT 1
       )
       LEFT JOIN (
         SELECT product_id, ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS total_reviews
         FROM product_reviews
         WHERE status = 'approved'
         GROUP BY product_id
       ) reviews ON reviews.product_id = p.product_id
       WHERE ${eligibility}
       ORDER BY fp.display_order, fp.product_id
       LIMIT ? OFFSET ?`,
      [campaignId, pageSize, offset],
    );
    return {
      campaign_id: campaign.campaign_id,
      title: campaign.title,
      products,
      pagination: {
        page: currentPage,
        limit: pageSize,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / pageSize),
      },
    };
  }
}

module.exports = new CampaignModel();
