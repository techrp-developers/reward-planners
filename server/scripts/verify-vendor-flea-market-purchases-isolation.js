// Run with: node scripts/verify-vendor-flea-market-purchases-isolation.js
// (from the server/ directory, with the local backend already running).
//
// Confirms GET /vendor/flea-market/purchases (and its filter-options
// sibling) resolve vendorId ONLY from the authenticated session
// (req.user.vendor_id, set server-side in middleware/auth.js) — never from
// a query param — so one vendor can never see another vendor's sales data,
// even by deliberately tampering with the request.
//
// No test framework is configured in this project (see package.json's
// "test" script) — this follows the same plain-Node verification-script
// convention used elsewhere in this codebase.

require("dotenv").config();
const db = require("../config/database");
const { generateToken } = require("../utils/jwt");

const PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${PORT}`;

async function fetchJson(path, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json() };
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

(async () => {
  const [[vendorA]] = await db.execute(
    `SELECT DISTINCT i.vendor_id, v.user_id
     FROM invoices i
     JOIN vendors v ON v.vendor_id = i.vendor_id
     WHERE i.source = 'flea_market'
     LIMIT 1`,
  );
  if (!vendorA) {
    console.log("No flea_market invoices in this database yet — nothing to verify. Run a checkout first.");
    process.exit(0);
  }

  const [[vendorB]] = await db.execute(
    `SELECT vendor_id, user_id FROM vendors WHERE vendor_id != ? AND user_id IS NOT NULL LIMIT 1`,
    [vendorA.vendor_id],
  );
  if (!vendorB) {
    console.log("Only one vendor account exists — nothing to isolate against.");
    process.exit(0);
  }

  const tokenA = generateToken({ user_id: vendorA.user_id });
  const tokenB = generateToken({ user_id: vendorB.user_id });

  console.log(`Vendor A = vendor_id ${vendorA.vendor_id} (has flea-market invoices)`);
  console.log(`Vendor B = vendor_id ${vendorB.vendor_id} (isolation target)\n`);

  const asA = await fetchJson("/vendor/flea-market/purchases", tokenA);
  if (asA.status === 200 && asA.body.data.pagination.total > 0) {
    pass(`Vendor A's own request returns ${asA.body.data.pagination.total} row(s)`);
  } else {
    fail(`Vendor A's own request returned unexpected result: ${JSON.stringify(asA.body)}`);
  }
  const aInvoiceIds = new Set(asA.body.data.rows.map((r) => r.invoiceId));

  const asB = await fetchJson("/vendor/flea-market/purchases", tokenB);
  const bLeaksAUntampered = asB.body.data.rows.some((r) => aInvoiceIds.has(r.invoiceId));
  if (asB.status === 200 && !bLeaksAUntampered) {
    pass("Vendor B's own request contains none of Vendor A's invoices");
  } else {
    fail(`Vendor B's request leaked Vendor A's data: ${JSON.stringify(asB.body)}`);
  }

  // THE critical test: Vendor B spoofs vendor_id/vendorId query params
  // pointing at Vendor A — must be silently ignored, not honored.
  for (const param of ["vendor_id", "vendorId"]) {
    const tampered = await fetchJson(`/vendor/flea-market/purchases?${param}=${vendorA.vendor_id}`, tokenB);
    const leaks = tampered.body?.data?.rows?.some((r) => aInvoiceIds.has(r.invoiceId));
    const matchesUntamperedB = JSON.stringify(tampered.body.data) === JSON.stringify(asB.body.data);
    if (tampered.status === 200 && !leaks && matchesUntamperedB) {
      pass(`Spoofing ?${param}=${vendorA.vendor_id} as Vendor B is ignored (still gets Vendor B's own scoped data)`);
    } else {
      fail(`Spoofing ?${param}=${vendorA.vendor_id} as Vendor B changed the result — tampering was HONORED: ${JSON.stringify(tampered.body)}`);
    }
  }

  const tamperedOptions = await fetchJson(`/vendor/flea-market/purchases/filter-options?vendor_id=${vendorA.vendor_id}`, tokenB);
  const untamperedOptions = await fetchJson("/vendor/flea-market/purchases/filter-options", tokenB);
  if (JSON.stringify(tamperedOptions.body) === JSON.stringify(untamperedOptions.body)) {
    pass("filter-options ignores a spoofed vendor_id too");
  } else {
    fail(`filter-options tampering was honored: ${JSON.stringify(tamperedOptions.body)}`);
  }

  const noAuth = await fetch(`${BASE_URL}/vendor/flea-market/purchases`);
  if (noAuth.status === 401) {
    pass("No Authorization header -> 401 (no default vendor fallback)");
  } else {
    fail(`Expected 401 with no auth, got ${noAuth.status}`);
  }

  await db.end();
  console.log(process.exitCode ? "\nRESULT: FAILED" : "\nRESULT: ALL PASSED");
  process.exit(process.exitCode || 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
