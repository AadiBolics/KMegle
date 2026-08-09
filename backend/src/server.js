require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const db = require("./config/db");
const dbService = require("./services/dbService");

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Active Rooms map to track who is talking to whom for blocking purposes
const activeRooms = new Map(); 

class Node {
  constructor(socket, userId) {
    this.socket = socket;
    this.userId = userId;
    this.prev = null;
    this.next = null;
  }
}

class MatchmakerQueue {
  constructor() {
    this.head = null;
    this.tail = null;
    this.size = 0;
    this.nodesMap = new Map(); 
    this.isMatching = false;
  }

  add(socket, userId) {
    if (this.nodesMap.has(socket.id)) return; 

    const newNode = new Node(socket, userId);
    this.nodesMap.set(socket.id, newNode);
    
    if (!this.head) {
      this.head = this.tail = newNode;
    } else {
      this.tail.next = newNode;
      newNode.prev = this.tail;
      this.tail = newNode;
    }
    this.size++;
    
    this.tryMatch();
  }

  remove(socketId) {
    const node = this.nodesMap.get(socketId);
    if (!node) return;

    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;

    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;

    this.nodesMap.delete(socketId);
    this.size--;
  }

  async tryMatch() {
    if (this.isMatching) return;
    this.isMatching = true;

    try {
      while (this.size >= 2) {
        const user1 = this.head;
        if (!user1) break;

        let user2 = user1.next;
        let foundMatch = false;

        // Loop through the queue until we find someone User 1 HASN'T blocked
        while (user2) {
          let hasBlocked = false;
          try {
            hasBlocked = await dbService.hasBlocked(user1.userId, user2.userId);
          } catch (e) {
            console.error("Error checking block status:", e);
          }
          
          if (!hasBlocked) {
            foundMatch = true;
            break; // Match found!
          }
          
          console.log(`🚫 Skipped match due to block rules between ${user1.userId} and ${user2.userId}`);
          user2 = user2.next;
        }

        // If everyone in line is blocked or no user2, stop for now
        if (!foundMatch || !user2) break; 

        this.remove(user1.socket.id);
        this.remove(user2.socket.id);

        const roomId = `room_${user1.socket.id}_${user2.socket.id}`;
        
        activeRooms.set(roomId, {
          u1: user1.userId,
          u2: user2.userId
        });

        user1.socket.join(roomId);
        user2.socket.join(roomId);

        user1.socket.emit("match_found", { role: "initiator", roomId });
        user2.socket.emit("match_found", { role: "responder", roomId });

        console.log(`🎉 Match created: ${user1.userId} and ${user2.userId}`);
      }
    } finally {
      this.isMatching = false;
    }
  }
}

const queue = new MatchmakerQueue();

io.on("connection", (socket) => {
  console.log(`🟢 Connected: ${socket.id}`);

  socket.on("find_match", async ({ userId }) => {
    if (!userId) return;
    
    socket.userId = userId;
    
    console.log(`🔍 User ${userId} entered the queue...`);
    
    const isBanned = await dbService.isUserBanned(userId);
    if (isBanned) {
      console.log(`🛑 Banned user ${userId} tried to connect.`);
      socket.emit("banned_alert", { message: "Your account has been suspended for policy violations." });
      return; 
    }

    queue.add(socket, userId);
  });

  socket.on("stop_search", () => {
    queue.remove(socket.id);
  });

  socket.on("block_user", async ({ roomId }) => {
    const roomData = activeRooms.get(roomId);
    if (!roomData) return;

    const blockerId = socket.userId;
    const blockedId = roomData.u1 === blockerId ? roomData.u2 : roomData.u1;

    if (blockerId && blockedId) {
      const success = await dbService.blockUser(blockerId, blockedId);
      if (success) {
        console.log(`🛑 SUCCESS: User ${blockerId} permanently blocked ${blockedId}`);
      }
    }
  });

  socket.on("leave_room", ({ roomId }) => {
    socket.to(roomId).emit("stranger_disconnected");
    socket.leave(roomId);
    activeRooms.delete(roomId);
  });

  socket.on("webrtc_offer", ({ offer, roomId }) => socket.to(roomId).emit("webrtc_offer", { offer }));
  socket.on("webrtc_answer", ({ answer, roomId }) => socket.to(roomId).emit("webrtc_answer", { answer }));
  socket.on("webrtc_ice_candidate", ({ candidate, roomId }) => socket.to(roomId).emit("webrtc_ice_candidate", { candidate }));

  socket.on("disconnect", () => {
    console.log(`🔴 Disconnected: ${socket.id}`);
    queue.remove(socket.id);
    for (const [roomId, users] of activeRooms.entries()) {
      if (roomId.includes(socket.id)) {
        socket.to(roomId).emit("stranger_disconnected");
        activeRooms.delete(roomId);
        break;
      }
    }
  });
});

// OWN METERED.CA TURN CREDENTIALS ENDPOINT
app.get("/api/turn-credentials", (req, res) => {
  const username = process.env.TURN_USERNAME;
  const credential = process.env.TURN_PASSWORD;

  if (!username || !credential) {
    console.error("⚠️ TURN_USERNAME / TURN_PASSWORD not set in env");
    return res.status(500).json({ error: "TURN credentials not configured" });
  }

  res.json({
    iceServers: [
      { urls: "stun:stun.relay.metered.ca:80" },
      {
        urls: "turn:relay.metered.ca:80",
        username,
        credential,
      },
      {
        urls: "turn:relay.metered.ca:80?transport=tcp",
        username,
        credential,
      },
      {
        urls: "turn:relay.metered.ca:443",
        username,
        credential,
      },
      {
        urls: "turns:relay.metered.ca:443?transport=tcp",
        username,
        credential,
      },
    ],
  });
});

// Admin Protection Middleware
const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || "kmegle_admin_secret_key_2026";

const adminAuth = (req, res, next) => {
  const key = req.headers["x-admin-key"] || req.query.adminKey;
  if (!key || key !== ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized: Invalid or missing Admin Key" });
  }
  next();
};

// Fetch all users for the dashboard (Protected)
app.get("/api/admin/users", adminAuth, async (req, res) => {
  try {
    const result = await db.query("SELECT id, email_hash, is_banned, created_at FROM users ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

// Toggle a user's ban status (Protected)
app.post("/api/admin/ban", adminAuth, async (req, res) => {
  const { userId, banStatus } = req.body;
  try {
    await db.query("UPDATE users SET is_banned = $1 WHERE id = $2", [banStatus, userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update ban status" });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Signaling Server is running on port ${PORT}`));


