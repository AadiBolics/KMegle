const express = require("express");
const db = require("../config/db");
const adminAuth = require("../middleware/adminAuth");
const rooms = require("../services/roomService");
const presence = require("../services/presenceService");
const router = express.Router();
router.use(adminAuth);
const offset = (req) =>
  Math.max(0, Math.min(100000, parseInt(req.query.offset, 10) || 0));
router.get("/users", async (req, res) => {
  try {
    const search =
      typeof req.query.search === "string"
        ? req.query.search.slice(0, 100)
        : "";
    const result = await db.query(
      "SELECT id,is_banned,created_at FROM users WHERE id ILIKE $1 ORDER BY created_at DESC,id LIMIT 25 OFFSET $2",
      [`%${search}%`, offset(req)],
    );
    res.json(result.rows);
  } catch {
    res.status(503).json({ error: "Unable to load accounts" });
  }
});
router.get("/reports", async (req, res) => {
  try {
    const status = ["pending", "reviewed", "dismissed"].includes(
      req.query.status,
    )
      ? req.query.status
      : "pending";
    const result = await db.query(
      "SELECT id,reporter_id,reported_id,reason,status,created_at FROM reports WHERE status=$1 ORDER BY created_at DESC,id LIMIT 25 OFFSET $2",
      [status, offset(req)],
    );
    res.json(result.rows);
  } catch {
    res.status(503).json({ error: "Unable to load reports" });
  }
});
router.post("/reports/:id", async (req, res) => {
  if (
    !/^[0-9a-f-]{36}$/i.test(req.params.id) ||
    !["pending", "reviewed", "dismissed"].includes(req.body?.status)
  )
    return res.status(400).json({ error: "Invalid report update" });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "UPDATE reports SET status=$1 WHERE id=$2 RETURNING id",
      [req.body.status, req.params.id],
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Report not found" });
    }
    await client.query(
      "INSERT INTO admin_actions(admin_uid,action,subject) VALUES($1,$2,$3)",
      [req.admin.uid, `report_${req.body.status}`, req.params.id],
    );
    await client.query("COMMIT");
    res.json({ success: true });
  } catch {
    await client.query("ROLLBACK");
    res.status(503).json({ error: "Update not saved" });
  } finally {
    client.release();
  }
});
router.post("/ban", async (req, res) => {
  const { userId, banStatus } = req.body || {};
  if (
    typeof userId !== "string" ||
    !userId.trim() ||
    userId.length > 128 ||
    typeof banStatus !== "boolean"
  )
    return res.status(400).json({ error: "Invalid account update" });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "UPDATE users SET is_banned=$1 WHERE id=$2 RETURNING id",
      [banStatus, userId],
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Account not found" });
    }
    await client.query(
      "INSERT INTO admin_actions(admin_uid,action,subject) VALUES($1,$2,$3)",
      [req.admin.uid, banStatus ? "suspend" : "restore", userId],
    );
    await client.query("COMMIT");
    if (banStatus) {
      const io = req.app.get("io");
      if (io) {
        for (const [roomId, room] of rooms.getAllRooms()) {
          if ([room.u1, room.u2].some((member) => member.userId === userId))
            presence.endRoom({ io, roomService: rooms, roomId });
        }
        for (const socket of io.sockets.sockets.values())
          if (socket.user?.uid === userId) {
            socket.emit("banned_alert", { message: "Account suspended" });
            socket.disconnect(true);
          }
      }
    }
    res.json({ success: true });
  } catch {
    await client.query("ROLLBACK");
    res.status(503).json({ error: "Account update not saved" });
  } finally {
    client.release();
  }
});
module.exports = router;
