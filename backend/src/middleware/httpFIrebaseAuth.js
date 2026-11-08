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
      const status = ["EMAIL_NOT_VERIFIED", "ACCOUNT_NOT_ALLOWED"].includes(
        error.code,
      )
        ? 403
        : 401;

      return res.status(status).json({
        error: error.message,
        code: error.code,
      });
    }

    return res.status(401).json({
      error: "Invalid or expired authentication token",
    });
  }
}

module.exports = httpFirebaseAuth;
