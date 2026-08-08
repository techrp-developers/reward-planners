const bwipjs = require("bwip-js");
const puppeteer = require("puppeteer");

// Thermal label physical size — 50mm x 30mm is a common small-format roll
// label, but this varies by printer model. Confirm against the actual
// hardware and adjust these two values; everything else derives from them.
const THERMAL_WIDTH_MM = 50;
const THERMAL_HEIGHT_MM = 30;

// A4 sheet grid — 3 columns x 8 rows = 24 labels/page, a common sticker-sheet
// layout (e.g. A4 sized adhesive label sheets sold in that grid).
const A4_COLUMNS = 3;
const A4_ROWS = 8;

async function renderBarcodePngBase64(barcodeValue) {
  const png = await bwipjs.toBuffer({
    bcid: "code128",
    text: barcodeValue,
    scale: 3,
    height: 10,
    includetext: false,
  });
  return `data:image/png;base64,${png.toString("base64")}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function labelMarkup(label, barcodeSrc) {
  return `
    <div class="label">
      <div class="label-header">Rewards Planners — Flea Market</div>
      <div class="label-vendor">Vendor: ${escapeHtml(label.vendorName)}</div>
      <hr/>
      <div class="label-product">${escapeHtml(label.productName)}</div>
      <div class="label-sku">SKU: ${escapeHtml(label.sku)}</div>
      <img class="label-barcode" src="${barcodeSrc}" />
      <div class="label-barcode-number">${escapeHtml(label.barcodeValue)}</div>
      <div class="label-pricing">
        <div>MRP: &#8377;${escapeHtml(label.mrp)}</div>
        <div>Selling Price: &#8377;${escapeHtml(label.sellingPrice)}</div>
        <div>Earn Reward: ${escapeHtml(label.earnRewardPoints)} RP</div>
        <div>Redeem Reward: ${escapeHtml(label.redeemRewardPoints)} RP</div>
      </div>
    </div>`;
}

const SHARED_LABEL_CSS = `
  .label {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 2mm;
    overflow: hidden;
  }
  .label-header { font-size: 6pt; font-weight: 700; color: #444; }
  .label-vendor { font-size: 6pt; color: #666; margin-top: 0.5mm; }
  .label hr { width: 90%; border: none; border-top: 0.3mm solid #ccc; margin: 1mm 0; }
  .label-product { font-size: 8pt; font-weight: 700; line-height: 1.15; }
  .label-sku { font-size: 6.5pt; color: #666; margin-top: 0.5mm; }
  .label-barcode { width: 85%; height: auto; margin-top: 1mm; }
  .label-barcode-number { font-size: 6.5pt; letter-spacing: 0.3mm; margin-top: 0.3mm; }
  .label-pricing { font-size: 6.5pt; margin-top: 1mm; line-height: 1.3; }
  .label-pricing div { white-space: nowrap; }
`;

async function generateLabelHtml(labelDataList, format) {
  const barcodes = await Promise.all(labelDataList.map((label) => renderBarcodePngBase64(label.barcodeValue)));
  const labelsHtml = labelDataList.map((label, index) => labelMarkup(label, barcodes[index])).join("\n");

  if (format === "thermal") {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: ${THERMAL_WIDTH_MM}mm ${THERMAL_HEIGHT_MM}mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; }
  .label { width: ${THERMAL_WIDTH_MM}mm; height: ${THERMAL_HEIGHT_MM}mm; page-break-after: always; }
  .label:last-child { page-break-after: auto; }
  ${SHARED_LABEL_CSS}
</style>
</head>
<body>
${labelsHtml}
</body>
</html>`;
  }

  // a4sheet
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 8mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; }
  .sheet {
    display: grid;
    grid-template-columns: repeat(${A4_COLUMNS}, 1fr);
    grid-auto-rows: minmax(0, 1fr);
    gap: 2mm;
  }
  .label {
    border: 0.2mm dashed #bbb;
    break-inside: avoid;
  }
  /* Force a new A4 page every COLUMNS*ROWS labels. */
  .label:nth-child(${A4_COLUMNS * A4_ROWS}n) { break-after: page; }
  ${SHARED_LABEL_CSS}
</style>
</head>
<body>
<div class="sheet">
${labelsHtml}
</div>
</body>
</html>`;
}

async function generatePdf(html, format) {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    // page.pdf() resolves a plain Uint8Array in this puppeteer version, not a
    // Node Buffer — wrap it so callers (Express res.send, Content-Length)
    // always get the type they expect.
    const pdf =
      format === "thermal"
        ? await page.pdf({
            width: `${THERMAL_WIDTH_MM}mm`,
            height: `${THERMAL_HEIGHT_MM}mm`,
            printBackground: true,
          })
        : await page.pdf({ format: "A4", printBackground: true });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

module.exports = { generateLabelHtml, generatePdf };
