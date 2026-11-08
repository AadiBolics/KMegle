const test = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("pg");
const options = require("../src/config/databaseOptions");
const migrate = require("../src/services/migrate");
const summarize = require("../src/services/databaseError");
const fs = require("node:fs");
const url =
  "postgresql://test_user:test_password@pooler.invalid/test_db?sslmode=require&channel_binding=require";

test("pooler startup omits unsupported timeouts and preserves verified TLS/custom CA", () => {
  const config = options({ DATABASE_URL: url, DATABASE_CA_CERT: "test-ca" });
  const client = new Client(config);
  const startup = client.getStartupConf();
  assert.equal(startup.statement_timeout, undefined);
  assert.equal(startup.lock_timeout, undefined);
  assert.equal(startup.options, undefined);
  assert.equal(config.query_timeout, 6000);
  assert.equal(client.connectionParameters.ssl.rejectUnauthorized, true);
  assert.equal(client.connectionParameters.ssl.ca, "test-ca");
  assert.equal(
    new URL(config.connectionString).searchParams.get("sslmode"),
    null,
  );
  assert.equal(
    new URL(config.connectionString).searchParams.get("channel_binding"),
    "require",
  );
});

test("legacy/insecure URL SSL switches cannot override certificate verification", () => {
  for (const mode of [
    "require",
    "prefer",
    "verify-ca",
    "no-verify",
    "disable",
  ]) {
    const config = options({
      DATABASE_URL: `postgresql://test:test@pooler.invalid/test?sslmode=${mode}&uselibpqcompat=true`,
    });
    assert.equal(
      new Client(config).connectionParameters.ssl.rejectUnauthorized,
      true,
    );
  }
  assert.throws(
    () => options({ DATABASE_URL: "not a URL" }),
    /valid PostgreSQL/,
  );
});

function fakeDb(fail) {
  const queries = [];
  let releaseError;
  const client = {
    query: async (query) => {
      queries.push(query);
      if (fail) await fail(query);
      return { rows: [] };
    },
    release: (error) => {
      releaseError = error;
    },
  };
  return {
    connect: async () => client,
    queries,
    get releaseError() {
      return releaseError;
    },
  };
}
test("migration deadlines are transaction-local and override short runtime query deadline", async () => {
  const db = fakeDb();
  await migrate(db);
  const sql = db.queries.map((q) => q.text);
  assert.equal(sql[0], "BEGIN");
  assert.ok(
    sql.indexOf("SET LOCAL statement_timeout = '60s'") <
      sql.indexOf("SELECT pg_advisory_xact_lock(73948201)"),
  );
  assert.equal(sql.at(-1), "COMMIT");
  assert.ok(db.queries.every((q) => q.query_timeout === 65000));
  assert.equal(db.releaseError, undefined);
});
test("a UTF-8 BOM in a Windows-written SQL file is stripped before PostgreSQL sees it", async (context) => {
  const read = fs.readFileSync;
  context.mock.method(fs, "readFileSync", (file, ...args) => {
    const value = read(file, ...args);
    return String(file).endsWith(".sql") ? "\uFEFF" + value : value;
  });
  const db = fakeDb();
  await migrate(db);
  assert.ok(
    db.queries.some((q) =>
      q.text.startsWith("CREATE TABLE IF NOT EXISTS users"),
    ),
  );
  assert.ok(db.queries.every((q) => !q.text.startsWith("\uFEFF")));
});
test("migration errors retain SQLSTATE/file even if rollback also fails", async () => {
  const original = Object.assign(
    new Error("permission denied for schema public"),
    { code: "42501" },
  );
  const db = fakeDb((query) => {
    if (query.text.startsWith("CREATE TABLE IF NOT EXISTS users"))
      throw original;
    if (query.text === "ROLLBACK")
      throw Object.assign(new Error("connection closed"), {
        code: "ECONNRESET",
      });
  });
  await assert.rejects(migrate(db), (error) => {
    assert.equal(error, original);
    assert.equal(error.migrationFile, "001_application.sql");
    assert.equal(error.migrationStage, "migration");
    assert.equal(error.rollbackCode, "ECONNRESET");
    return true;
  });
  assert.equal(db.releaseError, original);
});
test("connection failures are diagnosed as connect failures, without attempting rollback", async () => {
  const original = Object.assign(new Error("connection refused"), {
    code: "ECONNREFUSED",
  });
  await assert.rejects(
    migrate({
      connect: async () => {
        throw original;
      },
    }),
    (error) => error === original && error.migrationStage === "connect",
  );
});
test("startup diagnostics redact credentials and omit row detail and raw query", () => {
  const error = Object.assign(
    new Error(`failure connecting to ${url} password=hidden`),
    {
      code: "42501",
      migrationStage: "migration",
      migrationFile: "001_application.sql",
      detail: "private-student-identifier",
      query: "private query",
      cause: new Error(`upstream ${url}`),
    },
  );
  const json = JSON.stringify(summarize(error, { DATABASE_URL: url }));
  for (const secret of [
    "test_password",
    "test_user",
    "private-student-identifier",
    "private query",
    "password=hidden",
  ])
    assert.ok(!json.includes(secret));
  assert.match(json, /42501/);
  assert.match(json, /001_application.sql/);
});
