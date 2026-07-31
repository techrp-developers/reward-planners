const db = require("../../config/database");
const { getPublicUrl } = require("../utils/publicUrl");

const HERO_IMAGE_JOIN = `
  LEFT JOIN product_images pimg ON pimg.image_id = (
    SELECT pi2.image_id FROM product_images pi2
    WHERE pi2.product_id = p.product_id
    ORDER BY pi2.sort_order ASC
    LIMIT 1
  )`;

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
  // empty JSON object stands in when no label is given.
  // SKU is auto-generated per variant whenever omitted (never required from
  // the client), consistent with the main catalog's RP-<productId>-<random>
  // scheme. generateUniqueSku re-checks via the SAME connection/transaction
  // each time, so an earlier variant's just-inserted (still uncommitted) sku
  // is already visible to the next variant's check — no separate in-memory
  // dedupe set needed for the omitted-sku case. An explicitly duplicated sku
  // across two variants in the same request instead hits product_variants'
  // real UNIQUE KEY and rolls back the whole product — same as the existing
  // single-variant ER_DUP_ENTRY handling in productQuickCreateService.
  //
  // `variants` (optional array) is the multi-variant path; when absent, the
  // old flat mrp/salePrice/initialStock fields drive a single variant,
  // unchanged from before — full backward compatibility for every existing
  // caller.
  async createQuick({ vendorId, productName, brandName, categoryId, subcategoryId, mrp, salePrice, initialStock, variants }, conn) {
    const [productResult] = await conn.execute(
      `INSERT INTO eproducts
        (vendor_id, category_id, subcategory_id, brand_name, product_name, status, is_deleted, is_searchable, is_visible, created_via)
       VALUES (?, ?, ?, ?, ?, 'approved', 0, 1, 1, 'flea_market_quick_create')`,
      [vendorId, categoryId || null, subcategoryId || null, brandName || null, productName],
    );
    const productId = productResult.insertId;

    const variantInputs =
      Array.isArray(variants) && variants.length > 0 ? variants : [{ mrp, salePrice, initialStock }];

    const createdVariants = [];
    for (const v of variantInputs) {
      const sku = v.sku ? String(v.sku).trim() : await generateUniqueSku(conn, productId);
      const variantAttributes = v.label ? JSON.stringify({ size: v.label }) : "{}";

      const [variantResult] = await conn.execute(
        `INSERT INTO product_variants (sku, product_id, variant_attributes, mrp, sale_price, stock, is_visible)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [sku, productId, variantAttributes, v.mrp, v.salePrice, v.initialStock],
      );

      createdVariants.push({
        variantId: variantResult.insertId,
        sku,
        label: v.label || null,
        mrp: Number(v.mrp),
        salePrice: Number(v.salePrice),
        stock: Number(v.initialStock),
      });
    }

    // Backward-compatible shape: productId/variantId/sku at the top level
    // still describe the FIRST (and, for every pre-existing caller, only)
    // variant, plus the new `variants` array for multi-variant callers.
    return { productId, variantId: createdVariants[0].variantId, sku: createdVariants[0].sku, variants: createdVariants };
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

  // "All Products" overview — every catalog product (existing + quick-
  // created), one row per variant since pricing/stock live there, not on
  // eproducts. current_stock prefers an active flea market pool's
  // available_qty (what's actually sellable at the flea market right now)
  // and falls back to the master product_variants.stock for anything never
  // yet topped up into a pool — a variant can have at most one active pool
  // row (unique per vendor+variant, and vendor is fixed per product), so
  // this LEFT JOIN never fans out.
  buildOverviewFilter(query, vendorId, params) {
    const conditions = ["p.status = 'approved'", "p.is_deleted = 0"];
    if (query) {
      const like = `%${query}%`;
      conditions.push("(p.product_name LIKE ? OR p.brand_name LIKE ? OR pv.sku LIKE ?)");
      params.push(like, like, like);
    }
    if (vendorId) {
      conditions.push("p.vendor_id = ?");
      params.push(vendorId);
    }
    return conditions.join(" AND ");
  }

  async findAllForOverview({ query, vendorId, limit, offset }) {
    const params = [];
    const where = this.buildOverviewFilter(query, vendorId, params);
    params.push(limit, offset);

    const [rows] = await db.execute(
      `SELECT
         p.product_id, p.brand_name, p.product_name, p.category_id, p.subcategory_id, p.is_discount_eligible,
         pv.variant_id, pv.sku, pv.mrp, pv.sale_price,
         COALESCE(fvs.available_qty, pv.stock) AS current_stock,
         pimg.image_url
       FROM eproducts p
       JOIN product_variants pv ON pv.product_id = p.product_id
       LEFT JOIN flea_market_vendor_stock fvs ON fvs.variant_id = pv.variant_id AND fvs.status = 'active'
       ${HERO_IMAGE_JOIN}
       WHERE ${where}
       ORDER BY p.product_name ASC, pv.variant_id ASC
       LIMIT ? OFFSET ?`,
      params,
    );
    return rows.map((row) => ({ ...row, hero_image: getPublicUrl(row.image_url) }));
  }

  async countAllForOverview({ query, vendorId }) {
    const params = [];
    const where = this.buildOverviewFilter(query, vendorId, params);
    const [[row]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM eproducts p
       JOIN product_variants pv ON pv.product_id = p.product_id
       WHERE ${where}`,
      params,
    );
    return Number(row.total);
  }

  // Filter-dropdown source — only vendors that actually have a listed
  // product, not every vendor in the system (most of whom would just be
  // empty filter results here).
  async findVendorsWithProducts() {
    const [rows] = await db.execute(
      `SELECT DISTINCT v.vendor_id, v.company_name
       FROM eproducts p
       JOIN vendors v ON v.vendor_id = p.vendor_id
       WHERE p.status = 'approved' AND p.is_deleted = 0
       ORDER BY v.company_name ASC`,
    );
    return rows;
  }
}

module.exports = new ProductModel();
