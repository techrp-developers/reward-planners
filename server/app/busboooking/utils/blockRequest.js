const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TITLES = new Set(["Mr", "Mrs", "Ms", "Miss"]);

function scalarString(value, min, max) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized.length >= min && normalized.length <= max
    ? normalized
    : null;
}

function requiredString(value, min, max) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= min && normalized.length <= max
    ? normalized
    : null;
}

function validEmail(value) {
  const email = requiredString(value, 3, 254);
  return email && EMAIL_PATTERN.test(email) ? email : null;
}

function validatePassenger(passenger, index) {
  if (!passenger || typeof passenger !== "object" || Array.isArray(passenger)) {
    return { error: `Passenger ${index + 1} must be an object` };
  }

  const Title = requiredString(passenger.Title, 2, 4);
  const FirstName = requiredString(passenger.FirstName, 1, 100);
  const LastName = requiredString(passenger.LastName, 1, 100);
  const Gender = String(passenger.Gender ?? "").trim();
  const Age = Number(String(passenger.Age ?? "").trim());
  const Email = validEmail(passenger.Email);
  const PhoneNo = String(passenger.PhoneNo ?? "").trim();
  const Address = requiredString(passenger.Address, 1, 500);
  const SeatName = requiredString(passenger.SeatName, 1, 100);

  if (!TITLES.has(Title)) return { error: `Passenger ${index + 1}: invalid Title` };
  if (!FirstName) return { error: `Passenger ${index + 1}: FirstName is required` };
  if (!LastName) return { error: `Passenger ${index + 1}: LastName is required` };
  if (Gender !== "1" && Gender !== "2") {
    return { error: `Passenger ${index + 1}: Gender must be "1" or "2"` };
  }
  if (!Number.isInteger(Age) || Age < 1 || Age > 120) {
    return { error: `Passenger ${index + 1}: Age must be an integer from 1 to 120` };
  }
  if (!Email) return { error: `Passenger ${index + 1}: a valid Email is required` };
  if (!/^\d{10}$/.test(PhoneNo)) {
    return { error: `Passenger ${index + 1}: PhoneNo must contain exactly 10 digits` };
  }
  if (typeof passenger.LeadPassenger !== "boolean") {
    return { error: `Passenger ${index + 1}: LeadPassenger must be a boolean` };
  }
  if (typeof passenger.IdNumber !== "string" || passenger.IdNumber.length > 100) {
    return { error: `Passenger ${index + 1}: IdNumber must be a string of at most 100 characters` };
  }
  if (typeof passenger.IdType !== "string" || passenger.IdType.length > 50) {
    return { error: `Passenger ${index + 1}: IdType must be a string of at most 50 characters` };
  }
  if (!Address) return { error: `Passenger ${index + 1}: Address is required` };
  if (!SeatName) return { error: `Passenger ${index + 1}: SeatName is required` };

  const GSTNumber = passenger.GSTNumber == null || passenger.GSTNumber === ""
    ? null
    : requiredString(passenger.GSTNumber, 1, 30);
  if (passenger.GSTNumber != null && passenger.GSTNumber !== "" && !GSTNumber) {
    return { error: `Passenger ${index + 1}: GSTNumber must not exceed 30 characters` };
  }

  let GSTCompanyName = null;
  let GSTCompanyAddress = null;
  let GSTCompanyEmail = null;
  if (GSTNumber) {
    GSTCompanyName = requiredString(passenger.GSTCompanyName, 1, 200);
    GSTCompanyAddress = requiredString(passenger.GSTCompanyAddress, 1, 500);
    GSTCompanyEmail = validEmail(passenger.GSTCompanyEmail);
    if (!GSTCompanyName || !GSTCompanyAddress || !GSTCompanyEmail) {
      return {
        error: `Passenger ${index + 1}: GST company name, address and valid email are required with GSTNumber`,
      };
    }
  }

  return {
    value: {
      Title,
      FirstName,
      LastName,
      Gender,
      Age,
      Email,
      PhoneNo,
      LeadPassenger: passenger.LeadPassenger,
      IdNumber: passenger.IdNumber.trim(),
      IdType: passenger.IdType.trim(),
      Address,
      SeatName,
      GSTCompanyName,
      GSTNumber,
      GSTCompanyAddress,
      GSTCompanyEmail,
    },
  };
}

function validateBlockRequest(input) {
  const TraceId = Number(String(input?.traceId ?? "").trim());
  const ResultIndex = requiredString(input?.resultIndex, 3, 500);
  const BoardingPointId = scalarString(input?.boardingPointId, 1, 100);
  const DroppingPointId = scalarString(input?.droppingPointId, 1, 100);
  const RefId = scalarString(input?.refId, 1, 200);

  if (!Number.isSafeInteger(TraceId) || TraceId <= 0) {
    return { error: "TraceId must be a positive integer" };
  }
  if (!ResultIndex) return { error: "ResultIndex must contain between 3 and 500 characters" };
  if (!BoardingPointId) return { error: "BoardingPointId is required and must not exceed 100 characters" };
  if (!DroppingPointId) return { error: "DroppingPointId is required and must not exceed 100 characters" };
  if (!RefId) return { error: "RefId is required and must not exceed 200 characters" };
  if (!Array.isArray(input?.passengers) || input.passengers.length < 1 || input.passengers.length > 10) {
    return { error: "Passengers must contain between 1 and 10 passengers" };
  }

  const Passengers = [];
  for (let index = 0; index < input.passengers.length; index += 1) {
    const result = validatePassenger(input.passengers[index], index);
    if (result.error) return result;
    Passengers.push(result.value);
  }

  if (Passengers.filter((passenger) => passenger.LeadPassenger).length !== 1) {
    return { error: "Exactly one passenger must be the lead passenger" };
  }
  if (new Set(Passengers.map((passenger) => passenger.SeatName)).size !== Passengers.length) {
    return { error: "Each passenger must have a unique SeatName" };
  }

  return {
    value: {
      TraceId,
      ResultIndex,
      BoardingPointId,
      DroppingPointId,
      RefId,
      Passengers,
    },
  };
}

module.exports = { validateBlockRequest };
