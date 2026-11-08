require("dotenv").config();
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.TURN_API_KEY ||
    !/^[a-zA-Z0-9-]+$/.test(process.env.METERED_APP_NAME || ""))
)
  throw new Error("Production relay configuration is missing or invalid.");

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { verifyFirebaseToken } = require("./middleware/authHelpers");

const createSocketServer = require("./config/socket");
const routes = require("./routes");
const registerSockets = require("./sockets");
const roomService = require("./services/roomService");
const db = require("./config/db");

const app = express();

// Trust the first hop reverse proxy/load balancer so req.ip and
// express-rate-limit see the real client IP (from X-Forwarded-For)
// instead of the proxy's IP.
app.set(
  "trust proxy",
  process.env.TRUST_PROXY_HOPS ? Number(process.env.TRUST_PROXY_HOPS) : 1,
);

// --------------------------------------------------
// Security Headers & Middleware
// --------------------------------------------------

// KMEGLE-SEC-021: HTTP Security Headers via Helmet
app.use(helmet());

// KMEGLE-SEC-012: Strict CORS policy
const allowedOrigins = [
  "http://localhost:3000",
  // Canonical production frontend. Keep this exact origin, never a wildcard.
  "https://kmegle.aadinadhan.me",
  ...(process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(",").map((url) => url.trim())
    : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        (process.env.NODE_ENV !== "production" &&
          /^https?:\/\/localhost(:\d+)?$/.test(origin))
      ) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy: origin ${origin} not allowed`));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "16kb" }));

// --------------------------------------------------
// Rate Limiting (KMEGLE-SEC-003)
// --------------------------------------------------

// Only Firebase-verified identity can choose an account bucket. Never key on a
// raw Authorization header, supplied UID, or an unverified decoded token.
async function identifyApiUser(req, res, next) {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    try {
      req.user = await verifyFirebaseToken(header.substring(7));
    } catch (_) {
      // Route auth still returns the normal 401/403. Invalid tokens share the
      // IP bucket, so rotating garbage tokens cannot evade the anonymous cap.
    }
  }
  next();
}

function apiRateLimitKey(req) {
  if (req.user?.uid) return `user:${req.user.uid}`;
  return `ip:${ipKeyGenerator(req.ip)}`;
}

function makeLimiter(limit, message) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit,
    keyGenerator: apiRateLimitKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
  });
}

const generalLimiter = makeLimiter(
  100,
  "Too many requests, please try again later.",
);
const turnLimiter = makeLimiter(
  20,
  "Too many credential requests. Please wait a minute.",
);
const adminLimiter = makeLimiter(
  100,
  "Too many admin requests. Please wait a minute.",
);

// Resolve identity before BOTH limits so neither collapses a campus NAT into
// one bucket. Unauthenticated/invalid-token traffic remains IP limited.
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 10000,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use("/api", identifyApiUser);

app.use("/api/turn-credentials", turnLimiter);
app.use("/api/admin", adminLimiter);
app.use("/api", generalLimiter);

// --------------------------------------------------
// HTTP Server & Socket.IO
// --------------------------------------------------

const server = http.createServer(app);
const io = createSocketServer(server);

// Make io accessible to Express route handlers (for admin ban disconnects)
app.set("io", io);

registerSockets(io);

// --------------------------------------------------
// HTTP Routes
// --------------------------------------------------

app.use("/api", routes);

// Final error handler: JSON instead of Express's HTML stack trace page.
app.use((err, req, res, next) => {
  console.error("❌ Unhandled Express error:", err.message);
  if (res.headersSent) return next(err);
  res
    .status(err.message?.startsWith("CORS") ? 403 : 500)
    .json({ error: "Request failed" });
});

// --------------------------------------------------
// Graceful Shutdown (KMEGLE-SEC-011, 022)
// --------------------------------------------------

const shutdown = (signal) => {
  if (app.get("draining")) return;
  app.set("draining", true);
  app.set("schemaReady", false);
  console.log(`\n🛑 Received ${signal}. Initiating graceful shutdown...`);

  // Inform active chat peers
  try {
    const activeRooms = roomService.getAllRooms();
    for (const [roomId] of activeRooms.entries()) {
      require("./services/presenceService").endRoom({
        io,
        roomService,
        roomId,
      });
    }
  } catch (err) {
    console.error("Error notifying active rooms:", err);
  }

  // Stop accepting new connections
  io.close(async () => {
    console.log("🔒 HTTP & Socket server closed.");
    try {
      await db.end();
      console.log("🗄️ Neon PostgreSQL connection pool closed.");
    } catch (err) {
      console.error("Error closing DB pool:", err.message);
    }
    process.exit(0);
  });

  // Force exit after 10s timeout
  setTimeout(() => {
    console.error("⚠️ Graceful shutdown timed out. Force exiting.");
    process.exit(1);
  }, 10000);
};

// A rejected promise inside a socket handler must never take the whole
// signaling server (and every active call) down.
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled promise rejection:", reason);
});

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// --------------------------------------------------
// Server Listen
// --------------------------------------------------

const PORT = process.env.PORT || 5000;

require("./services/migrate")(db)
  .then(() => {
    app.set("schemaReady", true);
    server.listen(PORT, "0.0.0.0", () => console.log("Signaling server ready"));
  })
  .catch(async () => {
    console.error("Database migration failed; server will not start.");
    await db.end();
    process.exitCode = 1;
  });
