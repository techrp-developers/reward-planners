const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function dashboard(birthdays) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, "../controller/authController.js"), "utf8");
  vm.runInNewContext(source, {
    module, console, process: { env: {} },
    require(name) {
      if (name === "../models/authModel") return {
        getUserInfo: async () => ({ user_id: 7 }),
        getCompanyBirthdays: async () => birthdays,
      };
      if (name.includes("fitnessService")) return { getTodaySummary: async () => ({}) };
      return {};
    },
  });
  let response;
  await module.exports.getUserInfo({ user: { user_id: 7 } }, {
    set() {},
    status(code) { assert.equal(code, 200); return this; },
    json(value) { response = value; return this; },
  });
  return response;
}

test("dashboard birthday list excludes upcoming birthdays and employees without a birthday", async () => {
  const today = { employeeId: 1, isToday: true };
  const upcoming = { employeeId: 2, isToday: false };
  const missingDob = { employeeId: 3, dob: null, isToday: false };
  const response = await dashboard({
    today: [today], upcoming: [upcoming, missingDob],
    all: [today, upcoming, missingDob], todayCount: 1, upcomingCount: 2,
  });
  assert.equal(response.success, true);
  assert.deepEqual(response.data.birthday_employees, [today]);
  assert.equal(response.data.today_birthday_count, 1);
});

test("dashboard birthday list stays empty when nobody has a birthday today", async () => {
  const response = await dashboard({ today: [], all: [{ employeeId: 2, isToday: false }] });
  assert.equal(response.data.birthday_employees.length, 0);
  assert.equal(response.data.today_birthday_count, 0);
});
