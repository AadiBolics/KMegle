const { verifyFirebaseToken, AuthError } = require("./authHelpers");

async function httpFirebaseAuth(req, res, next) {
  try {
    if (req.user?.uid) return next(); // Set only by the verified API identity middleware.
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const token = authHeader.substring(7);

    const user = await verifyFirebaseToken(token);

    req.user = user;

    next();
  } catch (error) {
    console.error("❌ HTTP Firebase authentication failed:", error.message);

    if (error instanceof AuthError) {
      const status =
        error.message === "Email must be verified"
          ? 403
          : error.message === "Only IIIT Kottayam accounts are allowed"
            ? 403
            : 401;

      return res.status(status).json({
        error: error.message,
      });
    }

    return res.status(401).json({
      error: "Invalid or expired authentication token",
    });
  }
}

module.exports = httpFirebaseAuth;
