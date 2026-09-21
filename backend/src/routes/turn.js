const express = require("express");

const router = express.Router();

router.get("/", async (req, res) => {
  const apiKey = process.env.TURN_API_KEY;

  if (!apiKey) {
    console.error(
      "⚠️ TURN_API_KEY not set in env"
    );

    return res.status(500).json({
      error: "TURN credentials not configured",
    });
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

    console.log(
      "✅ Fresh TURN credentials fetched from Metered."
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