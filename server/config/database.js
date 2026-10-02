// Shared MySQL pool for API handlers, workers, and scheduled jobs.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mysql = require("mysql2");

const port = Number(process.env.DB_PORT || 3306);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("DB_PORT must be an integer between 1 and 65535");
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
pool.getConnection((err, connection) => {
  if (err) {
    console.error("Database connection: FAILED", err.code || "UNKNOWN_ERROR");
    return;
  }
  console.log("Database connection: SUCCESS");
  connection.release();
});

module.exports = pool.promise();
