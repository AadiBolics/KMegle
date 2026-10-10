const { firebaseAuth } = require("../config/firebaseAdmin");

async function adminAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Unauthorized: Missing Bearer token",
      });
    }

    const token = authHeader.substring(7);
    const decodedToken = await firebaseAuth.verifyIdToken(token);

    const uid = decodedToken.uid;
    if (!uid) {
      return res.status(401).json({
        error: "Unauthorized: Invalid Firebase user",
      });
    }

    const rawAllowed = process.env.ALLOWED_ADMIN_UIDS || "";
    const allowedUids = rawAllowed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (allowedUids.length === 0 || !allowedUids.includes(uid)) {
      return res.status(403).json({
        error: "Forbidden: You are not authorized as an administrator",
      });
    }

    req.admin = {
      uid,
      email: decodedToken.email,
    };

    next();
  } catch (error) {
    console.error("❌ Admin authentication failed:", error.message);
    return res.status(401).json({
      error: "Unauthorized: Invalid or expired token",
    });
  }
}

module.exports = adminAuth;