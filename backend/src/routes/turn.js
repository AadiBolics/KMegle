const express = require("express");
const httpFirebaseAuth = require("../middleware/httpFIrebaseAuth");

const router = express.Router();

// In-memory TURN credential cache. Metered credentials are time-boxed but
// don't need to be re-fetched on every single request; cache them for a
// while and only hit the Metered API again once they're close to expiring.
const TURN_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let cachedIceServers = null;
let cachedAt = 0;

router.get("/", httpFirebaseAuth, async (req, res) => {
  const apiKey = process.env.TURN_API_KEY;

  if (!apiKey) {
    console.error(
      "⚠️ TURN_API_KEY not set in env"
    );

    return res.status(500).json({
      error: "TURN credentials not configured",
    });
  }

  const now = Date.now();
  if (cachedIceServers && now - cachedAt < TURN_CACHE_TTL_MS) {
    console.log(
      "✅ Serving cached TURN credentials for user:",
      req.user?.email
    );
    return res.json({ iceServers: cachedIceServers });
  }

  try {
    const response = await fetch(
      `https://${process.env.METERED_APP_NAME}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`
    );

    if (!response.ok) {
      const body = await response.text();

      console.error(
        `⚠️ Metered API error ${response.status}:`,
        body
      );

      return res.status(502).json({
        error:
          "Failed to fetch TURN credentials from Metered",
      });
    }

    const iceServers =
      await response.json();

    cachedIceServers = iceServers;
    cachedAt = now;

    console.log(
      "✅ Fresh TURN credentials fetched from Metered for user:",
      req.user?.email
    );

    res.json({
      iceServers,
    });
  } catch (err) {
    console.error(
      "⚠️ Error contacting Metered TURN API:",
      err
    );

    res.status(502).json({
      error:
        "Could not reach TURN credential service",
    });
  }
});

module.exports = router;