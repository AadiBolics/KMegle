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

// NEW: Active Rooms map to track who is talking to whom for blocking purposes
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
    if (this.size >= 2) {
      const user1 = this.head;
      let user2 = user1.next;
      let foundMatch = false;

      // Loop through the queue until we find someone User 1 HASN'T blocked
      while (user2) {
        const hasBlocked = await dbService.hasBlocked(user1.userId, user2.userId);
        
        if (!hasBlocked) {
          foundMatch = true;
          break; // Perfect match!
        }
        
        console.log(`🚫 Skipped match due to block rules between ${user1.userId} and ${user2.userId}`);
        user2 = user2.next; // Skip to the next person in line
      }

      // If everyone in line is blocked, just stop trying for now
      if (!foundMatch) return; 

      this.remove(user1.socket.id);
      this.remove(user2.socket.id);

      const roomId = `room_${user1.socket.id}_${user2.socket.id}`;
      
      // NEW: Store the identities of the people in this room so we can block them later!
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
  }
}

const queue = new MatchmakerQueue();

io.on("connection", (socket) => {
  console.log(`🟢 Connected: ${socket.id}`);

  socket.on("find_match", async ({ userId }) => {
    if (!userId) return;
    
    socket.userId = userId; // Bind their identity to the socket directly
    
    console.log(`🔍 User ${userId} entered the queue...`);
    
    // Safety Gate: Bounce them if they are banned
    const isBanned = await dbService.isUserBanned(userId);
    if (isBanned) {
      console.log(`🛑 Banned user ${userId} tried to connect.`);
      socket.emit("banned_alert", { message: "Your account has been banned." });
      return; 
    }

    queue.add(socket, userId);
  });

  socket.on("stop_search", () => {
    queue.remove(socket.id);
  });

  // --- NEW: THE BLOCK ENGINE ---
  socket.on("block_user", async ({ roomId }) => {
    const roomData = activeRooms.get(roomId);
    if (!roomData) return;

    const blockerId = socket.userId;
    // Figure out which ID belongs to the stranger
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
    activeRooms.delete(roomId); // Clean up memory to prevent leaks
  });

  // --- WEBRTC SIGNALING ---
  socket.on("webrtc_offer", ({ offer, roomId }) => socket.to(roomId).emit("webrtc_offer", { offer }));
  socket.on("webrtc_answer", ({ answer, roomId }) => socket.to(roomId).emit("webrtc_answer", { answer }));
  socket.on("webrtc_ice_candidate", ({ candidate, roomId }) => socket.to(roomId).emit("webrtc_ice_candidate", { candidate }));

  socket.on("disconnect", () => {
    console.log(`🔴 Disconnected: ${socket.id}`);
    queue.remove(socket.id);
    for (const [roomId, users] of activeRooms.entries()) {
      if (roomId.includes(socket.id)) {
        socket.to(roomId).emit("stranger_disconnected");
        activeRooms.delete(roomId); // Clean up the room
        break;
      }
    }
  });
});

app.get("/api/turn-credentials", (req, res) => {
  res.json({
    username: process.env.TURN_USERNAME,
    credential: process.env.TURN_PASSWORD
  });
});
// Fetch all users for the dashboard
app.get("/api/admin/users", async (req, res) => {
  try {
    const result = await db.query("SELECT id, email_hash, is_banned, created_at FROM users ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

// Toggle a user's ban status
app.post("/api/admin/ban", async (req, res) => {
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