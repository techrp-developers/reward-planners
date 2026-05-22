const db = require("../config/database");

class VariantModel {
  async getVariantsByProduct(productId) {
    const [rows] = await db.execute(
      `
      SELECT
        v.variant_id,
        v.sku,
        v.mrp,
        v.sale_price,
        v.stock,
        v.is_visible,
        v.variant_attributes,
        v.manufacturing_date,
        v.expiry_date,
        v.created_at
      FROM product_variants v
      WHERE v.product_id = ?
      ORDER BY v.variant_id ASC
      `,
      [productId],
    );

    return rows.map((v) => ({
      ...v,
      variant_attributes:
        typeof v.variant_attributes === "string"
          ? JSON.parse(v.variant_attributes)
          : v.variant_attributes,
    }));
  }

  // 2. Get single variant
  async getVariantById(variantId) {
    const [[variant]] = await db.execute(
      `SELECT * FROM product_variants WHERE variant_id = ?`,
      [variantId],
    );

    if (!variant) return null;

    const [images] = await db.execute(
      `SELECT image_id, image_url FROM product_variant_images WHERE variant_id = ?`,
      [variantId],
    );

    return {
      ...variant,
      variant_attributes:
        typeof variant.variant_attributes === "string"
          ? JSON.parse(variant.variant_attributes)
          : variant.variant_attributes,
      images,
    };
  }

  // 3. Update variant fields
  async updateVariant(variantId, data) {
    await db.execute(
      `
    UPDATE product_variants
    SET
      mrp = ?,
      sale_price = ?,
      stock = ?,
      manufacturing_date = ?,
      expiry_date = ?,
      weight = ?,
      length = ?,
      breadth = ?,
      height = ?
    WHERE variant_id = ?
    `,
      [
        data.mrp || null,
        data.sale_price || null,
        data.stock ?? 0,
        data.manufacturing_date || null,
        data.expiry_date || null,
        Number(data.weight),
        Number(data.length),
        Number(data.breadth),
        Number(data.height),
        variantId,
      ],
    );
  }

  // 4. Insert variant images
  async insertVariantImages(variantId, images) {
    for (const img of images) {
      await db.execute(
        `
        INSERT INTO product_variant_images (variant_id, image_url)
        VALUES (?, ?)
        `,
        [variantId, img.path],
      );
    }
  }

  // Visibility
  async updateVisibility({ variantId, isVisible }) {
    const [result] = await db.query(
      `
      UPDATE product_variants
      SET is_visible = ?
      WHERE variant_id = ?
      `,
      [isVisible ? 1 : 0, variantId],
    );

    return result.affectedRows;
  }

  // check variant
  async checkVariantProductRelation(productId, variantId) {
    const qry = `
        SELECT 1
        FROM product_variants
        WHERE variant_id = ?
          AND product_id = ?
        LIMIT 1
      `;

    const rows = await db.execute(qry, [variantId, productId]);
    return rows.length > 0;
  }

  // update reward Limit
  async updateRewardLimit(productId, variantId, rewardLimit) {
    const qry = `
    UPDATE product_variants
    SET reward_redemption_limit = ?
    WHERE variant_id = ?
      AND product_id = ?
  `;

    return await db.execute(qry, [rewardLimit, variantId, productId]);
  }
}

module.exports = new VariantModel();
