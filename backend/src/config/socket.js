const { Server } = require("socket.io");

const authenticateSocket = require("../middleware/firebaseAuth");
const syncUser = require("../middleware/syncUser");
const banCheck = require("../middleware/banCheck");

function createSocketServer(server) {
  const allowedOrigins = [
    "http://localhost:3000",
    // Canonical production frontend. Keep this exact origin, never a wildcard.
    "https://kmegle.aadinadhan.me",
    ...(process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(",").map((url) => url.trim())
      : []),
  ];

  const io = new Server(server, {
    maxHttpBufferSize: 65536, // KMEGLE-SEC-003: 64 KB limit to prevent memory exhaustion DoS
    cors: {
      origin: (origin, callback) => {
        // Allow mobile apps, curl, server-side health checks
        if (!origin) return callback(null, true);

        // KMEGLE-SEC-012: Strict whitelist without wildcards
        if (
          allowedOrigins.includes(origin) ||
          (process.env.NODE_ENV !== "production" &&
            /^https?:\/\/localhost(:\d+)?$/.test(origin))
        ) {
          return callback(null, true);
        }

        console.warn(`âš ï¸ CORS blocked origin: ${origin}`);
        return callback(new Error(`CORS policy: origin ${origin} not allowed`));
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.engine.on("connection_error", (err) => {
    console.error("âŒ ENGINE CONNECTION ERROR:", err.message);
  });

  // Step 1: Firebase authentication
  io.use((socket, next) => {
    if (
      socket.handshake.auth?.protocolVersion !== 2 ||
      !require("../services/presenceService").sessionOf(socket)
    ) {
      const error = new Error("Please reload to update the call protocol.");
      error.data = { retryable: false, code: "PROTOCOL_VERSION" };
      return next(error);
    }
    next();
  });
  io.use((socket, next) => {
    authenticateSocket(socket, (error) => {
      if (error) {
        error.data = { retryable: false, code: "AUTH_REJECTED" };
        console.error("âŒ Socket authentication failed:", error.message);
        return next(error);
      }
      next();
    });
  });

  // Step 2: Sync authenticated user into PostgreSQL
  io.use((socket, next) =>
    syncUser(socket, (error) => {
      if (error) error.data = { retryable: true, code: "SERVICE_UNAVAILABLE" };
      next(error);
    }),
  );

  // Step 3: Check ban status
  io.use((socket, next) =>
    banCheck(socket, (error) => {
      if (error)
        error.data = {
          retryable: error.message === "Unable to verify account status",
          code: "ELIGIBILITY_REJECTED",
        };
      next(error);
    }),
  );

  io.on("connection", (socket) => {
    // Sliding window per-socket rate limiter: max 50 events per second (KMEGLE-SEC-003)
    let eventCount = 0;
    let windowStart = Date.now();

    socket.use(([event, ...args], next) => {
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        eventCount = 1;
        return next();
      }
      eventCount++;
      if (eventCount > 50) {
        console.warn(
          `âš ï¸ Socket ${socket.id} exceeded event rate limit (>50 events/sec). Dropping event: ${event}`,
        );
        return; // Drop excess packet without calling next()
      }
      next();
    });

    console.log("🟢 Socket connected:", socket.id, "verified account");
  });

  return io;
}

module.exports = createSocketServer;
