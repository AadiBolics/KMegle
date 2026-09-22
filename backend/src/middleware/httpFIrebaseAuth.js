const { firebaseAuth } = require("../config/firebaseAdmin");

const ALLOWED_DOMAINS = [
  "@iiitkottayam.ac.in",
  "@gmail.com",
];

async function httpFirebaseAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const token = authHeader.substring(7);

    const decodedToken = await firebaseAuth.verifyIdToken(token);

    const uid = decodedToken.uid;
    const email = decodedToken.email?.trim().toLowerCase();

    if (!uid) {
      return res.status(401).json({
        error: "Invalid Firebase user",
      });
    }

    if (!decodedToken.email_verified) {
      return res.status(403).json({
        error: "Email must be verified",
      });
    }

    if (
      !email ||
      !ALLOWED_DOMAINS.some((domain) =>
        email.endsWith(domain)
      )
    ) {
      return res.status(403).json({
        error: "Only IIIT Kottayam accounts are allowed",
      });
    }

    req.user = {
      uid,
      email,
      name: decodedToken.name || null,
      picture: decodedToken.picture || null,
      emailVerified: decodedToken.email_verified,
    };

    next();
  } catch (error) {
    console.error(
      "❌ HTTP Firebase authentication failed:",
      error.message
    );

    return res.status(401).json({
      error: "Invalid or expired authentication token",
    });
  }
}

module.exports = httpFirebaseAuth;