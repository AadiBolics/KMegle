const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const migrate = require("../src/services/migrate");
// This deliberately never reads DATABASE_URL or .env. CI supplies a disposable database.
test(
  "fresh database migrations run once and support all durable application records",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const db = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 3000,
      statement_timeout: 5000,
    });
    try {
      await migrate(db);
      await migrate(db);
      const versions = await db.query(
        "SELECT version FROM schema_migrations ORDER BY version",
      );
      assert.deepEqual(
        versions.rows.map((row) => row.version),
        ["001_application.sql", "002_report_receipts.sql"],
      );
      await db.query("BEGIN");
      await db.query(
        "INSERT INTO users(id,email_hash) VALUES('migration-test-a','test-hash-a'),('migration-test-b','test-hash-b') ON CONFLICT DO NOTHING",
      );
      await db.query(
        "INSERT INTO user_acceptances(uid,version) VALUES('migration-test-a','2026-11-08') ON CONFLICT(uid) DO UPDATE SET version=EXCLUDED.version",
      );
      await db.query(
        "INSERT INTO user_blocks(blocker_id,blocked_id) VALUES('migration-test-a','migration-test-b') ON CONFLICT DO NOTHING",
      );
      await db.query(
        "INSERT INTO reports(reporter_id,reported_id,reason,request_id) VALUES('migration-test-a','migration-test-b','synthetic','test-request') ON CONFLICT(reporter_id,request_id) DO NOTHING",
      );
      await db.query(
        "INSERT INTO reports(reporter_id,reported_id,reason,request_id) VALUES('migration-test-a','migration-test-b','synthetic','test-request') ON CONFLICT(reporter_id,request_id) DO NOTHING",
      );
      const reports = await db.query(
        "SELECT count(*)::int AS total FROM reports WHERE reporter_id='migration-test-a' AND request_id='test-request'",
      );
      assert.equal(reports.rows[0].total, 1);
      const blocks = await db.query(
        "SELECT block_ref,created_at FROM user_blocks WHERE blocker_id='migration-test-a'",
      );
      assert.ok(blocks.rows[0].block_ref);
      assert.ok(blocks.rows[0].created_at);
      await db.query(
        "INSERT INTO admin_actions(admin_uid,action,subject) VALUES('migration-test-admin','review','test-report')",
      );
      await db.query("ROLLBACK");
    } finally {
      await db.end();
    }
  },
);

test(
  "legacy block records survive adding the new reference columns",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const db = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 3000,
    });
    const client = await db.connect();
    const schema =
      "migration_test_" +
      require("node:crypto").randomUUID().replaceAll("-", "");
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}`);
      await client.query(
        "CREATE TABLE user_blocks (blocker_id varchar(128),blocked_id varchar(128),UNIQUE(blocker_id,blocked_id))",
      );
      await client.query(
        "INSERT INTO user_blocks VALUES('legacy-a','legacy-b')",
      );
      const adapter = {
        connect: async () => ({ query: (q) => client.query(q), release() {} }),
      };
      await migrate(adapter);
      await migrate(adapter);
      const result = await client.query(
        "SELECT blocker_id,blocked_id,block_ref,created_at FROM user_blocks",
      );
      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].blocker_id, "legacy-a");
      assert.equal(result.rows[0].blocked_id, "legacy-b");
      assert.ok(result.rows[0].block_ref);
      assert.ok(result.rows[0].created_at);
    } finally {
      await client.query("SET search_path TO public");
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      client.release();
      await db.end();
    }
  },
);
