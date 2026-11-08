const presence = require("../services/presenceService");
module.exports = function registerMatchSocket(socket, queue, db, rooms, io) {
  let generation = 0,
    inFlight = false;
  socket.on("find_match", async (packet, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    if (!socket.user?.uid)
      return reply({ ok: false, message: "Sign in again." });
    if (inFlight || queue.nodesMap.has(socket.id)) return reply({ ok: true });
    const captured = ++generation;
    inFlight = true;
    try {
      if (!(await db.hasAccepted(socket.user.uid)))
        return reply({
          ok: false,
          message: "Review and accept the current terms before matching.",
        });
      if (await db.isUserBanned(socket.user.uid))
        return reply({ ok: false, message: "Your account is suspended." });
      const remaining = await db.getCooldownRemaining(socket.user.uid);
      if (captured !== generation || !socket.connected)
        return reply({ ok: false, message: "Search cancelled." });
      if (remaining > 0)
        return reply({
          ok: false,
          message: `Please wait ${remaining} seconds.`,
        });
      for (const roomId of rooms.getRoomsForSocket(socket.id))
        presence.endRoom({
          io,
          roomService: rooms,
          roomId,
          goneSocketId: socket.id,
        });
      presence.endAwayForUser({
        io,
        roomService: rooms,
        userId: socket.user.uid,
        sessionId: presence.sessionOf(socket),
      });
      queue.add(socket, socket.user.uid);
      reply({ ok: true });
    } catch {
      reply({
        ok: false,
        message: "Could not verify eligibility. Please try again.",
      });
    } finally {
      if (captured === generation) inFlight = false;
    }
  });
  const cancel = () => {
    generation++;
    inFlight = false;
    queue.remove(socket.id);
  };
  socket.on("stop_search", cancel);
  socket.on("disconnect", cancel);
};
