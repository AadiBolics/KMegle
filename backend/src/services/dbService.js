const db = require("../config/db");

// Auto-initialize required moderation tables if they don't exist
async function initModerationSchema() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_violations (
        id SERIAL PRIMARY KEY,
        uid VARCHAR(128) NOT NULL,
        violation_type VARCHAR(64) NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_user_violations_uid_time ON user_violations(uid, timestamp DESC);

      CREATE TABLE IF NOT EXISTS reports (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        reporter_id VARCHAR(128) NOT NULL,
        reported_id VARCHAR(128) NOT NULL,
        reason TEXT,
        status VARCHAR(64) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_reports_reported_id ON reports(reported_id);
    `);
    console.log("🛡️ Moderation tables verified/created in database");
  } catch (err) {
    console.error("❌ Error initializing moderation tables:", err.message);
  }
}

// Run schema verification on startup
initModerationSchema();

const dbService = {
  // Sync user into database (KMEGLE-SEC-005: handles hash collision/recreated accounts)
  syncUser: async (userId, emailHash) => {
    try {
      const existingUser = await db.query(
        `
        SELECT id
        FROM users
        WHERE email_hash = $1
        `,
        [emailHash]
      );

      if (
        existingUser.rows.length > 0 &&
        existingUser.rows[0].id !== userId
      ) {
        console.warn(
          `⚠️ Email hash collision or recreated account for UID ${userId}. Nullifying old record hash.`
        );
        await db.query(
          `UPDATE users SET email_hash = NULL WHERE id = $1`,
          [existingUser.rows[0].id]
        );
      }

      const query = `
        INSERT INTO users (
          id,
          email_hash,
          last_login
        )
        VALUES ($1, $2, now())
        ON CONFLICT (id)
        DO UPDATE SET
          last_login = now(),
          email_hash = EXCLUDED.email_hash
      `;

      await db.query(query, [userId, emailHash]);
    } catch (err) {
      console.error("❌ Error syncing user to DB:", err);
      throw err;
    }
  },

  // Check whether a user is banned
  isUserBanned: async (userId) => {
    try {
      const query = `
        SELECT is_banned
        FROM users
        WHERE id = $1
      `;

      const res = await db.query(query, [userId]);
      return res.rows.length > 0 && res.rows[0].is_banned;
    } catch (err) {
      console.error("❌ Error checking ban status:", err);
      return false;
    }
  },

  // Check cooldown remaining for automated NSFW moderation (30 seconds testing period)
  getCooldownRemaining: async (userId) => {
    try {
      const query = `
        SELECT EXTRACT(EPOCH FROM (timestamp + INTERVAL '30 seconds' - NOW())) AS remaining
        FROM user_violations
        WHERE uid = $1
        ORDER BY timestamp DESC
        LIMIT 1
      `;
      const res = await db.query(query, [userId]);
      if (res.rows.length > 0) {
        const rem = Math.ceil(parseFloat(res.rows[0].remaining || 0));
        return rem > 0 ? rem : 0;
      }
      return 0;
    } catch (err) {
      console.error("❌ Error checking cooldown remaining:", err);
      return 0;
    }
  },

  // Record an automated NSFW violation
  recordViolation: async (userId, violationType = "nsfw") => {
    try {
      const query = `
        INSERT INTO user_violations (uid, violation_type, timestamp)
        VALUES ($1, $2, NOW())
      `;
      await db.query(query, [userId, violationType]);
      return true;
    } catch (err) {
      console.error("❌ Error recording violation:", err);
      return false;
    }
  },

  // Record a manual user report
  recordReport: async (reporterUid, reportedUid, reason = "user_reported") => {
    try {
      const query = `
        INSERT INTO reports (reporter_id, reported_id, reason, status, created_at)
        VALUES ($1, $2, $3, 'pending', NOW())
      `;
      await db.query(query, [reporterUid, reportedUid, reason]);
      return true;
    } catch (err) {
      console.error("❌ Error recording user report:", err);
      return false;
    }
  },

  // Permanently block a user
  blockUser: async (blockerId, blockedId) => {
    try {
      const query = `
        INSERT INTO user_blocks (blocker_id, blocked_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `;

      await db.query(query, [blockerId, blockedId]);
      return true;
    } catch (err) {
      console.error("❌ Error blocking user:", err);
      return false;
    }
  },

  // Check whether either user has blocked the other
  hasBlocked: async (user1Id, user2Id) => {
    try {
      const query = `
        SELECT 1
        FROM user_blocks
        WHERE
          (blocker_id = $1 AND blocked_id = $2)
          OR
          (blocker_id = $2 AND blocked_id = $1)
      `;

      const res = await db.query(query, [user1Id, user2Id]);
      return res.rows.length > 0;
    } catch (err) {
      console.error("❌ Error checking block status:", err);
      return false;
    }
  },
};

module.exports = dbService;