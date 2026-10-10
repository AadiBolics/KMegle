const express = require("express");

const db = require("../config/db");
const adminAuth = require("../middleware/adminAuth");

const router = express.Router();

// Fetch all users
router.get(
  "/users",
  adminAuth,
  async (req, res) => {
    try {
      const result = await db.query(`
        SELECT
          id,
          email_hash,
          is_banned,
          created_at
        FROM users
        ORDER BY created_at DESC
      `);

      res.json(result.rows);
    } catch (err) {
      console.error(
        "❌ Error fetching admin users:",
        err
      );

      res.status(500).json({
        error: "Database error",
      });
    }
  }
);

// Fetch user reports
router.get(
  "/reports",
  adminAuth,
  async (req, res) => {
    try {
      const result = await db.query(`
        SELECT id, reporter_id, reported_id, reason, status, created_at
        FROM reports
        ORDER BY created_at DESC
        LIMIT 100
      `);

      res.json(result.rows);
    } catch (err) {
      console.error("❌ Error fetching reports:", err);
      res.status(500).json({ error: "Database error" });
    }
  }
);

// Toggle ban status
router.post(
  "/ban",
  adminAuth,
  async (req, res) => {
    const {
      userId,
      banStatus,
    } = req.body;

    try {
      await db.query(
        `
          UPDATE users
          SET is_banned = $1
          WHERE id = $2
        `,
        [banStatus, userId]
      );

      // KMEGLE-SEC-006: Immediately disconnect active socket sessions if banned
      if (banStatus) {
        const io = req.app.get("io");
        if (io) {
          for (const [socketId, s] of io.sockets.sockets.entries()) {
            if (s.user?.uid === userId) {
              s.emit("banned_alert", {
                message: "Your account has been suspended by an administrator.",
              });
              s.disconnect(true);
              console.log(
                `🔨 Disconnected live session for banned user ${userId} (${socketId})`
              );
            }
          }
        }
      }

      res.json({
        success: true,
      });
    } catch (err) {
      console.error(
        "❌ Error updating ban status:",
        err
      );

      res.status(500).json({
        error:
          "Failed to update ban status",
      });
    }
  }
);

module.exports = router;