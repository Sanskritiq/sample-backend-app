const { Pool } = require("pg");

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || "payment_user",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "payment_db",
  password: process.env.DB_PASSWORD || "payment_password",
  port: process.env.DB_PORT || 5432,
});

// Database connection test
const testDatabaseConnection = async () => {
  try {
    await pool.query("SELECT NOW()");
    console.log("Database connected successfully");
  } catch (error) {
    console.error("Database connection failed:", error);
    throw error;
  }
};

module.exports = { pool, testDatabaseConnection };
