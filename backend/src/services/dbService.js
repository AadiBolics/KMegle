const db = require("../config/db");

const dbService = {
  // Sync user into database
  syncUser: async (userId, emailHash) => {
  try {
    // First check whether this email already belongs
    // to a different Firebase UID.
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
      throw new Error(
        "This email is already associated with another account"
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

    await db.query(query, [
      userId,
      emailHash,
    ]);
  } catch (err) {
    console.error(
      "❌ Error syncing user to DB:",
      err
    );

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

      // Preserve current behavior for Phase 1
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