const db = require("../config/db");
const dbService = {
  hasAccepted: async (uid) => {
    const result = await db.query(
      "SELECT version FROM user_acceptances WHERE uid=$1",
      [uid],
    );
    return result.rows[0]?.version === "2026-11-08";
  },
  // Sync user into database (KMEGLE-SEC-005: handles hash collision/recreated accounts)
  syncUser: async (userId, emailHash) => {
    try {
      const existingUser = await db.query(
        `
        SELECT id
        FROM users
        WHERE email_hash = $1
        `,
        [emailHash],
      );

      if (existingUser.rows.length > 0 && existingUser.rows[0].id !== userId) {
        await db.query(`UPDATE users SET email_hash = NULL WHERE id = $1`, [
          existingUser.rows[0].id,
        ]);
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
      console.error("âŒ Error syncing user to DB:", err.code);
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
      console.error("âŒ Error checking ban status:", err.code);
      // Fail closed: let the caller decide how to treat the error
      // (do NOT silently report "not banned" on a DB failure).
      throw err;
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
      console.error("âŒ Error checking cooldown remaining:", err.code);
      throw err;
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
      console.error("âŒ Error recording violation:", err.code);
      return false;
    }
  },

  // Record a manual user report
  recordReport: async (
    reporterUid,
    reportedUid,
    reason = "user_reported",
    requestId = null,
  ) => {
    try {
      const query = `
        INSERT INTO reports (reporter_id, reported_id, reason, request_id, status, created_at)
        VALUES ($1, $2, $3, $4, 'pending', NOW())
        ON CONFLICT (reporter_id,request_id) DO NOTHING
      `;
      await db.query(query, [reporterUid, reportedUid, reason, requestId]);
      return true;
    } catch (err) {
      console.error("âŒ Error recording user report:", err.code);
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
      console.error("âŒ Error blocking user:", err.code);
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
      console.error("âŒ Error checking block status:", err.code);
      // Fail closed: let the caller decide how to treat the error
      // (do NOT silently report "not blocked" on a DB failure).
      throw err;
    }
  },

  // Fetch the set of userIds that are blocked with respect to a given user
  // (either direction: the user blocked them, or they blocked the user).
  // Used to batch-check block relationships without one DB round-trip per pair.
  getBlockedIds: async (userId) => {
    const query = `
      SELECT
        CASE WHEN blocker_id = $1 THEN blocked_id ELSE blocker_id END AS other_id
      FROM user_blocks
      WHERE blocker_id = $1 OR blocked_id = $1
    `;

    const res = await db.query(query, [userId]);
    return new Set(res.rows.map((row) => row.other_id));
  },

  // Fetch ALL block relationships among a given set of userIds in ONE query,
  // instead of one getBlockedIds() round-trip per user. At real-world DB
  // latency (~30-40ms observed against Neon), N sequential round-trips for
  // a queue of a few hundred users is itself the bottleneck (MatchmakerQueue
  // processes the queue under a single lock, one call at a time) — this
  // collapses that to a single round-trip per matching pass regardless of
  // queue size. Returns a Map<userId, Set<blockedWithUserId>>.
  getBlockGraphForUsers: async (userIds) => {
    const graph = new Map();
    for (const id of userIds) graph.set(id, new Set());

    if (userIds.length === 0) return graph;

    const query = `
      SELECT blocker_id, blocked_id
      FROM user_blocks
      WHERE blocker_id = ANY($1::text[]) AND blocked_id = ANY($1::text[])
    `;

    const res = await db.query(query, [userIds]);

    for (const row of res.rows) {
      if (graph.has(row.blocker_id))
        graph.get(row.blocker_id).add(row.blocked_id);
      if (graph.has(row.blocked_id))
        graph.get(row.blocked_id).add(row.blocker_id);
    }

    return graph;
  },
};

module.exports = dbService;
