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