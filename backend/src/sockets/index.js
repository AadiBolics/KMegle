const MatchmakerQueue = require("../matchmaker/MatchmakerQueue");
const dbService = require("../services/dbService");
const roomService = require("../services/roomService");
const presenceService = require("../services/presenceService");

const registerMatchSocket = require("./matchSocket");
const registerRoomSocket = require("./roomSocket");
const registerChatSocket = require("./chatSocket");
const registerWebRTCSocket = require("./webrtcSocket");

const queue = new MatchmakerQueue();

function registerSockets(io) {
  io.on("connection", (socket) => {
    console.log(
      `🟢 Connected: ${socket.id}`
    );

    registerMatchSocket(
      socket,
      queue,
      dbService,
      roomService,
      io
    );

    registerRoomSocket(
      socket,
      queue,
      roomService,
      dbService,
      io
    );

    registerChatSocket(socket);

    registerWebRTCSocket(
      socket,
      roomService
    );

    // If this user was in a room held after a brief disconnect, re-attach
    // them; otherwise say so explicitly so the client can fall back to a
    // fresh search without waiting.
    const hadAway = presenceService.resume({ io, roomService, socket });
    if (!hadAway) {
      socket.emit("session_resume_result", { resumed: false });
    }
  });
}

module.exports = registerSockets;
