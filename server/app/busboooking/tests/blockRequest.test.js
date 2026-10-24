const test = require("node:test");
const assert = require("node:assert/strict");
const { validateBlockRequest } = require("../utils/blockRequest");

const passenger = {
  Title: "Mr",
  FirstName: "Test",
  LastName: "Passenger",
  Gender: "1",
  Age: "31",
  Email: "test.user@example.com",
  PhoneNo: "9876543210",
  LeadPassenger: true,
  IdNumber: "",
  IdType: "",
  Address: "Test Address",
  SeatName: "1",
};

test("normalizes the new SRDV Block request and drops extra seat data", () => {
  const result = validateBlockRequest({
    traceId: "2620022",
    resultIndex: "39_2000000157030079020",
    boardingPointId: 89682,
    droppingPointId: "24532",
    refId: "YOUR-REF-0001",
    passengers: [{ ...passenger, Seat: { SeatName: "must-not-be-sent" } }],
  });

  assert.equal(result.error, undefined);
  assert.equal(result.value.TraceId, 2620022);
  assert.equal(result.value.Passengers[0].Age, 31);
  assert.equal(result.value.Passengers[0].Seat, undefined);
});

test("requires exactly one lead passenger and unique seats", () => {
  const common = {
    traceId: 1,
    resultIndex: "result-index",
    boardingPointId: "1",
    droppingPointId: "2",
    refId: "ref",
  };

  assert.match(
    validateBlockRequest({ ...common, passengers: [{ ...passenger, LeadPassenger: false }] }).error,
    /Exactly one/,
  );
  assert.match(
    validateBlockRequest({
      ...common,
      passengers: [passenger, { ...passenger, LeadPassenger: false }],
    }).error,
    /unique SeatName/,
  );
});

test("requires complete GST details when GSTNumber is supplied", () => {
  const result = validateBlockRequest({
    traceId: 1,
    resultIndex: "result-index",
    boardingPointId: "1",
    droppingPointId: "2",
    refId: "ref",
    passengers: [{ ...passenger, GSTNumber: "GST123" }],
  });
  assert.match(result.error, /GST company name/);
});
