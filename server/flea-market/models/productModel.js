const db = require("../../config/database");

// Matches the exact scheme the main catalog's productModel.generateSKU uses
// (RP-<productId>-<6 char random base36>) — kept as a local copy since this
// module doesn't import from server/models, but the format must stay
// consistent with every other SKU in product_variants.
function generateSku(productId) {
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `RP-${productId}-${randomPart}`;
}

async function generateUniqueSku(conn, productId) {
  let sku;
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 10) {
    sku = generateSku(productId);
    const [rows] = await conn.execute(`SELECT 1 FROM product_variants WHERE sku = ? LIMIT 1`, [sku]);
    exists = rows.length > 0;
    attempts++;
  }

  if (exists) throw new Error("SKU generation failed");
  return sku;
}

class ProductModel {
  async findVariantDetail(variantId) {
    const [rows] = await db.execute(
      `SELECT
         pv.variant_id, pv.product_id, pv.sku, pv.mrp, pv.sale_price, pv.stock, pv.is_visible,
         p.product_name, p.brand_name, p.vendor_id, p.category_id, p.subcategory_id,
         p.status, p.is_deleted, p.is_searchable, p.is_discount_eligible
       FROM product_variants pv
       JOIN eproducts p ON p.product_id = pv.product_id
       WHERE pv.variant_id = ?`,
      [variantId],
    );
    return rows[0];
  }

  // Manager-facing catalog search for the allocation page — unlike search()
  // above (customer billing search, scoped to what's allocated to today's
  // event), this searches the full master catalog so a manager can pick
  // something to allocate in the first place. Also reused by
  // VendorSalesReportPage's cross-vendor product filter (no vendorId there),
  // so vendorId stays optional here — the allocation flow's "must pick a
  // vendor first" rule is enforced by ProductPicker only ever calling this
  // with one, not by this shared endpoint rejecting its absence.
  // is_visible lives on product_variants, not eproducts — matches the same
  // column checkoutService checks at actual sale time, so a manager can't
  // allocate a variant that would just fail to sell later.
  async searchCatalog(query, vendorId, limit) {
    const like = `%${query}%`;
    const params = [like, like, like];
    let vendorClause = "";

    if (vendorId) {
      vendorClause = "AND p.vendor_id = ?";
      params.push(vendorId);
    }

    params.push(limit);

    const [rows] = await db.execute(
      `SELECT
         pv.variant_id, pv.product_id, pv.sku, pv.mrp, pv.sale_price, pv.stock,
         p.product_name, p.brand_name, p.vendor_id
       FROM product_variants pv
       JOIN eproducts p ON p.product_id = pv.product_id
       WHERE p.status = 'approved' AND p.is_deleted = 0 AND pv.is_visible = 1
         AND (p.product_name LIKE ? OR pv.sku LIKE ? OR p.brand_name LIKE ?)
         ${vendorClause}
       ORDER BY p.product_name ASC
       LIMIT ?`,
      params,
    );
    return rows;
  }

  // Quick-create path used by the allocation page's "+ Add New Product" —
  // product_variants.variant_attributes is NOT NULL with no default, so an
  // empty JSON object stands in (this flow doesn't collect variant options).
  // SKU is always auto-generated (never accepted from the client) so every
  // quick-created product gets one, consistent with the main catalog's flow.
  async createQuick({ vendorId, productName, brandName, categoryId, subcategoryId, mrp, salePrice, initialStock }, conn) {
    const [productResult] = await conn.execute(
      `INSERT INTO eproducts
        (vendor_id, category_id, subcategory_id, brand_name, product_name, status, is_deleted, is_searchable, is_visible, created_via)
       VALUES (?, ?, ?, ?, ?, 'approved', 0, 1, 1, 'flea_market_quick_create')`,
      [vendorId, categoryId || null, subcategoryId || null, brandName || null, productName],
    );
    const productId = productResult.insertId;

    const sku = await generateUniqueSku(conn, productId);

    const [variantResult] = await conn.execute(
      `INSERT INTO product_variants (sku, product_id, variant_attributes, mrp, sale_price, stock, is_visible)
       VALUES (?, ?, '{}', ?, ?, ?, 1)`,
      [sku, productId, mrp, salePrice, initialStock],
    );

    return { productId, variantId: variantResult.insertId, sku };
  }

  async findVariantForUpdate(variantId, conn) {
    const [rows] = await conn.execute(
      `SELECT
         pv.variant_id, pv.product_id, pv.sku, pv.mrp, pv.sale_price, pv.stock, pv.is_visible,
         p.product_name, p.brand_name, p.vendor_id, p.category_id, p.subcategory_id,
         p.status, p.is_deleted, p.is_searchable, p.is_discount_eligible
       FROM product_variants pv
       JOIN eproducts p ON p.product_id = pv.product_id
       WHERE pv.variant_id = ?
       FOR UPDATE`,
      [variantId],
    );
    return rows[0];
  }

  // Optimistic decrement — never trust a prior read, verify at write time.
  async decrementStock(variantId, qty, conn) {
    const [result] = await conn.execute(
      `UPDATE product_variants SET stock = stock - ? WHERE variant_id = ? AND stock >= ?`,
      [qty, variantId, qty],
    );
    return result.affectedRows > 0;
  }

  // Event-close return path: unsold/undamaged allocated stock goes back to
  // the master pool.
  async incrementStock(variantId, qty, conn) {
    await conn.execute(`UPDATE product_variants SET stock = stock + ? WHERE variant_id = ?`, [qty, variantId]);
  }
}

module.exports = new ProductModel();
