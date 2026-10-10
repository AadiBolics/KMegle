const { Server } = require("socket.io");

const authenticateSocket = require("../middleware/firebaseAuth");
const syncUser = require("../middleware/syncUser");
const banCheck = require("../middleware/banCheck");

function createSocketServer(server) {
  const allowedOrigins = [
    "http://localhost:3000",
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
          /^https?:\/\/localhost(:\d+)?$/.test(origin)
        ) {
          return callback(null, true);
        }

        console.warn(`⚠️ CORS blocked origin: ${origin}`);
        return callback(new Error(`CORS policy: origin ${origin} not allowed`));
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.engine.on("connection_error", (err) => {
    console.error("❌ ENGINE CONNECTION ERROR:", err.message);
  });

  // Step 1: Firebase authentication
  io.use((socket, next) => {
    authenticateSocket(socket, (error) => {
      if (error) {
        console.error("❌ Socket authentication failed:", error.message);
        return next(error);
      }
      next();
    });
  });

  // Step 2: Sync authenticated user into PostgreSQL
  io.use(syncUser);

  // Step 3: Check ban status
  io.use(banCheck);

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
        console.warn(`⚠️ Socket ${socket.id} exceeded event rate limit (>50 events/sec). Dropping event: ${event}`);
        return; // Drop excess packet without calling next()
      }
      next();
    });

    console.log(
      "🟢 Socket connected:",
      socket.id,
      socket.user?.email
    );
  });

  return io;
}

module.exports = createSocketServer;