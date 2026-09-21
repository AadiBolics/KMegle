function registerRoomSocket(
  socket,
  queue,
  roomService,
  dbService,
  io
) {
  socket.on("block_user", async ({ roomId }) => {
  if (!roomId) {
    return;
  }

  const room = roomService.getRoom(roomId);

  if (!room) {
    return;
  }

  // Make sure the requester is actually in this room
  if (!roomService.isMember(roomId, socket.id)) {
    console.warn(
      `⚠️ Unauthorized block attempt by ${socket.id}`
    );

    return;
  }

  const blockerId = socket.user?.uid;

  const blockedUser =
    roomService.getOtherUser(roomId, socket.id);

  if (!blockerId || !blockedUser) {
    return;
  }

  try {
    // Permanently save the block
    const success =
      await dbService.blockUser(
        blockerId,
        blockedUser.userId
      );

    if (!success) {
      socket.emit("block_failed", {
        message: "Unable to block this user.",
      });

      return;
    }

    console.log(
      `🛑 User ${blockerId} blocked ${blockedUser.userId}`
    );

    // Tell the blocker that the block succeeded
    socket.emit("user_blocked", {
      message: "User blocked successfully.",
    });

    // Tell the other user that the current chat ended
    io.to(blockedUser.socketId).emit(
      "stranger_disconnected"
    );

    // Remove both users from the room
    socket.leave(roomId);

    const otherSocket =
      io.sockets.sockets.get(blockedUser.socketId);

    if (otherSocket) {
      otherSocket.leave(roomId);
    }

    roomService.deleteRoom(roomId);

  } catch (err) {
    console.error(
      "❌ Error blocking user:",
      err
    );

    socket.emit("block_failed", {
      message: "Unable to block this user.",
    });
  }
});

  socket.on("leave_room", ({ roomId }) => {
    if (!roomId) {
      return;
    }

    if (!roomService.isMember(roomId, socket.id)) {
      return;
    }

    socket
      .to(roomId)
      .emit("stranger_disconnected");

    socket.leave(roomId);

    roomService.deleteRoom(roomId);
  });

  socket.on("disconnect", () => {
    console.log(
      `🔴 Disconnected: ${socket.id}`
    );

    queue.remove(socket.id);

    const rooms =
      roomService.getRoomsForSocket(socket.id);

    for (const roomId of rooms) {
      const room =
        roomService.getRoom(roomId);

      if (!room) {
        continue;
      }

      const otherUser =
        roomService.getOtherUser(
          roomId,
          socket.id
        );

      if (otherUser) {
        io.to(otherUser.socketId).emit(
          "stranger_disconnected"
        );
      }

      roomService.deleteRoom(roomId);
    }
  });
}

module.exports = registerRoomSocket;