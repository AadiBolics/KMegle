/**
 * Creates throwaway Firebase Auth accounts for load-testing the real
 * Socket.IO backend end-to-end (the backend's firebaseAuth middleware
 * requires a genuine, verified Firebase ID token — there's no way around
 * that without modifying production auth code, which we don't want to do
 * just to run a benchmark).
 *
 * Each test user:
 *   1. Is created via firebase-admin with a @gmail.com email (the domain
 *      allowlist in backend/src/middleware/authHelpers.js currently permits
 *      gmail.com alongside @iiitkottayam.ac.in, intentionally, for testing)
 *      and emailVerified: true, so it passes the backend's auth checks.
 *   2. Gets a custom token minted via firebase-admin.
 *   3. Exchanges that custom token for a real ID token via the Identity
 *      Toolkit REST API (the same exchange the Firebase client SDK does
 *      internally on signInWithCustomToken — we just do it with a plain
 *      fetch so we don't need a browser).
 *
 * cleanupUsers() deletes every account this script created, every time —
 * run cleanup even on failure (see benchmark.js's try/finally).
 */

const fs = require("fs");
const path = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

function parseEnvFile(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    vars[key] = value;
  }
  return vars;
}

function loadEnv() {
  const backendEnv = parseEnvFile(
    path.resolve(__dirname, "../../backend/.env")
  );
  const frontendEnv = parseEnvFile(
    path.resolve(__dirname, "../../frontend/.env.local")
  );

  for (const [key, value] of Object.entries({ ...backendEnv, ...frontendEnv })) {
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnv();

const REQUIRED = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
];

for (const key of REQUIRED) {
  if (!process.env[key]) {
    throw new Error(
      `Missing ${key} — this benchmark needs backend/.env and frontend/.env.local ` +
        `to both be present and populated locally.`
    );
  }
}

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const auth = getAuth();
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const RUN_TAG = Date.now();

async function exchangeCustomTokenForIdToken(customToken) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      `Token exchange failed: ${data.error?.message || response.statusText}`
    );
  }
  return data.idToken;
}

/**
 * Creates `count` throwaway users and returns [{ uid, idToken }, ...].
 * Runs in batches to stay well under Firebase Admin API rate limits.
 */
async function provisionUsers(count, { batchSize = 10 } = {}) {
  const uids = [];
  for (let i = 0; i < count; i++) {
    uids.push(`kmegle-loadtest-${RUN_TAG}-${i}`);
  }

  const results = [];

  for (let i = 0; i < uids.length; i += batchSize) {
    const batch = uids.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (uid) => {
        try {
          await auth.createUser({
            uid,
            email: `${uid}@gmail.com`,
            emailVerified: true,
          });
        } catch (err) {
          // Under heavy consecutive Admin API traffic, a request can
          // occasionally succeed server-side but time out client-side,
          // causing a retry that then sees "already exists" — the user
          // was still created correctly, so this isn't a real failure.
          if (err.code !== "auth/uid-already-exists") throw err;
        }

        const customToken = await auth.createCustomToken(uid);
        const idToken = await exchangeCustomTokenForIdToken(customToken);

        return { uid, idToken };
      })
    );

    results.push(...batchResults);
  }

  return results;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Deletes every test user created in this run. Call even on failure.
 * Retries individually, with backoff, on quota errors — at higher
 * concurrency (200+ users/run) Firebase's account-deletion quota is low
 * enough that a single batch pass can leave orphans otherwise.
 */
async function cleanupUsers(uids, { batchSize = 10, maxRetries = 5 } = {}) {
  let remaining = [...uids];

  for (let attempt = 0; attempt <= maxRetries && remaining.length; attempt++) {
    if (attempt > 0) {
      // Back off harder each retry — quota windows reset on the order of seconds.
      await sleep(2000 * attempt);
    }

    const stillFailing = [];

    for (let i = 0; i < remaining.length; i += batchSize) {
      const batch = remaining.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (uid) => {
          try {
            await auth.deleteUser(uid);
          } catch (err) {
            // A quota/timeout error can mean the delete actually succeeded
            // server-side but the response was slow/retried — if the user
            // is already gone, the goal ("this uid shouldn't exist") is
            // already met, so this isn't a real failure.
            if (err.code === "auth/user-not-found") return;
            stillFailing.push(uid);
          }
        })
      );
      // Small gap between batches so we don't immediately re-trip the quota.
      if (i + batchSize < remaining.length) await sleep(500);
    }

    remaining = stillFailing;
  }

  if (remaining.length) {
    console.warn(
      `⚠️  ${remaining.length} test user(s) could NOT be cleaned up after retries — ` +
        `delete these manually from the Firebase console:`,
      remaining
    );
  }
}

module.exports = { provisionUsers, cleanupUsers };
