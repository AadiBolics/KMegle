const { Pool } = require("pg");
require("dotenv").config();

// Safety check
if (!process.env.DATABASE_URL) {
  console.error(
    "🚨 CRITICAL ERROR: DATABASE_URL is missing! Node cannot find your .env file."
  );
  process.exit(1);
}

// TLS verification is required so we can't be MITM'd via a spoofed DB host.
// Neon (and most managed Postgres providers) present a certificate chain
// signed by a public CA, so rejectUnauthorized: true works out of the box
// in production. For local/dev setups using a self-signed cert or a private
// CA, set DATABASE_CA_CERT to the PEM contents of that CA certificate.
const sslConfig = {
  require: true,
  rejectUnauthorized: true,
};

if (process.env.DATABASE_CA_CERT) {
  sslConfig.ca = process.env.DATABASE_CA_CERT;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
  // Default (10) became a real bottleneck under concurrent load: every
  // connecting socket fires independent ban/cooldown queries in parallel
  // (unlike the matchmaker's serialized per-pass queries), so at a few
  // hundred simultaneous connections the pool saturates and the rest queue
  // up. DATABASE_URL already points at Neon's pooler (PgBouncer) endpoint,
  // which multiplexes many app-side connections over few real Postgres
  // backends, so raising this is safe — it's not fighting Neon's own
  // connection limit, just our own artificially low ceiling.
  max: 50,
  idleTimeoutMillis: 30000,
  // Fail fast if the pool is fully saturated rather than hanging forever
  // (pg's default is to wait indefinitely for a free connection).
  connectionTimeoutMillis: 5000,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Database connection error:", err.stack);
    // Fail fast: don't let the process limp along without a working DB
    // connection — that leads to silent degraded behavior (e.g. fail-open
    // ban checks) later instead of a loud deploy failure now.
    process.exit(1);
  } else {
    console.log("🗄️ Successfully connected to Neon PostgreSQL Database!");
  }

  if (client) {
    release();
  }
});

module.exports = pool;