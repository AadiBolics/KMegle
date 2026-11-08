const express = require("express");
const db = require("../config/db");
const router = express.Router();
router.get("/", (req, res) => res.json({ status: "alive" }));
router.get("/ready", async (req, res) => {
  try {
    if (!req.app.get("schemaReady")) throw new Error("Schema unavailable");
    await db.query("SELECT 1");
    res.json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "not_ready" });
  }
});
module.exports = router;
