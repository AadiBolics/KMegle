const {
  validSession,
  validSafetySession,
  envelope,
} = require("../services/sessionProtocol");
const presence = require("../services/presenceService");
const receipts = new Map(),
  attempts = new Map();
function prune() {
  const now = Date.now();
  for (const [key, value] of receipts)
    if (value.expires < now) receipts.delete(key);
  while (receipts.size > 5000) receipts.delete(receipts.keys().next().value);
  for (const [uid, value] of attempts)
    if (now - value.start > 60000) attempts.delete(uid);
}
module.exports = function registerRoomSocket(socket, queue, rooms, db, io) {
  for (const event of [
    "block_user",
    "report_user",
    "report_peer_nsfw_violation",
    "report_nsfw_violation",
  ]) {
    socket.on(event, async (packet, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      if (!packet || typeof packet !== "object")
        return reply({ ok: false, message: "Invalid request." });
      const uid = socket.user?.uid;
      if (
        !uid ||
        typeof packet.requestId !== "string" ||
        !/^[A-Za-z0-9_-]{16,128}$/.test(packet.requestId)
      )
        return reply({ ok: false, message: "Invalid request." });
      prune();
      const key = JSON.stringify([
        uid,
        presence.sessionOf(socket),
        event,
        packet.requestId,
      ]);
      let entry = receipts.get(key);
      if (entry) {
        if (
          entry.roomId !== packet.roomId ||
          entry.sessionNonce !== packet.sessionNonce
        )
          return reply({
            ok: false,
            message: "Request does not match its receipt.",
          });
        if (entry.pending || entry.result?.ok)
          return reply(await entry.promise);
      } else {
        // Self strikes still require current membership; peer allegations may reference a recent same-page call.
        const room =
          event === "report_nsfw_violation"
            ? validSession(rooms, socket, packet)
            : validSafetySession(rooms, socket, packet);
        const member =
          room && [room.u1, room.u2].find((member) => member.userId === uid);
        const peer = room && member && (member === room.u1 ? room.u2 : room.u1);
        if (!peer)
          return reply({
            ok: false,
            retryable: false,
            message: "This call is no longer available for a safety request.",
          });
        entry = {
          roomId: packet.roomId,
          sessionNonce: packet.sessionNonce,
          room,
          peer,
          reason:
            typeof packet.reason === "string" && packet.reason.trim()
              ? packet.reason.trim().slice(0, 500)
              : "client_content_flag",
          expires: Date.now() + 600000,
          pending: false,
          result: null,
        };
        receipts.set(key, entry);
        if (rooms.getRoom(packet.roomId) === room)
          presence.endRoom({
            io,
            roomService: rooms,
            roomId: packet.roomId,
            goneSocketId: member.socketId,
          });
      }
      const rate = attempts.get(uid) || { start: Date.now(), count: 0 };
      if (rate.count >= 10)
        return reply({
          ok: false,
          message: "Too many safety requests. Please wait a minute.",
        });
      rate.count++;
      attempts.set(uid, rate);
      const captured = entry;
      captured.pending = true;
      captured.promise = (async () => {
        try {
          let saved;
          if (event === "block_user")
            saved = await db.blockUser(uid, captured.peer.userId);
          else if (event === "report_nsfw_violation")
            saved = await db.recordViolation(uid, "local_nsfw_strike");
          else
            saved = await db.recordReport(
              uid,
              captured.peer.userId,
              captured.reason,
              packet.requestId,
            );
          if (!saved) throw new Error("Persistence failed");
          // A late write can never end a different call or remove a new queue entry.
          if (rooms.getRoom(captured.roomId) === captured.room) {
            const member = [captured.room.u1, captured.room.u2].find(
              (member) => member.userId === uid,
            );
            presence.endRoom({
              io,
              roomService: rooms,
              roomId: captured.roomId,
              goneSocketId: member.socketId,
            });
          }
          return {
            ok: true,
            requestId: packet.requestId,
            ...envelope(captured.roomId, captured.room),
          };
        } catch {
          return {
            ok: false,
            message: "Unable to save your request. Please retry.",
            requestId: packet.requestId,
          };
        }
      })().then((result) => {
        captured.pending = false;
        captured.result = result;
        return result;
      });
      reply(await captured.promise);
    });
  }
  socket.on("leave_room", (packet, ack) => {
    if (validSession(rooms, socket, packet))
      presence.endRoom({
        io,
        roomService: rooms,
        roomId: packet.roomId,
        goneSocketId: socket.id,
      });
    if (typeof ack === "function") ack({ ok: true });
  });
  socket.on("disconnect", () => {
    queue.remove(socket.id);
    for (const roomId of rooms.getRoomsForSocket(socket.id)) {
      socket.leave(roomId);
      presence.markAway({
        io,
        roomService: rooms,
        roomId,
        userId: socket.user?.uid,
        socketId: socket.id,
        sessionId: presence.sessionOf(socket),
      });
    }
  });
};
