const db = require("../config/db");

const dbService = {
  // 1. Sync User: Saves the user to Neon the first time they connect
  syncUser: async (userId, emailHash) => {
    try {
      const query = `
        INSERT INTO users (id, email_hash) 
        VALUES ($1, $2) 
        ON CONFLICT (id) DO NOTHING
      `;
      await db.query(query, [userId, emailHash]);
    } catch (err) {
      console.error("❌ Error syncing user to DB:", err);
    }
  },

  // 2. Check Bans: Returns true if the admin has banned this student
  isUserBanned: async (userId) => {
    try {
      const query = `SELECT is_banned FROM users WHERE id = $1`;
      const res = await db.query(query, [userId]);
      return res.rows.length > 0 && res.rows[0].is_banned;
    } catch (err) {
      console.error("❌ Error checking ban status:", err);
      return false; // Fail open if DB glitches, so the app doesn't break
    }
  },

  // 3. Block a User: Saves a permanent block between two students
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

  // 4. Check Block Status: Checks if User A blocked User B, OR User B blocked User A
  hasBlocked: async (user1Id, user2Id) => {
    try {
      const query = `
        SELECT 1 FROM user_blocks 
        WHERE (blocker_id = $1 AND blocked_id = $2) 
           OR (blocker_id = $2 AND blocked_id = $1)
      `;
      const res = await db.query(query, [user1Id, user2Id]);
      return res.rows.length > 0; // Returns true if a block exists
    } catch (err) {
      console.error("❌ Error checking block status:", err);
      return false;
    }
  }
};

module.exports = dbService;