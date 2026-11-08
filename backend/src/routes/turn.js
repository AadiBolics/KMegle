const express = require("express");
const auth = require("../middleware/httpFIrebaseAuth");
const db = require("../services/dbService");
const router = express.Router();
let inflight = null;
// The provider endpoint does not expose expiry. Do not guess credential validity by caching for an hour.
async function credentials() {
  if (inflight) return inflight;
  const name = process.env.METERED_APP_NAME,
    key = process.env.TURN_API_KEY;
  if (!key || !name || !/^[a-zA-Z0-9-]+$/.test(name))
    throw new Error("Relay configuration unavailable");
  inflight = (async () => {
    const response = await fetch(
      `https://${name}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) throw new Error("Relay provider unavailable");
    const list = await response.json();
    if (!Array.isArray(list) || !list.length || list.length > 32)
      throw new Error("Invalid relay configuration");
    for (const entry of list) {
      const urls = typeof entry?.urls === "string" ? [entry.urls] : entry?.urls;
      if (
        !Array.isArray(urls) ||
        !urls.length ||
        !urls.every(
          (url) =>
            typeof url === "string" &&
            url.length < 2048 &&
            /^(stun|stuns|turn|turns):/.test(url),
        )
      )
        throw new Error("Invalid relay configuration");
      if (
        urls.some((url) => /^turns?:/.test(url)) &&
        (typeof entry.username !== "string" ||
          typeof entry.credential !== "string")
      )
        throw new Error("Invalid relay credentials");
    }
    if (
      !list.some((e) =>
        (Array.isArray(e.urls) ? e.urls : [e.urls]).some((url) =>
          /^turns?:/.test(url),
        ),
      )
    )
      throw new Error("No relay endpoint available");
    return list;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
router.get("/", auth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    if (await db.isUserBanned(req.user.uid))
      return res.status(403).json({ error: "Account suspended" });
    res.json({ iceServers: await credentials() });
  } catch {
    res
      .status(502)
      .json({ error: "Connection service unavailable. Please retry." });
  }
});
module.exports = router;
