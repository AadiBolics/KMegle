const roomService = require("../services/roomService");

const MAX_MESSAGE_LENGTH = 1000;
const MAX_MESSAGES = 5;
const MESSAGE_WINDOW_MS = 3000;

function registerChatSocket(socket) {
  let recentMessages = [];

  socket.on("chat_message", (payload) => {
    const { message, roomId } = payload || {};

    // KMEGLE-SEC-004 & 024: Validate input and enforce room membership
    if (typeof message !== "string" || !message.trim() || typeof roomId !== "string") {
      return;
    }

    // Per-socket flood control: at most MAX_MESSAGES per MESSAGE_WINDOW_MS.
    const now = Date.now();
    recentMessages = recentMessages.filter((t) => now - t < MESSAGE_WINDOW_MS);
    if (recentMessages.length >= MAX_MESSAGES) {
      socket.emit("chat_rate_limited", { message: "You're sending messages too fast." });
      return;
    }
    recentMessages.push(now);

    if (message.length > MAX_MESSAGE_LENGTH) {
      console.warn(`⚠️ Socket ${socket.id} attempted to send oversized message (${message.length} chars)`);
      return;
    }

    if (!roomService.isMember(roomId, socket.id)) {
      console.warn(`⚠️ Socket ${socket.id} attempted to send message to unjoined room ${roomId}`);
      return;
    }

    // Sender UID is cryptographically authenticated via Firebase
    const senderId = socket.user?.uid || socket.userId;

    socket.to(roomId).emit("chat_message", {
      message,
      senderId,
    });
  });
}

module.exports = registerChatSocket;