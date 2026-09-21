const crypto = require("crypto");
const dbService = require("../services/dbService");

function hashEmail(email) {
  return crypto
    .createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
}

async function syncUser(socket, next) {
  try {
    if (!socket.user?.uid || !socket.user?.email) {
      return next(new Error("Authenticated user information missing"));
    }

    const emailHash = hashEmail(socket.user.email);

    await dbService.syncUser(
      socket.user.uid,
      emailHash
    );

    console.log(
      `🗄️ User synced: ${socket.user.email} (${socket.user.uid})`
    );

    next();
  } catch (error) {
    console.error(
      "❌ Failed to sync user:",
      error.message
    );

    next(new Error("Unable to initialize user account"));
  }
}

module.exports = syncUser;