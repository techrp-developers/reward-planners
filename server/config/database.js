// Shared MySQL pool for API handlers, workers, and scheduled jobs.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mysql = require("mysql2");

const port = Number(process.env.DB_PORT || 3306);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("DB_PORT must be an integer between 1 and 65535");
}

const connectTimeout = Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000);
if (!Number.isSafeInteger(connectTimeout) || connectTimeout <= 0) {
  throw new Error("DB_CONNECT_TIMEOUT_MS must be a positive integer");
}
if (!process.env.DB_PASSWORD) {
  console.warn("Database startup warning: DB_PASSWORD is empty; verify that the configured MySQL user permits passwordless local connections.");
}
if (!process.env.DB_NAME) {
  console.warn("Database startup warning: DB_NAME is not set; using the existing rewardplanners_db default.");
}

const config = {
  host: process.env.DB_HOST || "localhost",
  port,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "rewardplanners_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
  dateStrings: true,
  connectTimeout,
};

console.log([
  "Database configuration:",
  `Host: ${config.host}`,
  `Port: ${config.port}`,
  `User: ${config.user}`,
  `Database: ${config.database}`,
].join("\n"));

const pool = mysql.createPool(config);
// Acquiring a connection verifies authentication and the configured database.
function checkConnection(retried = false) {
  pool.getConnection((err, connection) => {
    if (err) {
      if (err.code === "ETIMEDOUT" && !retried) {
        console.warn("Database startup connection timed out; retrying once in 1 second. Check DB_HOST and DB_CONNECT_TIMEOUT_MS if it persists.");
        setTimeout(() => checkConnection(true), 1000).unref();
        return;
      }
      console.error("Database connection: FAILED", err.code || "UNKNOWN_ERROR");
      return;
    }
    console.log("Database connection: SUCCESS");
    connection.release();
  });
}
checkConnection();

module.exports = pool.promise();
