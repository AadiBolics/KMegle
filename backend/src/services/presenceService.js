// Hold a room across transport reconnects, never across unrelated page sessions.
const AWAY_GRACE_MS = Math.max(1000, parseInt(process.env.AWAY_GRACE_MS || '15000', 10) || 15000);
const away = new Map();

function sessionOf(socket) {
  const value = socket.handshake?.auth?.sessionId;
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value) ? value : null;
}
function keyOf(userId, sessionId) { return JSON.stringify([userId, sessionId]); }
function clearKey(key) {
  const entry = away.get(key);
  if (!entry) return;
  clearTimeout(entry.timer);
  away.delete(key);
}
function clearRoom(roomId) {
  for (const [key, entry] of away) if (entry.roomId === roomId) clearKey(key);
}
function teardownRoom(io, roomService, roomId, goneSocketId) {
  const room = roomService.getRoom(roomId);
  if (!room) return;
  clearRoom(roomId);
  const peer = roomService.getOtherUser(roomId, goneSocketId);
  if (peer) io.to(peer.socketId).emit('stranger_disconnected');
  roomService.deleteRoom(roomId);
}
function markAway({ io, roomService, roomId, userId, socketId, sessionId }) {
  // Old clients without session ownership cannot safely resume.
  if (!sessionId) return teardownRoom(io, roomService, roomId, socketId);
  const key = keyOf(userId, sessionId);
  clearKey(key);
  if (!roomService.isMember(roomId, socketId)) return;
  const peer = roomService.getOtherUser(roomId, socketId);
  if (peer) io.to(peer.socketId).emit('partner_connection_lost', {
    message: "Stranger's connection dropped. Waiting for them to reconnect...",
  });
  const entry = { roomId, socketId, timer: null };
  entry.timer = setTimeout(() => {
    if (away.get(key) !== entry) return;
    away.delete(key);
    teardownRoom(io, roomService, roomId, socketId);
  }, AWAY_GRACE_MS);
  away.set(key, entry);
}
function resume({ io, roomService, socket }) {
  const userId = socket.user?.uid;
  const sessionId = sessionOf(socket);
  if (!userId || !sessionId) return false;
  const key = keyOf(userId, sessionId);
  const entry = away.get(key);
  if (!entry) return false;
  clearKey(key);
  if (!roomService.updateSocketId(entry.roomId, userId, socket.id, entry.socketId)) {
    socket.emit('session_resume_result', { resumed: false });
    return true;
  }
  socket.join(entry.roomId);
  const peer = roomService.getOtherUser(entry.roomId, socket.id);
  if (peer) io.to(peer.socketId).emit('partner_reconnected');
  socket.emit('session_resume_result', { resumed: true, roomId: entry.roomId });
  return true;
}
function endAwayForUser({ io, roomService, userId, sessionId }) {
  if (!sessionId) return;
  const key = keyOf(userId, sessionId);
  const entry = away.get(key);
  if (!entry) return;
  clearKey(key);
  teardownRoom(io, roomService, entry.roomId, entry.socketId);
}
module.exports = { AWAY_GRACE_MS, markAway, resume, clearRoom, endAwayForUser, sessionOf };
