function registerMatchSocket(socket, queue, dbService, roomService) {
  // Guards against a client firing find_match repeatedly while the async
  // eligibility checks below are still in flight.
  let searchInFlight = false;

  socket.on("find_match", async () => {
    const userId = socket.user?.uid;

    if (!userId) {
      console.error("❌ No authenticated user on socket");
      return;
    }

    if (searchInFlight || queue.nodesMap.has(socket.id)) {
      return;
    }

    searchInFlight = true;

    try {
      // 1. Check permanent ban status
      const isBanned = await dbService.isUserBanned(userId);

      if (isBanned) {
        console.log(`🛑 Banned user ${userId} attempted to connect.`);
        socket.emit("banned_alert", {
          message: "Your account has been suspended for policy violations.",
        });
        return;
      }

      // 2. Check server-enforced automated NSFW cooldown
      const cooldownRemaining = await dbService.getCooldownRemaining(userId);
      if (cooldownRemaining > 0) {
        socket.emit("cooldown_active", { remaining: cooldownRemaining });
        return;
      }

      // The socket may have dropped while we were awaiting the DB. Queueing
      // it now would leave a ghost entry that can be matched into a dead room.
      if (!socket.connected) {
        return;
      }

      // Searching again while still in a room (e.g. a missed "next" event)
      // must end that room first, otherwise the old partner is left hanging
      // and the room leaks.
      for (const roomId of roomService.getRoomsForSocket(socket.id)) {
        socket.to(roomId).emit("stranger_disconnected");
        socket.leave(roomId);
        roomService.deleteRoom(roomId);
      }

      queue.add(socket, userId);
    } catch (err) {
      console.error("❌ Error verifying user eligibility:", err);
      // Tell the client instead of leaving it on an endless spinner.
      socket.emit("match_error", {
        message: "Could not start searching. Please try again.",
      });
    } finally {
      searchInFlight = false;
    }
  });

  socket.on("stop_search", () => {
    queue.remove(socket.id);
  });
}

module.exports = registerMatchSocket;
