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
