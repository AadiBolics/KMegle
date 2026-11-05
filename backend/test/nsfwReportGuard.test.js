// Verifies the out-of-room guard on report_nsfw_violation: no strike,
// no cooldown and no forced disconnect unless the reporter is in the room.
const { test } = require("node:test");
const assert = require("node:assert");

function makeSocket(userId = "user-1") {
  const socket = {
    id: "socket-1",
    user: { uid: userId },
    emitted: [],
    disconnected: null,
  };
  socket.on = (event, fn) => { socket.handlers = socket.handlers || {}; socket.handlers[event] = fn; };
  socket.emit = (...args) => { socket.emitted.push(args); };
  socket.leave = () => {};
  socket.disconnect = (...args) => { socket.disconnected = args; };
  return socket;
}

const roomService = {
  isMember: () => false,
  getOtherUser: () => null,
  deleteRoom: () => {},
};
const dbService = {
  recordViolation: async (...args) => { dbService.calls.push(args); return true; },
  calls: [],
};
const queue = { remove: () => {} };
const presenceStub = { clearRoom: () => {} };
const io = { to: () => ({ emit: () => {} }) };

test("out-of-room self-report is ignored entirely", async () => {
  const registerRoomSocket = require("../src/sockets/roomSocket");
  const socket = makeSocket();
  const handlers = {};
  socket.on = (e, fn) => { handlers[e] = fn; };
  registerRoomSocket(socket, queue, roomService, dbService, io);
  dbService.calls = [];

  await handlers["report_nsfw_violation"]({ roomId: null });
  assert.strictEqual(dbService.calls.length, 0, "no strike recorded");
  assert.strictEqual(socket.disconnected, null, "socket not disconnected");
  assert.strictEqual(socket.emitted.length, 0, "no cooldown emitted");

  await handlers["report_nsfw_violation"]({ roomId: "room-that-does-not-exist" });
  assert.strictEqual(dbService.calls.length, 0, "no strike for non-member room");
  assert.strictEqual(socket.disconnected, null, "still not disconnected");
});

test("in-room self-report still records a strike and disconnects", async () => {
  const registerRoomSocket = require("../src/sockets/roomSocket");
  const memberRoomService = {
    isMember: () => true,
    getOtherUser: () => null,
    deleteRoom: () => {},
  };
  const socket = makeSocket();
  const handlers = {};
  socket.on = (e, fn) => { handlers[e] = fn; };
  registerRoomSocket(socket, queue, memberRoomService, dbService, io);
  dbService.calls = [];

  await handlers["report_nsfw_violation"]({ roomId: "room-1" });
  assert.strictEqual(dbService.calls.length, 1, "strike recorded in-call");
  assert.deepStrictEqual(dbService.calls[0], ["user-1", "local_nsfw_strike"]);
  assert.ok(socket.emitted.some((a) => a[0] === "cooldown_active"), "cooldown emitted");
  assert.deepStrictEqual(socket.disconnected, [true], "socket disconnected in-call");
});

test("forged room id: real room, socket not a member -> ignored", async () => {
  const registerRoomSocket = require("../src/sockets/roomSocket");
  // Room exists and has occupants, but THIS socket is not in it.
  const forgedRoomService = {
    isMember: (roomId, socketId) => roomId === "real-room" && socketId !== "socket-1",
    getOtherUser: () => ({ socketId: "socket-2" }),
    deleteRoom: () => { throw new Error("must not tear down a room the reporter is not in"); },
  };
  const socket = makeSocket();
  const handlers = {};
  socket.on = (e, fn) => { handlers[e] = fn; };
  registerRoomSocket(socket, queue, forgedRoomService, dbService, io);
  dbService.calls = [];

  await handlers["report_nsfw_violation"]({ roomId: "real-room" });
  assert.strictEqual(dbService.calls.length, 0, "no strike on forged membership");
  assert.strictEqual(socket.disconnected, null, "not disconnected on forged report");
  assert.strictEqual(socket.emitted.length, 0, "no cooldown on forged report");
});

test("in-room report with a peer present notifies the peer", async () => {
  const registerRoomSocket = require("../src/sockets/roomSocket");
  const peerNotices = [];
  const memberRoomService = {
    isMember: () => true,
    getOtherUser: () => ({ socketId: "peer-9" }),
    deleteRoom: () => {},
  };
  const ioSpy = { to: (id) => ({ emit: (...a) => { if (id === "peer-9") peerNotices.push(a); } }) };
  const socket = makeSocket();
  const handlers = {};
  socket.on = (e, fn) => { handlers[e] = fn; };
  registerRoomSocket(socket, queue, memberRoomService, dbService, ioSpy);
  dbService.calls = [];

  await handlers["report_nsfw_violation"]({ roomId: "room-1" });
  assert.strictEqual(dbService.calls.length, 1, "strike recorded");
  assert.strictEqual(peerNotices.length, 1, "peer notified once");
  assert.strictEqual(peerNotices[0][0], "stranger_disconnected");
  assert.deepStrictEqual(socket.disconnected, [true]);
});
