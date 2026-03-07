const { Pool } = require("pg");
require("dotenv").config();

// Safety Check: Did the .env file load?
if (!process.env.DATABASE_URL) {
  console.error("🚨 CRITICAL ERROR: DATABASE_URL is missing! Node cannot find your .env file.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
    rejectUnauthorized: false, // Fixes the SSL rejection issue on local machines
  },
});

pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Database connection error:", err.stack);
  } else {
    console.log("🗄️  Successfully connected to Neon PostgreSQL Database!");
  }
  if (client) release();
});

module.exports = pool;