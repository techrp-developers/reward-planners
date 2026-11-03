// Builds a readable, chronological SRDV API log (.txt) from the exchange logs
// written by app/busboooking/utils/srdvClient.js.
//
//   node scripts/export-srdv-logs.js [--from ISO] [--to ISO] [--trace 123,456]
//                                    [--title "..."] [--out file.txt]
//
// --trace keeps only exchanges whose request or response carries one of the
// given TraceIds, so a single journey can be exported on its own.
const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "../logs/srdv");

const STAGE_NAMES = {
  Search: "Bus Search",
  GetBoardingPointDetails: "Boarding & Dropping Points",
  GetSeatLayOut: "Seat Layout",
  Block: "Block Seat",
  Book: "Booking",
  Cancel: "Cancellation",
  Balance: "Balance",
  BalanceLog: "Balance Log",
};

function readArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    args[argv[index].replace(/^--/, "")] = argv[index + 1];
  }
  return args;
}

function traceIdsOf(entry) {
  return [entry.request?.body?.TraceId, entry.response?.body?.TraceId]
    .filter((value) => value !== undefined && value !== null)
    .map(String);
}

function loadEntries() {
  if (!fs.existsSync(LOG_DIR)) return [];
  return fs
    .readdirSync(LOG_DIR)
    .filter((file) => /^srdv-exchanges-.*\.jsonl$/.test(file))
    .flatMap((file) =>
      fs
        .readFileSync(path.join(LOG_DIR, file), "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    )
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function formatEntry(entry, number) {
  const stage = STAGE_NAMES[entry.endpoint] || entry.endpoint;
  const lines = [
    "=".repeat(78),
    `${number}. ${stage.toUpperCase()}`,
    "=".repeat(78),
    `Timestamp (UTC) : ${entry.timestamp}`,
    `Endpoint        : ${entry.method} ${entry.url}`,
    `HTTP Status     : ${entry.response?.httpStatus ?? "no response"}`,
    `Duration        : ${entry.durationMs} ms`,
  ];
  if (entry.error) lines.push(`Transport Error : ${entry.error}`);
  lines.push(
    "",
    "--- Request Headers ---",
    JSON.stringify(entry.request?.headers ?? {}, null, 2),
    "",
    "--- Request Body ---",
    JSON.stringify(entry.request?.body ?? null, null, 2),
    "",
    "--- Response Body ---",
    JSON.stringify(entry.response?.body ?? null, null, 2),
    "",
  );
  return lines.join("\n");
}

function main() {
  const args = readArgs(process.argv.slice(2));
  const traces = args.trace ? new Set(args.trace.split(",").map((t) => t.trim())) : null;

  const entries = loadEntries().filter((entry) => {
    if (args.from && entry.timestamp < args.from) return false;
    if (args.to && entry.timestamp > args.to) return false;
    if (traces && !traceIdsOf(entry).some((id) => traces.has(id))) return false;
    return true;
  });

  if (!entries.length) {
    console.error("No SRDV exchanges matched. Is SRDV_EXCHANGE_LOG=true set?");
    process.exitCode = 1;
    return;
  }

  const header = [
    args.title || "SRDV Bus API - Request/Response Log",
    `Generated (UTC) : ${new Date().toISOString()}`,
    `Exchanges       : ${entries.length}`,
    "Redaction       : UserName, Password and Api-Token are redacted;",
    "                  passenger phone, email, address and ID number are masked.",
    "",
    "Sequence:",
    ...entries.map(
      (entry, index) =>
        `  ${index + 1}. ${entry.timestamp}  ${STAGE_NAMES[entry.endpoint] || entry.endpoint}` +
        `  (HTTP ${entry.response?.httpStatus ?? "-"})`,
    ),
    "",
  ].join("\n");

  const body = entries.map((entry, index) => formatEntry(entry, index + 1)).join("\n");
  const out = args.out || path.join(LOG_DIR, `srdv-api-log-${Date.now()}.txt`);
  fs.writeFileSync(out, `${header}\n${body}`);
  console.log(`Wrote ${entries.length} exchanges to ${out}`);
}

main();
