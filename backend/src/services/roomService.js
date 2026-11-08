const activeRooms = new Map();
const recentRooms = new Map();

const roomService = {
  createRoom(roomId, user1, user2) {
    activeRooms.set(roomId, {
      u1: {
        userId: user1.userId,
        socketId: user1.socket.id,
        pageSessionId: user1.socket.handshake?.auth?.sessionId,
      },
      u2: {
        userId: user2.userId,
        socketId: user2.socket.id,
        pageSessionId: user2.socket.handshake?.auth?.sessionId,
      },
    });
  },

  getRoom(roomId) {
    return activeRooms.get(roomId) || null;
  },

  hasRoom(roomId) {
    return activeRooms.has(roomId);
  },

  isMember(roomId, socketId) {
    const room = activeRooms.get(roomId);

    if (!room) {
      return false;
    }

    return room.u1.socketId === socketId || room.u2.socketId === socketId;
  },

  getOtherUser(roomId, socketId) {
    const room = activeRooms.get(roomId);

    if (!room) {
      return null;
    }

    if (room.u1.socketId === socketId) {
      return room.u2;
    }

    if (room.u2.socketId === socketId) {
      return room.u1;
    }

    return null;
  },

  getRoomsForSocket(socketId) {
    const rooms = [];

    for (const [roomId, room] of activeRooms.entries()) {
      if (room.u1.socketId === socketId || room.u2.socketId === socketId) {
        rooms.push(roomId);
      }
    }

    return rooms;
  },

  // Re-attach a room member who reconnected with a new socket id.
  updateSocketId(roomId, userId, newSocketId, oldSocketId) {
    const room = activeRooms.get(roomId);
    if (!room) return false;
    if (
      room.u1.userId === userId &&
      (!oldSocketId || room.u1.socketId === oldSocketId)
    ) {
      room.u1.socketId = newSocketId;
      return true;
    }
    if (
      room.u2.userId === userId &&
      (!oldSocketId || room.u2.socketId === oldSocketId)
    ) {
      room.u2.socketId = newSocketId;
      return true;
    }
    return false;
  },

  deleteRoom(roomId) {
    const room = activeRooms.get(roomId);
    if (room)
      recentRooms.set(roomId, {
        room: { ...room, u1: { ...room.u1 }, u2: { ...room.u2 } },
        expires: Date.now() + 300000,
      });
    for (const [id, entry] of recentRooms)
      if (entry.expires < Date.now()) recentRooms.delete(id);
    while (recentRooms.size > 2000)
      recentRooms.delete(recentRooms.keys().next().value);
    activeRooms.delete(roomId);
  },
  getRecentRoom(roomId) {
    const entry = recentRooms.get(roomId);
    if (!entry || entry.expires < Date.now()) {
      recentRooms.delete(roomId);
      return null;
    }
    return entry.room;
  },

  getAllRooms() {
    return activeRooms;
  },
};

module.exports = roomService;
