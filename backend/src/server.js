require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const createSocketServer = require("./config/socket");
const routes = require("./routes");
const registerSockets = require("./sockets");
const roomService = require("./services/roomService");
const db = require("./config/db");

const app = express();

// --------------------------------------------------
// Security Headers & Middleware
// --------------------------------------------------

// KMEGLE-SEC-021: HTTP Security Headers via Helmet
app.use(helmet());

// KMEGLE-SEC-012: Strict CORS policy
const allowedOrigins = [
  "http://localhost:3000",
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
        /^https?:\/\/localhost(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

app.use(express.json());

// --------------------------------------------------
// Rate Limiting (KMEGLE-SEC-003)
// --------------------------------------------------

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Rate limit exceeded for this endpoint." },
});

app.use("/api/turn-credentials", strictLimiter);
app.use("/api/admin", strictLimiter);
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

// --------------------------------------------------
// Graceful Shutdown (KMEGLE-SEC-011, 022)
// --------------------------------------------------

const shutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Initiating graceful shutdown...`);

  // Inform active chat peers
  try {
    const activeRooms = roomService.getAllRooms();
    for (const [roomId] of activeRooms.entries()) {
      io.to(roomId).emit("stranger_disconnected", {
        reason: "Server is restarting or shutting down",
      });
    }
  } catch (err) {
    console.error("Error notifying active rooms:", err);
  }

  // Stop accepting new connections
  server.close(async () => {
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

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// --------------------------------------------------
// Server Listen
// --------------------------------------------------

const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Signaling Server is running on port ${PORT}`);
});