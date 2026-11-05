const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function stub(relative, exports) {
  const file = require.resolve(path.join(__dirname, relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}
for (const dependency of [
  "../../../config/database", "../../service/v1/middlewares/razorpay",
  "../models/busModel", "../models/busBookingOrderModel",
  "../services/bookingService", "../services/refundService",
  "../../../services/alertService",
]) stub(dependency, {});

const requests = [];
stub("../utils/srdvClient", {
  post: async (url, body) => {
    requests.push(body);
    return { data: { Error: { ErrorCode: 0 }, Result: [[{ SeatName: "1", SeatStatus: true }]] } };
  },
});
const { getSeatLayout } = require("../controllers/busController");

async function layout(extra = {}) {
  requests.length = 0;
  const savedUrl = process.env.SRDV_SEAT_LAYOUT_URL;
  const savedToken = process.env.SRDV_API_TOKEN;
  process.env.SRDV_SEAT_LAYOUT_URL = "https://provider.example/seat-layout";
  process.env.SRDV_API_TOKEN = "test-token";
  const result = {};
  const res = {
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; },
  };
  try {
    await getSeatLayout({ body: { traceId: "123", resultIndex: "result-1", ...extra } }, res);
    return result;
  } finally {
    if (savedUrl === undefined) delete process.env.SRDV_SEAT_LAYOUT_URL;
    else process.env.SRDV_SEAT_LAYOUT_URL = savedUrl;
    if (savedToken === undefined) delete process.env.SRDV_API_TOKEN;
    else process.env.SRDV_API_TOKEN = savedToken;
  }
}

test("seat layout works without optional boarding and dropping points", async () => {
  const result = await layout();
  assert.equal(result.status, 200);
  assert.equal(result.body.availableSeats, 1);
  assert.deepEqual(requests, [{ TraceId: 123, ResultIndex: "result-1" }]);
});

test("seat layout forwards normalized boarding and dropping points", async () => {
  const result = await layout({ boardingPointId: 42, droppingPointId: " 84 " });
  assert.equal(result.status, 200);
  assert.deepEqual(requests[0], {
    TraceId: 123, ResultIndex: "result-1", BoardingPointId: "42", DroppingPointId: "84",
  });
});

test("seat layout rejects an incomplete point pair before calling provider", async () => {
  for (const extra of [{ boardingPointId: 42 }, { droppingPointId: 84 }]) {
    const result = await layout(extra);
    assert.equal(result.status, 400);
    assert.match(result.body.message, /provided together/);
    assert.equal(requests.length, 0);
  }
});

test("seat layout rejects malformed point IDs before calling provider", async () => {
  const result = await layout({ boardingPointId: {}, droppingPointId: "84" });
  assert.equal(result.status, 400);
  assert.match(result.body.message, /between 1 and 100/);
  assert.equal(requests.length, 0);
});
