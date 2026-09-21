const activeRooms = new Map();

const roomService = {
  createRoom(roomId, user1, user2) {
    activeRooms.set(roomId, {
      u1: {
        userId: user1.userId,
        socketId: user1.socketId,
      },

      u2: {
        userId: user2.userId,
        socketId: user2.socketId,
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

    return (
      room.u1.socketId === socketId ||
      room.u2.socketId === socketId
    );
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
      if (
        room.u1.socketId === socketId ||
        room.u2.socketId === socketId
      ) {
        rooms.push(roomId);
      }
    }

    return rooms;
  },

  deleteRoom(roomId) {
    activeRooms.delete(roomId);
  },

  getAllRooms() {
    return activeRooms;
  },
};

module.exports = roomService;