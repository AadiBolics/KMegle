function registerChatSocket(socket) {
  socket.on(
    "chat_message",
    ({ message, roomId }) => {
      if (!message || !roomId) {
        return;
      }

      socket
        .to(roomId)
        .emit("chat_message", {
          message,
          senderId: socket.userId,
        });
    }
  );
}

module.exports = registerChatSocket;