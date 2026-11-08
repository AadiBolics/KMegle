const fs = require("node:fs");

// URL sslmode parameters otherwise replace pg's explicit ssl object.
module.exports = function databaseOptions(env = process.env) {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  let url;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("DATABASE_URL must use PostgreSQL");
  const ssl = { rejectUnauthorized: true };
  for (const [parameter, property] of [
    ["sslrootcert", "ca"],
    ["sslcert", "cert"],
    ["sslkey", "key"],
  ]) {
    const file = url.searchParams.get(parameter);
    if (file) ssl[property] = fs.readFileSync(file, "utf8");
  }
  if (env.DATABASE_CA_CERT) ssl.ca = env.DATABASE_CA_CERT;
  for (const name of [
    "ssl",
    "sslmode",
    "sslrootcert",
    "sslcert",
    "sslkey",
    "uselibpqcompat",
  ])
    url.searchParams.delete(name);
  return {
    connectionString: url.toString(),
    ssl,
    max: 50,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    query_timeout: 6000,
    // Transaction poolers can reject timeout parameters in startup packets.
    // Migration server-side deadlines are applied using SET LOCAL instead.
  };
};
