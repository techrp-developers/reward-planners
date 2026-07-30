// Load environment variables (.env)
require('dotenv').config();

const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

// Log immediately to confirm file execution
console.log("--------------------------------------------------");
console.log("🚀 STARTING QR CODE SCRIPT...");
console.log("--------------------------------------------------");

const ProductModel = require('../models/ProductModel');

async function generateAllProductQRCodes() {
  try {
    // Output folder path: server/app/ecommerce/v1/product_qr_codes
    const outputFolder = path.join(__dirname, '../product_qr_codes');
    console.log(`📁 Target folder path: ${outputFolder}`);

    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true });
      console.log("📁 Folder created successfully!");
    }

    let page = 1;
    const limit = 50;
    let totalGenerated = 0;
    let hasMore = true;

    while (hasMore) {
      console.log(`📄 Fetching product page ${page}...`);

      const { products, totalItems } = await ProductModel.getAllProducts({
        search: "",
        sortBy: "created_at",
        sortOrder: "DESC",
        limit,
        offset: (page - 1) * limit,
      });

      console.log(`Found ${products ? products.length : 0} products on page ${page}. Total items: ${totalItems}`);

      if (!products || products.length === 0) {
        console.log("No products found.");
        break;
      }

      for (const product of products) {
        const productId = product.product_id;
        const productName = product.product_name || `Product_${productId}`;

        // Deep Link URL for React Native App
        const deepLinkUrl = `https://yourapp.com/product/${productId}`;

        const safeName = productName.replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `qr_${productId}_${safeName}.png`;
        const filePath = path.join(outputFolder, fileName);

        await QRCode.toFile(filePath, deepLinkUrl, {
          width: 600,
          margin: 2,
          color: { dark: '#000000', light: '#FFFFFF' }
        });

        totalGenerated++;
        console.log(`✅ [${totalGenerated}/${totalItems}] Generated: ${fileName}`);
      }

      if (page * limit >= totalItems) {
        hasMore = false;
      } else {
        page++;
      }
    }

    console.log("--------------------------------------------------");
    console.log(`🎉 COMPLETED! ${totalGenerated} QR codes generated in:\n${outputFolder}`);
    console.log("--------------------------------------------------");
    process.exit(0);

  } catch (error) {
    console.error("❌ ERROR inside script:", error);
    process.exit(1);
  }
}

// Execute and catch any top-level errors
generateAllProductQRCodes().catch((err) => {
  console.error("❌ Unhandled Error:", err);
});