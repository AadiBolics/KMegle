function registerRoomSocket(
  socket,
  queue,
  roomService,
  dbService,
  io
) {
  // Manual block
  socket.on("block_user", async ({ roomId }) => {
    if (!roomId) return;

    const room = roomService.getRoom(roomId);
    if (!room) return;

    if (!roomService.isMember(roomId, socket.id)) {
      console.warn(`⚠️ Unauthorized block attempt by ${socket.id}`);
      return;
    }

    const blockerId = socket.user?.uid;
    const blockedUser = roomService.getOtherUser(roomId, socket.id);
    if (!blockerId || !blockedUser) return;

    try {
      const success = await dbService.blockUser(blockerId, blockedUser.userId);
      if (!success) {
        socket.emit("block_failed", { message: "Unable to block this user." });
        return;
      }

      console.log(`🛑 User ${blockerId} blocked ${blockedUser.userId}`);
      socket.emit("user_blocked", { message: "User blocked successfully." });

      io.to(blockedUser.socketId).emit("stranger_disconnected");

      socket.leave(roomId);
      const otherSocket = io.sockets.sockets.get(blockedUser.socketId);
      if (otherSocket) {
        otherSocket.leave(roomId);
      }

      roomService.deleteRoom(roomId);
    } catch (err) {
      console.error("❌ Error blocking user:", err);
      socket.emit("block_failed", { message: "Unable to block this user." });
    }
  });

  // Client reporting automated critical NSFW violation on own local camera
  socket.on("report_nsfw_violation", async ({ roomId } = {}) => {
    const userId = socket.user?.uid;
    if (!userId) return;

    console.warn(`🚨 Client self-reported critical NSFW violation: ${userId}`);
    await dbService.recordViolation(userId, "local_nsfw_strike");

    socket.emit("cooldown_active", { remaining: 30 });

    if (roomId && roomService.isMember(roomId, socket.id)) {
      const peer = roomService.getOtherUser(roomId, socket.id);
      if (peer) {
        io.to(peer.socketId).emit("stranger_disconnected", {
          reason: "Partner was disconnected for content violations",
        });
      }
      socket.leave(roomId);
      roomService.deleteRoom(roomId);
    }

    queue.remove(socket.id);
    socket.disconnect(true);
  });

  // Client reporting automated critical NSFW violation on peer's camera feed
  socket.on("report_peer_nsfw_violation", async ({ roomId } = {}) => {
    const reporterId = socket.user?.uid;
    if (!reporterId || !roomId) return;

    if (!roomService.isMember(roomId, socket.id)) {
      console.warn(`⚠️ Socket ${socket.id} attempted peer NSFW report on unjoined room ${roomId}`);
      return;
    }

    const peer = roomService.getOtherUser(roomId, socket.id);
    if (!peer) return;

    console.warn(`🚨 Peer content violation reported against: ${peer.userId} by ${reporterId}`);
    await dbService.recordViolation(peer.userId, "peer_nsfw_detected");

    const peerSocket = io.sockets.sockets.get(peer.socketId);
    if (peerSocket) {
      peerSocket.emit("cooldown_active", { remaining: 30 });
      peerSocket.disconnect(true);
    }

    socket.emit("stranger_disconnected", {
      reason: "Partner was disconnected for content violations",
    });

    socket.leave(roomId);
    roomService.deleteRoom(roomId);
  });

  // Manual user report with reason
  socket.on("report_user", async ({ roomId, reason } = {}) => {
    const reporterId = socket.user?.uid;
    if (!reporterId || !roomId) return;

    if (!roomService.isMember(roomId, socket.id)) {
      console.warn(`⚠️ Socket ${socket.id} attempted report on unjoined room ${roomId}`);
      return;
    }

    const peer = roomService.getOtherUser(roomId, socket.id);
    if (!peer) return;

    console.log(`🚩 User report filed by ${reporterId} against ${peer.userId}: ${reason}`);
    await dbService.recordReport(reporterId, peer.userId, reason || "user_reported");

    // Enforce 30-second cooldown on the reported peer
    await dbService.recordViolation(peer.userId, "manual_user_report");

    const peerSocket = io.sockets.sockets.get(peer.socketId);
    if (peerSocket) {
      peerSocket.emit("cooldown_active", { remaining: 30 });
      io.to(peer.socketId).emit("stranger_disconnected");
      peerSocket.leave(roomId);
    }

    socket.emit("user_reported", {
      message: "Report received. The user has been disconnected.",
    });

    socket.leave(roomId);
    roomService.deleteRoom(roomId);
  });

  // Normal room leave
  socket.on("leave_room", ({ roomId }) => {
    if (!roomId) return;
    if (!roomService.isMember(roomId, socket.id)) return;

    socket.to(roomId).emit("stranger_disconnected");
    socket.leave(roomId);
    roomService.deleteRoom(roomId);
  });

  // Disconnect handler
  socket.on("disconnect", () => {
    console.log(`🔴 Disconnected: ${socket.id}`);
    queue.remove(socket.id);

    const rooms = roomService.getRoomsForSocket(socket.id);
    for (const roomId of rooms) {
      const room = roomService.getRoom(roomId);
      if (!room) continue;

      const otherUser = roomService.getOtherUser(roomId, socket.id);
      if (otherUser) {
        io.to(otherUser.socketId).emit("stranger_disconnected");
      }

      roomService.deleteRoom(roomId);
    }
  });
}

module.exports = registerRoomSocket;