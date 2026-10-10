function registerMatchSocket(socket, queue, dbService) {
  socket.on("find_match", async () => {
    const userId = socket.user?.uid;

    if (!userId) {
      console.error("❌ No authenticated user on socket");
      return;
    }

    console.log(`🔍 User ${userId} requested matchmaking...`);

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

      // 2. Check server-enforced automated NSFW cooldown (Phase 3)
      const cooldownRemaining = await dbService.getCooldownRemaining(userId);
      if (cooldownRemaining > 0) {
        console.log(`⏳ User ${userId} is on NSFW cooldown (${cooldownRemaining}s remaining)`);
        socket.emit("cooldown_active", { remaining: cooldownRemaining });
        return;
      }
    } catch (err) {
      console.error("❌ Error verifying user eligibility:", err);
      return;
    }

    queue.add(socket, userId);
  });

  socket.on("stop_search", () => {
    queue.remove(socket.id);
  });
}

module.exports = registerMatchSocket;