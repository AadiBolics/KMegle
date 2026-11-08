const { verifyFirebaseToken, AuthError } = require("./authHelpers");

async function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth?.token;

    const user = await verifyFirebaseToken(token);

    socket.user = user;

    next();
  } catch (error) {
    console.error("âŒ Socket authentication failed:", error.message);

    if (error instanceof AuthError) {
      return next(error);
    }

    next(new Error("Invalid or expired authentication token"));
  }
}

module.exports = authenticateSocket;
