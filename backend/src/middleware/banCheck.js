const dbService = require("../services/dbService");

async function banCheck(socket, next) {
  try {
    const userId = socket.user?.uid;

    if (!userId) {
      return next(
        new Error("Authenticated user information missing")
      );
    }

    const isBanned = await dbService.isUserBanned(userId);

    if (isBanned) {
      console.log(
        `🛑 Banned user attempted socket connection: ${userId}`
      );

      return next(
        new Error("Your account has been suspended")
      );
    }

    next();
  } catch (error) {
    console.error(
      "❌ Ban check failed:",
      error
    );

    // Fail closed.
    // If we cannot verify the user's status,
    // don't allow the socket connection.
    next(
      new Error("Unable to verify account status")
    );
  }
}

module.exports = banCheck;