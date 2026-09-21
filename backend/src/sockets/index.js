const MatchmakerQueue = require("../matchmaker/MatchmakerQueue");
const dbService = require("../services/dbService");
const roomService = require("../services/roomService");

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
      dbService
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
  });
}

module.exports = registerSockets;