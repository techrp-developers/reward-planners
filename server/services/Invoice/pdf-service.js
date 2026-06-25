const puppeteer = require("puppeteer");
const fs = require("fs");

function getChromeExecutablePath() {
  let bundledChromePath;

  try {
    bundledChromePath = puppeteer.executablePath?.();
  } catch {
    bundledChromePath = null;
  }

  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    bundledChromePath,
    process.platform === "win32"
      ? process.env.PROGRAMFILES &&
        `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`
      : null,
    process.platform === "win32"
      ? process.env["PROGRAMFILES(X86)"] &&
        `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe`
      : null,
    process.platform === "win32"
      ? process.env.LOCALAPPDATA &&
        `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
      : null,
    process.platform === "win32"
      ? process.env.PROGRAMFILES &&
        `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`
      : null,
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function generateInvoicePDF(html) {
  const executablePath = getChromeExecutablePath();

  if (!executablePath) {
    throw new Error(
      "Chrome executable not found. Install Puppeteer's browser with `npx puppeteer browsers install chrome` or set PUPPETEER_EXECUTABLE_PATH.",
    );
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage"
    ]
  });

  try {
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

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

module.exports = { generateInvoicePDF };
