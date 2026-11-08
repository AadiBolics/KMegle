const crypto = require("crypto");
const dbService = require("../services/dbService");

const EMAIL_HASH_SECRET = process.env.EMAIL_HASH_SECRET;

if (!EMAIL_HASH_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "🚨 CRITICAL ERROR: EMAIL_HASH_SECRET is missing! It is required in production to prevent email hashes from being brute-forced/rainbow-tabled.",
    );
  }
  console.warn(
    "âš ï¸ EMAIL_HASH_SECRET is not set. Using an insecure default for local/dev only — set this in production.",
  );
}

function hashEmail(email) {
  return crypto
    .createHmac("sha256", EMAIL_HASH_SECRET || "dev-only-insecure-pepper")
    .update(email.trim().toLowerCase())
    .digest("hex");
}

async function syncUser(socket, next) {
  try {
    if (!socket.user?.uid || !socket.user?.email) {
      return next(new Error("Authenticated user information missing"));
    }

    const emailHash = hashEmail(socket.user.email);

    await dbService.syncUser(socket.user.uid, emailHash);

    next();
  } catch (error) {
    console.error("âŒ Failed to sync user:", error.message);

    next(new Error("Unable to initialize user account"));
  }
}

module.exports = syncUser;
