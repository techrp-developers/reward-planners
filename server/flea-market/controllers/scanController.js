const allocationModel = require("../models/allocationModel");
const { barcodeToAllocationId } = require("../utils/barcode");

class ScanController {
  // Resolves a scanned barcode to a cart-addable item shaped exactly like a
  // /products/search result — so the frontend can push it through the same
  // addProduct() path used for typed search, no parallel cart-add logic.
  async resolve(req, res) {
    try {
      const allocationId = barcodeToAllocationId(req.params.barcodeValue);
      if (allocationId === null) {
        return res.status(404).json({ error: "BARCODE_NOT_FOUND" });
      }

      const allocation = await allocationModel.findByIdForScan(allocationId);
      if (!allocation) {
        return res.status(404).json({ error: "BARCODE_NOT_FOUND" });
      }

      if (allocation.status !== "active") {
        return res.status(409).json({
          error: "ALLOCATION_NOT_ACTIVE",
          message: "This product is not allocated to today's active event",
        });
      }

      if (allocation.available_qty <= 0) {
        return res.status(409).json({ error: "OUT_OF_STOCK" });
      }

      return res.json({
        success: true,
        data: {
          variantId: allocation.variant_id,
          productId: allocation.product_id,
          vendorId: allocation.vendor_id,
          name: allocation.product_name,
          brand: allocation.brand_name,
          sku: allocation.sku,
          mrp: Number(allocation.mrp),
          salePrice: allocation.allocation_price != null ? Number(allocation.allocation_price) : Number(allocation.sale_price),
          stock: allocation.available_qty,
        },
      });
    } catch (error) {
      console.error("[flea-market][scan] error:", error);
      return res.status(500).json({ success: false, message: "Failed to resolve barcode" });
    }
  }
}

module.exports = new ScanController();
