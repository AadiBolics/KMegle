const test = require("node:test");
const assert = require("node:assert/strict");
const rooms = require("../src/services/roomService");
const register = require("../src/sockets/roomSocket");
const signaling = require("../src/sockets/webrtcSocket");
const matching = require("../src/sockets/matchSocket");
let count = 0;
function setup() {
  const id = "case-" + ++count,
    handlers = {},
    emitted = [],
    left = [];
  const socket = {
    id: "a" + id,
    user: { uid: "ua" },
    connected: true,
    handshake: { auth: { sessionId: "test-page-session-0001" } },
    on: (e, fn) => (handlers[e] = fn),
    emit: (...args) => emitted.push(args),
    leave: (r) => left.push(["a", r]),
    to: () => ({ emit: (...args) => emitted.push(args) }),
  };
  const peer = { id: "b" + id, leave: (r) => left.push(["b", r]) };
  const io = {
    to: () => ({ emit: (...args) => emitted.push(args) }),
    sockets: {
      sockets: new Map([
        [socket.id, socket],
        [peer.id, peer],
      ]),
    },
  };
  rooms.createRoom(
    id,
    { userId: "ua", socket },
    { userId: "ub", socket: peer },
  );
  const room = rooms.getRoom(id);
  room.sessionNonce = "nonce-" + id;
  const packet = {
    roomId: id,
    sessionNonce: room.sessionNonce,
    requestId: "request-id-000000" + id,
    negotiationId: 0,
  };
  const calls = [];
  const db = {
    recordReport: async (...args) => {
      calls.push(["report", ...args]);
      return true;
    },
    recordViolation: async (...args) => {
      calls.push(["violation", ...args]);
      return true;
    },
    blockUser: async (...args) => {
      calls.push(["block", ...args]);
      return true;
    },
  };
  register(socket, { remove() {} }, rooms, db, io);
  return { id, handlers, socket, io, db, calls, packet, emitted, left, room };
}
test("all safety and signaling handlers reject null/primitive/out-of-room packets safely", async () => {
  const h = setup();
  signaling(h.socket, rooms);
  for (const event of [
    "block_user",
    "report_user",
    "report_nsfw_violation",
    "report_peer_nsfw_violation",
    "leave_room",
    "webrtc_offer",
    "webrtc_answer",
    "webrtc_ice_candidate",
    "webrtc_restart_request",
  ])
    for (const value of [
      undefined,
      null,
      17,
      "bad",
      {},
      { ...h.packet, sessionNonce: "wrong" },
    ]) {
      let result;
      await h.handlers[event](value, (r) => {
        result = r;
      });
      assert.equal(h.calls.length, 0);
      if (event !== "leave_room") assert.equal(result.ok, false);
    }
  assert.equal(rooms.hasRoom(h.id), true);
  rooms.deleteRoom(h.id);
});
test("saved report is idempotent, scoped, ends both memberships and never penalizes peer", async () => {
  const h = setup();
  let a, b;
  await h.handlers.report_user(
    { ...h.packet, reason: "harassment" },
    (r) => (a = r),
  );
  await h.handlers.report_user(
    { ...h.packet, reason: "harassment" },
    (r) => (b = r),
  );
  assert.equal(a.ok, true);
  assert.deepEqual(a, b);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][0], "report");
  assert.equal(rooms.hasRoom(h.id), false);
  assert.equal(h.left.length, 2);
  assert.ok(
    h.emitted.some(
      (e) =>
        e[0] === "stranger_disconnected" &&
        e[1].sessionNonce === h.packet.sessionNonce,
    ),
  );
});
test("failed persistence cannot acknowledge saved success and remains retryable", async () => {
  const h = setup();
  h.db.recordReport = async () => false;
  let result;
  await h.handlers.report_user(h.packet, (r) => (result = r));
  assert.equal(result.ok, false);
  assert.equal(
    rooms.hasRoom(h.id),
    false,
    "the peer is freed even when saving fails",
  );
  h.db.recordReport = async () => true;
  await h.handlers.report_user(h.packet, (r) => (result = r));
  assert.equal(result.ok, true);
});
test("forged or stale membership never records self strikes", async () => {
  const h = setup();
  await h.handlers.report_nsfw_violation({ ...h.packet, sessionNonce: "old" });
  await h.handlers.report_nsfw_violation({ ...h.packet, roomId: "not-member" });
  assert.equal(h.calls.length, 0);
  rooms.deleteRoom(h.id);
});
test("ICE restart accepts only initiator, current nonce and current epoch", async () => {
  const h = setup();
  signaling(h.socket, rooms);
  let reply;
  h.handlers.webrtc_offer(
    { ...h.packet, negotiationId: 0, offer: { type: "offer", sdp: "initial" } },
    (r) => (reply = r),
  );
  assert.equal(reply.ok, true);
  h.handlers.webrtc_offer(
    { ...h.packet, negotiationId: 1, offer: { type: "offer", sdp: "test" } },
    (r) => (reply = r),
  );
  assert.equal(reply.ok, true);
  h.handlers.webrtc_ice_candidate(
    { ...h.packet, negotiationId: 0, candidate: { candidate: "stale" } },
    (r) => (reply = r),
  );
  assert.equal(reply.ok, false);
  h.handlers.webrtc_ice_candidate(
    {
      ...h.packet,
      negotiationId: 1,
      candidate: { candidate: "candidate:test" },
    },
    (r) => (reply = r),
  );
  assert.equal(reply.ok, true);
  const p = h.emitted.at(-1)[1];
  assert.equal(p.sessionNonce, h.packet.sessionNonce);
  assert.equal(p.negotiationId, 1);
  rooms.deleteRoom(h.id);
});
test("Stop during asynchronous eligibility cannot requeue", async () => {
  let resolve;
  const handlers = {},
    queue = {
      nodesMap: new Map(),
      add() {
        assert.fail("cancelled search entered queue");
      },
      remove() {},
    };
  const socket = {
    id: "cancel",
    user: { uid: "u" },
    connected: true,
    on: (e, fn) => (handlers[e] = fn),
  };
  matching(
    socket,
    queue,
    {
      hasAccepted: async () => true,
      isUserBanned: () => new Promise((r) => (resolve = r)),
      getCooldownRemaining: async () => 0,
    },
    rooms,
    {},
  );
  const pending = handlers.find_match({}, () => {});
  await Promise.resolve();
  handlers.stop_search();
  resolve(false);
  await pending;
});
test("failed report can retry after the captured call ends, without affecting a new room", async () => {
  const h = setup();
  h.db.recordReport = async () => false;
  let result;
  await h.handlers.report_user(h.packet, (r) => (result = r));
  assert.equal(result.ok, false);
  rooms.deleteRoom(h.id);
  const newId = h.id + "-new";
  rooms.createRoom(
    newId,
    { userId: "ua", socket: h.socket },
    { userId: "uc", socket: { id: "third" } },
  );
  h.db.recordReport = async (...args) => {
    h.calls.push(args);
    return true;
  };
  await h.handlers.report_user(h.packet, (r) => (result = r));
  assert.equal(result.ok, true);
  assert.equal(h.calls.at(-1)[1], "ub");
  assert.equal(rooms.hasRoom(newId), true);
  rooms.deleteRoom(newId);
});
test("recent ended-room safety metadata is limited to the same authenticated page", async () => {
  const h = setup();
  rooms.deleteRoom(h.id);
  let result;
  await h.handlers.report_user(h.packet, (r) => (result = r));
  assert.equal(result.ok, true);
  assert.equal(h.calls.length, 1);
  h.socket.handshake.auth.sessionId = "different-page-session-0002";
  await h.handlers.report_user(h.packet, (r) => (result = r));
  assert.equal(result.ok, false);
  assert.equal(
    h.calls.length,
    1,
    "another tab cannot inherit a recent safety target",
  );
});
