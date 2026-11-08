const express = require("express");

const db = require("../config/db");
const httpFirebaseAuth = require("../middleware/httpFIrebaseAuth");

const router = express.Router();

// Get blocked users
router.get("/", httpFirebaseAuth, async (req, res) => {
  try {
    const blockerId = req.user.uid;

    const result = await db.query(
      `
        SELECT
          block_ref,
          created_at
        FROM user_blocks
        WHERE blocker_id = $1
        ORDER BY created_at DESC, block_ref DESC
        LIMIT 20 OFFSET $2
      `,
      [
        blockerId,
        Math.max(0, Math.min(10000, parseInt(req.query.offset, 10) || 0)),
      ],
    );

    const blockedUsers = result.rows.map((row) => ({
      blockRef: row.block_ref,
      createdAt: row.created_at,
    }));

    res.json(blockedUsers);
  } catch (err) {
    console.error("❌ Error fetching blocked users:", err);

    res.status(500).json({
      error: "Failed to fetch blocked users",
    });
  }
});

// Unblock a user
router.delete("/:blockRef", httpFirebaseAuth, async (req, res) => {
  try {
    const blockerId = req.user.uid;
    const { blockRef } = req.params;

    if (typeof blockRef !== "string" || !/^[0-9a-f-]{36}$/i.test(blockRef)) {
      return res.status(400).json({
        error: "Block reference is required",
      });
    }

    const result = await db.query(
      `
        DELETE FROM user_blocks
        WHERE blocker_id = $1
          AND block_ref = $2
        RETURNING block_ref
      `,
      [blockerId, blockRef],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Blocked user not found",
      });
    }

    res.json({
      success: true,
      message: "User unblocked successfully",
    });
  } catch (err) {
    console.error("❌ Error unblocking user:", err);

    res.status(500).json({
      error: "Failed to unblock user",
    });
  }
});

module.exports = router;
