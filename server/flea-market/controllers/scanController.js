const poolStockModel = require("../models/poolStockModel");
const { barcodeToPoolId } = require("../utils/barcode");

class ScanController {
  // Resolves a scanned barcode to a cart-addable item shaped exactly like a
  // /products/search result — so the frontend can push it through the same
  // addProduct() path used for typed search, no parallel cart-add logic.
  async resolve(req, res) {
    try {
      const poolId = barcodeToPoolId(req.params.barcodeValue);
      if (poolId === null) {
        return res.status(404).json({ error: "BARCODE_NOT_FOUND" });
      }

      const pool = await poolStockModel.findByIdForScan(poolId);
      if (!pool) {
        return res.status(404).json({ error: "BARCODE_NOT_FOUND" });
      }

      if (pool.status !== "active") {
        return res.status(409).json({
          error: "POOL_NOT_ACTIVE",
          message: "This product's flea market stock pool is not active",
        });
      }

      if (pool.available_qty <= 0) {
        return res.status(409).json({ error: "OUT_OF_STOCK" });
      }

      return res.json({
        success: true,
        data: {
          variantId: pool.variant_id,
          productId: pool.product_id,
          vendorId: pool.vendor_id,
          name: pool.product_name,
          brand: pool.brand_name,
          sku: pool.sku,
          mrp: Number(pool.mrp),
          salePrice: pool.allocation_price != null ? Number(pool.allocation_price) : Number(pool.sale_price),
          stock: pool.available_qty,
          heroImage: pool.hero_image,
        },
      });
    } catch (error) {
      console.error("[flea-market][scan] error:", error);
      return res.status(500).json({ success: false, message: "Failed to resolve barcode" });
    }
  }
}

module.exports = new ScanController();
