function registerMatchSocket(socket, queue, dbService) {
  socket.on("find_match", async () => {
    const userId = socket.user?.uid;

    if (!userId) {
      console.error("❌ No authenticated user on socket");
      return;
    }


    console.log(
      `🔍 User ${userId} entered the queue...`
    );

    try {
      const isBanned =
        await dbService.isUserBanned(userId);

      if (isBanned) {
        console.log(
          `🛑 Banned user ${userId} tried to connect.`
        );

        socket.emit("banned_alert", {
          message:
            "Your account has been suspended for policy violations.",
        });

        return;
      }
    } catch (err) {
      console.error(
        "❌ Error checking ban status:",
        err
      );

      return;
    }

    queue.add(socket, userId);
  });

  socket.on("stop_search", () => {
    queue.remove(socket.id);
  });
}

module.exports = registerMatchSocket;