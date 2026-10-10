const roomService = require("../services/roomService");

function registerChatSocket(socket) {
  socket.on("chat_message", ({ message, roomId }) => {
    // KMEGLE-SEC-004 & 024: Validate input and enforce room membership
    if (!message || typeof message !== "string" || !roomId) {
      return;
    }

    if (message.length > 4096) {
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