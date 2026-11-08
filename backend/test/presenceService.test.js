// Dependency-free unit tests for presenceService: fake io/roomService/sockets,
// short grace via env. Run: node backend/test/presenceService.test.js
process.env.AWAY_GRACE_MS = "1000"; // 1s grace for tests (service clamps to >=1s)
const assert = require("assert");
const presenceService = require("../src/services/presenceService");
const roomService = require("../src/services/roomService");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeIo() {
  const emitted = [];
  return {
    emitted,
    to(socketId) {
      return {
        emit: (event, data) => emitted.push({ socketId, event, data }),
      };
    },
  };
}

function makeSocket(id, uid) {
  const emitted = [];
  const joined = [];
  return {
    id,
    user: uid ? { uid } : undefined,
    handshake: { auth: { sessionId: "test-session-00000001" } },
    emitted,
    joined,
    emit: (event, data) => emitted.push({ event, data }),
    join: (roomId) => joined.push(roomId),
  };
}

function setupRoom(roomId, uidA, sockA, uidB, sockB) {
  roomService.createRoom(
    roomId,
    { userId: uidA, socket: { id: sockA } },
    { userId: uidB, socket: { id: sockB } },
  );
}

async function run() {
  // 1. Resume within grace: partner notified of drop + reconnect, room re-keyed
  {
    const io = makeIo();
    setupRoom("r1", "alice", "sA1", "bob", "sB1");
    presenceService.markAway({
      io,
      roomService,
      roomId: "r1",
      userId: "alice",
      socketId: "sA1",
      sessionId: "test-session-00000001",
    });
    assert.deepStrictEqual(
      io.emitted,
      [
        {
          socketId: "sB1",
          event: "partner_connection_lost",
          data: {
            roomId: "r1",
            sessionNonce: undefined,
            message:
              "Stranger's connection dropped. Waiting for them to reconnect...",
          },
        },
      ],
      "partner told to wait",
    );
    const sA2 = makeSocket("sA2", "alice");
    const hadAway = presenceService.resume({ io, roomService, socket: sA2 });
    assert.strictEqual(hadAway, true, "away entry existed");
    assert.deepStrictEqual(sA2.joined, ["r1"], "rejoined socket.io room");
    assert.deepStrictEqual(
      sA2.emitted,
      [
        {
          event: "session_resume_result",
          data: { resumed: true, roomId: "r1", sessionNonce: undefined },
        },
      ],
      "resume verdict",
    );
    assert.strictEqual(
      roomService.getRoom("r1").u1.socketId,
      "sA2",
      "room re-keyed to new socket id",
    );
    assert.ok(
      io.emitted.some(
        (e) => e.socketId === "sB1" && e.event === "partner_reconnected",
      ),
      "partner told of reconnect",
    );
    await sleep(1200);
    assert.ok(
      roomService.hasRoom("r1"),
      "stale timer must not tear the resumed room down",
    );
    assert.ok(
      !io.emitted.some((e) => e.event === "stranger_disconnected"),
      "stale timer must not notify disconnect",
    );
    roomService.deleteRoom("r1");
    console.log(
      "PASS 1 resume within grace: rekey, notifications, stale timer suppressed",
    );
  }

  // 2. Grace expiry: partner freed, room deleted, verdict becomes not-resumed
  {
    const io = makeIo();
    setupRoom("r2", "alice", "sA1", "bob", "sB1");
    presenceService.markAway({
      io,
      roomService,
      roomId: "r2",
      userId: "alice",
      socketId: "sA1",
      sessionId: "test-session-00000001",
    });
    await sleep(1200);
    assert.ok(!roomService.hasRoom("r2"), "room deleted after grace");
    assert.ok(
      io.emitted.some(
        (e) => e.socketId === "sB1" && e.event === "stranger_disconnected",
      ),
      "partner freed after grace",
    );
    const sA2 = makeSocket("sA2", "alice");
    const hadAway = presenceService.resume({ io, roomService, socket: sA2 });
    // Entry was consumed by the timer, so no away state remains.
    assert.strictEqual(
      hadAway,
      false,
      "expired entry leaves no resumable state",
    );
    roomService.deleteRoom("r2");
    console.log("PASS 2 grace expiry: teardown + no resumable state");
  }

  // 3. Fresh search (Next) ends the held room immediately
  {
    const io = makeIo();
    setupRoom("r3", "alice", "sA1", "bob", "sB1");
    presenceService.markAway({
      io,
      roomService,
      roomId: "r3",
      userId: "alice",
      socketId: "sA1",
      sessionId: "test-session-00000001",
    });
    presenceService.endAwayForUser({
      io,
      roomService,
      userId: "alice",
      sessionId: "test-session-00000001",
    });
    assert.ok(!roomService.hasRoom("r3"), "held room ended by fresh search");
    assert.ok(
      io.emitted.some(
        (e) => e.socketId === "sB1" && e.event === "stranger_disconnected",
      ),
      "partner freed immediately",
    );
    await sleep(1200);
    assert.strictEqual(
      io.emitted.filter((e) => e.event === "stranger_disconnected").length,
      1,
      "no duplicate teardown from a stale timer",
    );
    console.log("PASS 3 fresh search ends held room, no stale-timer duplicate");
  }

  // 4. Deliberate teardown (leave/block/report) cancels pending away timers
  {
    const io = makeIo();
    setupRoom("r4", "alice", "sA1", "bob", "sB1");
    presenceService.markAway({
      io,
      roomService,
      roomId: "r4",
      userId: "alice",
      socketId: "sA1",
      sessionId: "test-session-00000001",
    });
    presenceService.clearRoom("r4", roomService); // what leave/block/report do before deleteRoom
    roomService.deleteRoom("r4");
    await sleep(1200);
    assert.ok(
      !io.emitted.some((e) => e.event === "stranger_disconnected"),
      "cancelled timer must not fire",
    );
    const sA2 = makeSocket("sA2", "alice");
    assert.strictEqual(
      presenceService.resume({ io, roomService, socket: sA2 }),
      false,
      "nothing left to resume",
    );
    console.log("PASS 4 deliberate teardown cancels away timers");
  }

  // 5. Double disconnect: timers must not stack
  {
    const io = makeIo();
    setupRoom("r5", "alice", "sA1", "bob", "sB1");
    presenceService.markAway({
      io,
      roomService,
      roomId: "r5",
      userId: "alice",
      socketId: "sA1",
      sessionId: "test-session-00000001",
    });
    presenceService.markAway({
      io,
      roomService,
      roomId: "r5",
      userId: "alice",
      socketId: "sA1",
      sessionId: "test-session-00000001",
    });
    // A repeat markAway may re-emit the waiting notice (idempotent UI state);
    // the invariant that matters is a single teardown and a single timer.
    await sleep(1200);
    assert.strictEqual(
      io.emitted.filter((e) => e.event === "stranger_disconnected").length,
      1,
      "exactly one teardown",
    );
    console.log("PASS 5 double disconnect does not stack timers");
  }

  // 6. Both partners drop: first resume holds, second resume restores both
  {
    const io = makeIo();
    setupRoom("r6", "alice", "sA1", "bob", "sB1");
    presenceService.markAway({
      io,
      roomService,
      roomId: "r6",
      userId: "alice",
      socketId: "sA1",
      sessionId: "test-session-00000001",
    });
    presenceService.markAway({
      io,
      roomService,
      roomId: "r6",
      userId: "bob",
      socketId: "sB1",
      sessionId: "test-session-00000001",
    });
    const sA2 = makeSocket("sA2", "alice");
    assert.strictEqual(
      presenceService.resume({ io, roomService, socket: sA2 }),
      true,
      "alice resumed",
    );
    assert.strictEqual(roomService.getRoom("r6").u1.socketId, "sA2");
    const sB2 = makeSocket("sB2", "bob");
    assert.strictEqual(
      presenceService.resume({ io, roomService, socket: sB2 }),
      true,
      "bob resumed",
    );
    assert.strictEqual(roomService.getRoom("r6").u2.socketId, "sB2");
    assert.ok(
      io.emitted.some(
        (e) => e.socketId === "sA2" && e.event === "partner_reconnected",
      ),
      "reconnected alice told when bob returns",
    );
    await sleep(1200);
    assert.ok(roomService.hasRoom("r6"), "room survives after both resumed");
    roomService.deleteRoom("r6");
    console.log("PASS 6 both partners drop and resume");
  }

  // 7. Expiry while BOTH are away: one teardown, no resumable state for either
  {
    const io = makeIo();
    setupRoom("r7", "alice", "sA1", "bob", "sB1");
    presenceService.markAway({
      io,
      roomService,
      roomId: "r7",
      userId: "alice",
      socketId: "sA1",
      sessionId: "test-session-00000001",
    });
    presenceService.markAway({
      io,
      roomService,
      roomId: "r7",
      userId: "bob",
      socketId: "sB1",
      sessionId: "test-session-00000001",
    });
    await sleep(1200);
    assert.ok(!roomService.hasRoom("r7"), "room gone after both expire");
    assert.strictEqual(
      io.emitted.filter((e) => e.event === "stranger_disconnected").length,
      1,
      "single teardown despite two timers",
    );
    assert.strictEqual(
      presenceService.resume({
        io,
        roomService,
        socket: makeSocket("sA2", "alice"),
      }),
      false,
      "alice cannot resume",
    );
    console.log("PASS 7 both-away expiry tears down once");
  }

  // Different tab / reload / uid must not consume or cancel another session.
  {
    const io = makeIo();
    setupRoom("ownership", "alice", "old", "bob", "peer");
    presenceService.markAway({
      io,
      roomService,
      roomId: "ownership",
      userId: "alice",
      socketId: "old",
      sessionId: "test-session-00000001",
    });
    const otherTab = makeSocket("other", "alice");
    otherTab.handshake.auth.sessionId = "test-session-00000002";
    assert.strictEqual(
      presenceService.resume({ io, roomService, socket: otherTab }),
      false,
    );
    presenceService.endAwayForUser({
      io,
      roomService,
      userId: "alice",
      sessionId: "test-session-00000002",
    });
    assert.strictEqual(roomService.getRoom("ownership").u1.socketId, "old");
    assert.strictEqual(
      io.emitted.filter((e) => e.event === "stranger_disconnected").length,
      0,
    );
    const wrongUser = makeSocket("wrong", "mallory");
    assert.strictEqual(
      presenceService.resume({ io, roomService, socket: wrongUser }),
      false,
    );
    const owner = makeSocket("owner", "alice");
    assert.strictEqual(
      presenceService.resume({ io, roomService, socket: owner }),
      true,
    );
    assert.strictEqual(roomService.getRoom("ownership").u1.socketId, "owner");
    roomService.deleteRoom("ownership");
    console.log(
      "PASS 8 different session and uid denied without consuming owner hold",
    );
  }
  {
    const io = makeIo();
    setupRoom("reload", "alice", "old", "bob", "peer");
    presenceService.markAway({
      io,
      roomService,
      roomId: "reload",
      userId: "alice",
      socketId: "old",
      sessionId: "test-session-00000001",
    });
    const reloaded = makeSocket("new-page", "alice");
    reloaded.handshake.auth.sessionId = "test-session-00000003";
    assert.strictEqual(
      presenceService.resume({ io, roomService, socket: reloaded }),
      false,
    );
    await sleep(1200);
    assert.strictEqual(roomService.hasRoom("reload"), false);
    assert.strictEqual(
      io.emitted.filter((e) => e.event === "stranger_disconnected").length,
      1,
    );
    console.log(
      "PASS 9 reload does not inherit dead WebRTC session; old peer freed by grace",
    );
  }
  console.log("\nAll presenceService unit tests passed");
}

run().catch((e) => {
  console.error("UNIT TEST FAILURE:", e);
  process.exit(1);
});
