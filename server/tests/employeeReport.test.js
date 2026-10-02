const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const ExcelJS = require("exceljs");
const { Writable } = require("node:stream");

async function exportReport(params = {}, query = {}) {
  const employees = [
    { employee_id: 1, company_id: 7, company_name: "Company A", name: "Alice", customer_id: 1, customer_status: 1 },
    { employee_id: 2, company_id: 7, company_name: "Company A", name: "Bob", customer_id: null },
    { employee_id: 3, company_id: 8, company_name: "Company B", name: "Carol", customer_id: 3, customer_status: 1 },
  ];
  const calls = [];
  const context = {
    module: { exports: {} }, console,
    require(name) {
      if (name === "exceljs") return ExcelJS;
      if (name === "../config/database") return {
        async execute(sql, values) {
          calls.push({ sql, values });
          return [sql.includes("WHERE cu.company_id = ?")
            ? employees.filter((employee) => employee.company_id === values[0]) : employees];
        },
      };
      return {};
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../controllers/managerController.js"), "utf8"), context);
  const chunks = [];
  const response = new Writable({ write(chunk, encoding, callback) { chunks.push(chunk); callback(); } });
  response.setHeader = () => {};
  response.status = (code) => { response.statusCode = code; return response; };
  response.json = (body) => { response.body = body; return response; };
  await context.module.exports.downloadEmployeeActivationReport({ params, query }, response);
  if (response.statusCode) return { response, calls };
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.concat(chunks));
  return { workbook, calls };
}

test("company download scopes every workbook sheet and summary", async () => {
  const { workbook, calls } = await exportReport({ companyId: "7" });
  assert.equal(calls[0].values[0], 7);
  assert.equal(workbook.getWorksheet("Summary").getCell("B2").value, 2);
  const employees = workbook.getWorksheet("Employees");
  assert.equal(employees.rowCount, 3);
  assert.equal(employees.getCell("C2").value, "Company A");
  assert.equal(employees.getCell("C3").value, "Company A");
  assert.equal(workbook.getWorksheet("Activated Employees").rowCount, 2);
  assert.equal(workbook.getWorksheet("Not Activated Employees").rowCount, 2);
});

test("all-company download retains every employee", async () => {
  const { workbook } = await exportReport();
  assert.equal(workbook.getWorksheet("Summary").getCell("B2").value, 3);
  assert.equal(workbook.getWorksheet("Employees").rowCount, 4);
});

test("invalid company is rejected without querying employees", async () => {
  const { response, calls } = await exportReport({ companyId: "invalid" });
  assert.equal(response.statusCode, 400);
  assert.equal(calls.length, 0);
});

test("legacy company query filter remains supported", async () => {
  const { workbook } = await exportReport({}, { companyId: "8" });
  assert.equal(workbook.getWorksheet("Employees").rowCount, 2);
  assert.equal(workbook.getWorksheet("Employees").getCell("C2").value, "Company B");
});
