const { firebaseAuth } = require("../config/firebaseAdmin");

// Single source of truth for which email domains are allowed to use the app.
// College-only by default. Staging can explicitly allow named test accounts;
// keep TEST_ACCOUNT_EMAILS empty in the production student service.
const ALLOWED_DOMAINS = ["@iiitkottayam.ac.in"];
const testEmails = new Set(
  (process.env.TEST_ACCOUNT_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

class AuthError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

// Verifies a Firebase ID token and returns the raw decoded token.
// Throws whatever firebase-admin throws (invalid/expired token, etc).
async function decodeFirebaseToken(idToken) {
  if (!idToken) {
    throw new AuthError("Authentication required");
  }

  return firebaseAuth.verifyIdToken(idToken);
}

// Verifies a Firebase ID token, checks email verification and the allowed
// domain list, and returns a normalized user object. Throws AuthError with
// a human-readable reason on any failure.
async function verifyFirebaseToken(idToken) {
  const decodedToken = await decodeFirebaseToken(idToken);

  const uid = decodedToken.uid;
  const email = decodedToken.email?.trim().toLowerCase();

  if (!uid) {
    throw new AuthError("Invalid Firebase user");
  }

  if (!decodedToken.email_verified) {
    throw new AuthError("Email must be verified");
  }

  if (
    !email ||
    (!ALLOWED_DOMAINS.some((domain) => email.endsWith(domain)) &&
      !testEmails.has(email))
  ) {
    throw new AuthError("Only IIIT Kottayam accounts are allowed");
  }

  return {
    uid,
    email,
    name: decodedToken.name || null,
    picture: decodedToken.picture || null,
    emailVerified: decodedToken.email_verified,
  };
}

module.exports = {
  ALLOWED_DOMAINS,
  AuthError,
  decodeFirebaseToken,
  verifyFirebaseToken,
};
