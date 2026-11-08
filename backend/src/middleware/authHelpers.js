const { firebaseAuth } = require("../config/firebaseAdmin");

// Single source of truth for which email domains are allowed to use the app.
// TEMPORARY testing access requested for all verified Gmail accounts.
// Set ALLOW_GMAIL_TEST_ACCOUNTS=false to restore college-only eligibility.
const ALLOWED_DOMAINS = [
  "@iiitkottayam.ac.in",
  ...(process.env.ALLOW_GMAIL_TEST_ACCOUNTS === "false" ? [] : ["@gmail.com"]),
];
const testEmails = new Set(
  (process.env.TEST_ACCOUNT_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

class AuthError extends Error {
  constructor(reason, code = "AUTH_REJECTED") {
    super(reason);
    this.reason = reason;
    this.code = code;
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
    throw new AuthError("Email must be verified", "EMAIL_NOT_VERIFIED");
  }

  if (
    !email ||
    (!ALLOWED_DOMAINS.some((domain) => email.endsWith(domain)) &&
      !testEmails.has(email))
  ) {
    throw new AuthError(
      ALLOWED_DOMAINS.includes("@gmail.com")
        ? "Use a verified IIIT Kottayam or Gmail account."
        : "Only IIIT Kottayam accounts are allowed",
      "ACCOUNT_NOT_ALLOWED",
    );
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
