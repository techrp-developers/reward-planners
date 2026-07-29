// barcode_value is deterministic from allocation_id, computed on the fly —
// no stored column. (MariaDB 10.4 forbids generated columns that reference an
// AUTO_INCREMENT column, so the originally-planned STORED generated column
// isn't possible here; a real column populated via INSERT-then-UPDATE was the
// alternative, but computing it in both directions is simpler and needs no
// migration at all — see barcodeToAllocationId for the reverse/scan path.)
const PREFIX = "FMA-";
const DIGITS = 6;

function allocationIdToBarcode(allocationId) {
  return `${PREFIX}${String(allocationId).padStart(DIGITS, "0")}`;
}

// Returns null (not a throw) on anything that isn't a well-formed barcode —
// callers treat that the same as "not found" rather than a parse error.
function barcodeToAllocationId(barcodeValue) {
  const match = /^FMA-(\d{6,})$/.exec(String(barcodeValue || "").trim());
  if (!match) return null;
  const allocationId = Number(match[1]);
  return Number.isInteger(allocationId) && allocationId > 0 ? allocationId : null;
}

module.exports = { allocationIdToBarcode, barcodeToAllocationId };
