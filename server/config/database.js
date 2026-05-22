// config/database.js
const mysql = require("mysql2");
require("dotenv").config();

const pool = mysql.createPool({                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "rewardplanners_db",                                                                              
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",                                                                           
  dateStrings: true,
});

// Test connection
pool.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Database connection failed:", err.message);
  } else {
    console.log("✅ Database connected successfully to rewardplanners_db");
    connection.release();
  }
});

// Promisify for async/await usage
const db = pool.promise();

module.exports = db;
