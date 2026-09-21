const { firebaseAuth } = require("../config/firebaseAdmin");

const ALLOWED_DOMAINS = ["@iiitkottayam.ac.in", "@gmail.com"];

async function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Authentication required"));
    }

    const decodedToken = await firebaseAuth.verifyIdToken(token);

    const uid = decodedToken.uid;
    const email = decodedToken.email?.trim().toLowerCase();

    if (!uid) {
      return next(new Error("Invalid Firebase user"));
    }

    if (!decodedToken.email_verified) {
      return next(new Error("IIIT email must be verified"));
    }

    if (
  !email ||
  !ALLOWED_DOMAINS.some((domain) =>
    email.endsWith(domain)
  )
)  {
      return next(
        new Error("Only IIIT Kottayam accounts are allowed")
      );
    }

    socket.user = {
      uid,
      email,
      name: decodedToken.name || null,
      picture: decodedToken.picture || null,
      emailVerified: decodedToken.email_verified,
    };

    console.log(
      `🔐 Authenticated: ${socket.user.email} (${socket.user.uid})`
    );

    next();
  } catch (error) {
    console.error("❌ Socket authentication failed:", error.message);

    next(new Error("Invalid or expired authentication token"));
  }
}

module.exports = authenticateSocket;