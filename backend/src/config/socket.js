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
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, UptimeRobot)
        if (!origin) return callback(null, true);

        if (
          allowedOrigins.includes(origin) ||
          origin.endsWith(".vercel.app") ||
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
    console.error("❌ ENGINE CONNECTION ERROR");
    console.error("message:", err.message);
    console.error("code:", err.code);
    console.error("context:", err.context);
  });

  // Step 1: Firebase authentication
  io.use((socket, next) => {
    console.log(
      "🔐 Socket authentication attempt:",
      socket.id
    );

    authenticateSocket(socket, (error) => {
      if (error) {
        console.error(
          "❌ Socket authentication failed:",
          error.message
        );

        return next(error);
      }

      console.log(
        "✅ Socket authentication successful:",
        socket.user?.email
      );

      next();
    });
  });

  // Step 2: Sync authenticated user into PostgreSQL
  io.use(syncUser);
// Step 3: Check ban status
  io.use(banCheck);

  io.on("connection", (socket) => {
    console.log(
      "🟢 Socket connected:",
      socket.id,
      socket.user?.email
    );
  });

  return io;
}

module.exports = createSocketServer;