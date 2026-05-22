const puppeteer = require("puppeteer");

async function generateInvoicePDF(html) {

  const browser = await puppeteer.launch({
    headless: true,
    executablePath:
      "/home/rewardplanners/.cache/puppeteer/chrome/linux-1108766/chrome-linux/chrome",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage"
    ]
  });

  const page = await browser.newPage();

  await page.setContent(html, {
    waitUntil: "networkidle0"
  });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: {
      top: "20px",
      bottom: "20px",
      left: "20px",
      right: "20px"
    }
  });

  await browser.close();

  return pdfBuffer;
}

module.exports = { generateInvoicePDF };