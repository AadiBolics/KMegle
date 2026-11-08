const express = require("express");
const auth = require("../middleware/httpFIrebaseAuth");
const db = require("../config/db");
const router = express.Router();
const VERSION = "2026-11-08";
router.get("/", auth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const result = await db.query(
      "SELECT version FROM user_acceptances WHERE uid=$1",
      [req.user.uid],
    );
    res.json({
      version: VERSION,
      accepted: result.rows[0]?.version === VERSION,
    });
  } catch {
    res
      .status(503)
      .json({ error: "Unable to check acceptance. Please retry." });
  }
});
router.post("/", auth, async (req, res) => {
  if (
    req.body?.version !== VERSION ||
    req.body?.adult !== true ||
    req.body?.accepted !== true
  )
    return res
      .status(400)
      .json({ error: "Confirm eligibility and current terms." });
  try {
    await db.query(
      "INSERT INTO user_acceptances(uid,version) VALUES($1,$2) ON CONFLICT(uid) DO UPDATE SET version=EXCLUDED.version,accepted_at=now()",
      [req.user.uid, VERSION],
    );
    res.json({ accepted: true, version: VERSION });
  } catch {
    res.status(503).json({ error: "Unable to save acceptance. Please retry." });
  }
});
module.exports = router;
