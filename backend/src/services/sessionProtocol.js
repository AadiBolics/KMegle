function envelope(roomId, room) {
  return { roomId, sessionNonce: room.sessionNonce };
}
function validSession(rooms, socket, packet) {
  if (
    !packet ||
    typeof packet !== "object" ||
    typeof packet.roomId !== "string" ||
    packet.roomId.length > 128
  )
    return null;
  const room = rooms.getRoom(packet.roomId);
  return room &&
    typeof room.sessionNonce === "string" &&
    packet.sessionNonce === room.sessionNonce &&
    rooms.isMember(packet.roomId, socket.id)
    ? room
    : null;
}
function validSafetySession(rooms, socket, packet) {
  const current = validSession(rooms, socket, packet);
  if (current) return current;
  if (
    !packet ||
    typeof packet.roomId !== "string" ||
    packet.roomId.length > 128
  )
    return null;
  const room = rooms.getRecentRoom?.(packet.roomId),
    page = socket.handshake?.auth?.sessionId;
  return room &&
    page &&
    room.sessionNonce === packet.sessionNonce &&
    [room.u1, room.u2].some(
      (member) =>
        member.userId === socket.user?.uid && member.pageSessionId === page,
    )
    ? room
    : null;
}
module.exports = { envelope, validSession, validSafetySession };
