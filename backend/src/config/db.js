const { Pool } = require("pg");
require("dotenv").config();

// Safety check
if (!process.env.DATABASE_URL) {
  console.error(
    "🚨 CRITICAL ERROR: DATABASE_URL is missing! Node cannot find your .env file.",
  );
  process.exit(1);
}

// TLS verification is required so we can't be MITM'd via a spoofed DB host.
// Neon (and most managed Postgres providers) present a certificate chain
// signed by a public CA, so rejectUnauthorized: true works out of the box
// in production. For local/dev setups using a self-signed cert or a private
// CA, set DATABASE_CA_CERT to the PEM contents of that CA certificate.
const pool = new Pool(require("./databaseOptions")());

pool.on("error", () => console.error("Database pool connection failed"));
module.exports = pool;
