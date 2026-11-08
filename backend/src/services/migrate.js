const fs = require("node:fs");
const path = require("node:path");
module.exports = async function migrate(db) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(73948201)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const applied = await client.query("SELECT version FROM schema_migrations");
    const versions = new Set(applied.rows.map((row) => row.version));
    for (const file of fs
      .readdirSync(path.join(__dirname, "../../migrations"))
      .filter((file) => file.endsWith(".sql"))
      .sort()) {
      if (versions.has(file)) continue;
      await client.query(
        fs.readFileSync(path.join(__dirname, "../../migrations", file), "utf8"),
      );
      await client.query("INSERT INTO schema_migrations(version) VALUES($1)", [
        file,
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
