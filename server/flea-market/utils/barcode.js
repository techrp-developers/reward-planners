// barcode_value is deterministic from pool_id, computed on the fly — no
// stored column. (MariaDB 10.4 forbids generated columns that reference an
// AUTO_INCREMENT column, so the originally-planned STORED generated column
// isn't possible here; a real column populated via INSERT-then-UPDATE was the
// alternative, but computing it in both directions is simpler and needs no
// migration at all — see barcodeToPoolId for the reverse/scan path.)
//
// Prefix/format unchanged from the old allocation_id-based scheme (only the
// underlying ID's meaning changed) — but the ID space is fresh (pool_id
// starts over from the new flea_market_vendor_stock table, not continuing
// old allocation_id numbers), so every already-printed label from before
// this migration is now stale and must be reprinted.
const PREFIX = "FMA-";
const DIGITS = 6;

function poolIdToBarcode(poolId) {
  return `${PREFIX}${String(poolId).padStart(DIGITS, "0")}`;
}

// Returns null (not a throw) on anything that isn't a well-formed barcode —
// callers treat that the same as "not found" rather than a parse error.
function barcodeToPoolId(barcodeValue) {
  const match = /^FMA-(\d{6,})$/.exec(String(barcodeValue || "").trim());
  if (!match) return null;
  const poolId = Number(match[1]);
  return Number.isInteger(poolId) && poolId > 0 ? poolId : null;
}

module.exports = { poolIdToBarcode, barcodeToPoolId };
