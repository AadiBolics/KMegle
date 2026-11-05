// Per-reporter cooldown tracker shared across all sockets/connections.
// Maps reporterId -> timestamp (ms) of their last accepted report.
// Keeps a single reporter from spamming report_peer_nsfw_violation/report_user
// to repeatedly disconnect+penalize whoever they're paired with.
const presenceService = require("../services/presenceService");

const lastReportAt = new Map();
const REPORT_COOLDOWN_MS = 10 * 1000;

function isReportRateLimited(reporterId) {
  const last = lastReportAt.get(reporterId);
  const now = Date.now();

  if (last && now - last < REPORT_COOLDOWN_MS) {
    return true;
  }

  lastReportAt.set(reporterId, now);
  return false;
}

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

      presenceService.clearRoom(roomId, roomService);
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

    // Only an active room makes this a live-call report. Out-of-room reports
    // (e.g. from a stale client) carry no peer exposure: recording a strike,
    // forcing a cooldown or disconnecting the socket here would punish the
    // user outside any call.
    if (!roomId || !roomService.isMember(roomId, socket.id)) return;

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
      presenceService.clearRoom(roomId, roomService);
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

    if (isReportRateLimited(reporterId)) {
      console.warn(`⚠️ Reporter ${reporterId} is rate limited (peer NSFW report cooldown)`);
      socket.emit("report_failed", { message: "Please wait before submitting another report." });
      return;
    }

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
    presenceService.clearRoom(roomId, roomService);
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

    if (isReportRateLimited(reporterId)) {
      console.warn(`⚠️ Reporter ${reporterId} is rate limited (user report cooldown)`);
      socket.emit("report_failed", { message: "Please wait before submitting another report." });
      return;
    }

    console.log(`🚩 User report filed by ${reporterId} against ${peer.userId}: ${reason}`);
    const safeReason =
      typeof reason === "string" && reason.trim()
        ? reason.trim().slice(0, 500)
        : "user_reported";
    await dbService.recordReport(reporterId, peer.userId, safeReason);

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
    presenceService.clearRoom(roomId, roomService);
    roomService.deleteRoom(roomId);
  });

  // Normal room leave
  socket.on("leave_room", ({ roomId } = {}) => {
    if (!roomId) return;
    if (!roomService.isMember(roomId, socket.id)) return;

    presenceService.clearRoom(roomId, roomService);
    socket.to(roomId).emit("stranger_disconnected");
    socket.leave(roomId);
    roomService.deleteRoom(roomId);
  });

  // Disconnect handler. A dropped transport is often a brief network blip,
  // so rooms are HELD for a grace period (see presenceService) instead of
  // being destroyed instantly; the partner is told to wait, and the room is
  // only torn down if the user does not reconnect in time.
  socket.on("disconnect", () => {
    console.log(`🔴 Disconnected: ${socket.id}`);
    queue.remove(socket.id);

    const userId = socket.user?.uid;
    const rooms = roomService.getRoomsForSocket(socket.id);
    for (const roomId of rooms) {
      if (!userId) {
        // Cannot resume an anonymous socket: preserve the old immediate
        // teardown behavior for unauthenticated connections.
        const room = roomService.getRoom(roomId);
        if (!room) continue;
        const otherUser = roomService.getOtherUser(roomId, socket.id);
        if (otherUser) {
          io.to(otherUser.socketId).emit("stranger_disconnected");
        }
        roomService.deleteRoom(roomId);
        continue;
      }
      socket.leave(roomId);
      presenceService.markAway({
        io,
        roomService,
        roomId,
        userId,
        socketId: socket.id,
        sessionId: presenceService.sessionOf(socket),
      });
    }
  });
}

module.exports = registerRoomSocket;
