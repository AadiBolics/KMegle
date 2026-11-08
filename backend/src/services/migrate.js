const fs = require("node:fs");
const path = require("node:path");
module.exports = async function migrate(db) {
  let client,
    transactionStarted = false,
    failure;
  let stage = "connect",
    migration;
  try {
    client = await db.connect();
    const query = (text, values) =>
      client.query({ text, values, query_timeout: 65000 });
    stage = "begin";
    await query("BEGIN");
    transactionStarted = true;
    stage = "timeouts";
    await query("SET LOCAL statement_timeout = '60s'");
    await query("SET LOCAL lock_timeout = '10s'");
    stage = "lock";
    await query("SELECT pg_advisory_xact_lock(73948201)");
    stage = "ledger";
    await query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const applied = await query("SELECT version FROM schema_migrations");
    const versions = new Set(applied.rows.map((row) => row.version));
    for (const file of fs
      .readdirSync(path.join(__dirname, "../../migrations"))
      .filter((file) => file.endsWith(".sql"))
      .sort()) {
      if (versions.has(file)) continue;
      stage = "migration";
      migration = file;
      await query(
        fs
          .readFileSync(path.join(__dirname, "../../migrations", file), "utf8")
          .replace(/^\uFEFF/, ""),
      );
      await query("INSERT INTO schema_migrations(version) VALUES($1)", [file]);
    }
    stage = "commit";
    migration = undefined;
    await query("COMMIT");
    transactionStarted = false;
  } catch (error) {
    failure =
      error instanceof Error ? error : new Error("Database startup failed");
    failure.migrationStage = stage;
    failure.migrationFile = migration;
    if (transactionStarted) {
      try {
        await client.query({ text: "ROLLBACK", query_timeout: 5000 });
      } catch (rollbackError) {
        failure.rollbackCode = rollbackError.code || "ROLLBACK_FAILED";
      }
    }
    throw failure;
  } finally {
    if (client) client.release(failure);
  }
};
