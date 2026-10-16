const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "rewardplanners_db",
    multipleStatements: true,
  });

  try {
    const sql = fs.readFileSync(
      path.join(__dirname, "../migrations/20261005_01_add_status_likes_comments.sql"),
      "utf8",
    );
    await connection.query(sql);
    console.log("Status likes and comments migration completed.");
  } finally {
    await connection.end();
  }
}

migrate().catch((error) => {
  console.error("Status interactions migration failed:", error.message);
  process.exitCode = 1;
});
