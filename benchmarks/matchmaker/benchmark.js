/**
 * Standalone benchmark for MatchmakerQueue — measures DB round-trip COUNT
 * (the real cost driver; actual queries went through Postgres over the
 * network) as queue size grows, with zero dependency on a real Postgres
 * connection (dbService is stubbed via the require cache below).
 *
 * Also reconstructs the ORIGINAL algorithm (one dbService.hasBlocked call
 * per candidate PAIR, O(n^2) DB round-trips in the worst case) so it can be
 * compared against the current implementation, which has gone through two
 * rounds of optimization:
 *   v1 (superseded): one dbService.getBlockedIds call per queued USER per
 *     pass — O(n) round-trips, down from O(n^2).
 *   v2 (current):    one dbService.getBlockGraphForUsers call for the
 *     WHOLE queue per pass — O(1) round-trips regardless of queue size.
 * v2 was driven by a real finding: at ~30-40ms observed Neon round-trip
 * latency, v1's O(n) round-trips were themselves the bottleneck once queue
 * size reached the low hundreds (confirmed via the live Socket.IO load
 * test — see ../results/socketio-load-local.txt for the before/after).
 * This script models "legacy" vs "current" (v2); v1 is not separately
 * modeled here since it's no longer what ships.
 *
 * Call count is measured exactly (deterministic, no timer noise). Estimated
 * wall-clock time is then DERIVED by multiplying call count by a chosen
 * per-call latency — it is NOT measured by inserting real sleeps into the
 * hot path, because at the call volumes here (sometimes tens of thousands
 * of chained awaits), Node's timer granularity dominates and makes directly
 * "measured" time meaningless. Treat the ms columns as an estimate, and the
 * call-count columns as the actual finding.
 *
 * Usage:
 *   node benchmarks/matchmaker/benchmark.js
 *   node benchmarks/matchmaker/benchmark.js --latency=15   (ms per simulated DB call, for the estimate)
 *   node benchmarks/matchmaker/benchmark.js --sizes=50,200,1000,5000
 *   node benchmarks/matchmaker/benchmark.js --blockRate=0.2
 */

const path = require("path");

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace(/^--/, "").split("=");
  acc[key] = value;
  return acc;
}, {});

const DB_LATENCY_MS = args.latency ? Number(args.latency) : 8;
const QUEUE_SIZES = args.sizes
  ? args.sizes.split(",").map(Number)
  : [20, 50, 100, 200, 500, 1000];
// Fraction of candidate pairs that are mutually blocked. Realistic queues
// have some block density from prior skip/report activity — this is what
// forces the legacy algorithm's inner loop to scan past candidates (and,
// across repeated "rotate and retry" attempts, re-ask the DB the same
// question many times instead of reusing an earlier answer).
const BLOCK_RATE = args.blockRate ? Number(args.blockRate) : 0.15;

// A dense "clique" of mutually-blocked users at the front of the queue —
// models a realistic worst case (e.g. a harassment cluster, or users who
// keep re-blocking each other after repeated bad matches) rather than
// uniform-random blocking, which rarely forces a long scan (geometric
// distribution — expected scan length is ~1/(1-rate), independent of n).
function buildClusteredBlockGraph(n, clusterFraction) {
  const clusterSize = Math.floor(n * clusterFraction);
  const blocked = new Set();
  for (let i = 0; i < clusterSize; i++) {
    for (let j = i + 1; j < clusterSize; j++) {
      blocked.add(`user-${i}|user-${j}`);
    }
  }
  return blocked;
}

// Deterministic pseudo-random block graph so every run (legacy vs current)
// sees the exact same block relationships — otherwise we'd be comparing the
// two algorithms against different problems.
function buildBlockGraph(n, rate, seed) {
  let state = seed;
  const rand = () => {
    // xorshift32 — fast, deterministic, good enough for a synthetic benchmark.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };

  const blocked = new Set();
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (rand() < rate) {
        blocked.add(`user-${i}|user-${j}`);
      }
    }
  }
  return blocked;
}

function isBlockedPair(blockGraph, userA, userB) {
  const key = userA < userB ? `${userA}|${userB}` : `${userB}|${userA}`;
  return blockGraph.has(key);
}

// ---------------------------------------------------------------------------
// Stub dbService BEFORE requiring MatchmakerQueue, so the real db.js
// (which opens a Postgres pool and process.exit(1)s without a valid
// DATABASE_URL) never gets loaded at all. Calls resolve immediately —
// we count them instead of timing them (see header comment).
// ---------------------------------------------------------------------------
const dbServicePath = path.resolve(
  __dirname,
  "../../backend/src/services/dbService.js"
);

let dbCallCount = 0;
let activeBlockGraph = new Set();

require.cache[dbServicePath] = {
  id: dbServicePath,
  filename: dbServicePath,
  loaded: true,
  exports: {
    getBlockedIds: async (userId) => {
      dbCallCount++;
      const blockedBy = new Set();
      for (const key of activeBlockGraph) {
        const [a, b] = key.split("|");
        if (a === userId) blockedBy.add(b);
        else if (b === userId) blockedBy.add(a);
      }
      return blockedBy;
    },
    hasBlocked: async (userA, userB) => {
      dbCallCount++;
      return isBlockedPair(activeBlockGraph, userA, userB);
    },
    // Current production implementation: one query per matching PASS,
    // regardless of how many users are queued (see dbService.js).
    getBlockGraphForUsers: async (userIds) => {
      dbCallCount++;
      const graph = new Map();
      for (const id of userIds) graph.set(id, new Set());
      for (const key of activeBlockGraph) {
        const [a, b] = key.split("|");
        if (graph.has(a)) graph.get(a).add(b);
        if (graph.has(b)) graph.get(b).add(a);
      }
      return graph;
    },
  },
};

const MatchmakerQueue = require(
  path.resolve(__dirname, "../../backend/src/matchmaker/MatchmakerQueue.js")
);

// ---------------------------------------------------------------------------
// Fake socket — just enough surface area for MatchmakerQueue to operate on.
// ---------------------------------------------------------------------------
function makeFakeSocket(id) {
  return {
    id,
    rooms: new Set([id]),
    join(room) {
      this.rooms.add(room);
    },
    leave(room) {
      this.rooms.delete(room);
    },
    emit() {
      /* no-op */
    },
  };
}

function waitForIdle(queue) {
  // tryMatch() is fire-and-forget from add(); poll until it settles.
  // NOTE: a leftover unmatched user (or a small group that can never find
  // an unblocked partner) is a legitimate terminal state — tryMatch's own
  // `attempts < this.size` guard exits in that case, so we must only wait
  // on `isMatching`, not on queue.size reaching some target.
  return new Promise((resolve) => {
    const check = () => {
      if (!queue.isMatching) {
        resolve();
      } else {
        setImmediate(check);
      }
    };
    check();
  });
}

// ---------------------------------------------------------------------------
// CURRENT algorithm: run the real MatchmakerQueue as shipped today.
// ---------------------------------------------------------------------------
async function benchmarkCurrent(n, blockGraph) {
  const queue = new MatchmakerQueue();
  dbCallCount = 0;
  activeBlockGraph = blockGraph;

  for (let i = 0; i < n; i++) {
    queue.add(makeFakeSocket(`sock-${i}`), `user-${i}`);
  }

  await waitForIdle(queue);

  return { dbCalls: dbCallCount, unmatched: queue.size };
}

// ---------------------------------------------------------------------------
// LEGACY algorithm (pre-fix): one hasBlocked() round-trip per candidate PAIR
// inside the nested loop, exactly as it shipped before this optimization.
// Reconstructed here (not imported) since the source no longer contains it.
// ---------------------------------------------------------------------------
async function benchmarkLegacy(n, blockGraph) {
  const dbService = require.cache[dbServicePath].exports;
  dbCallCount = 0;
  activeBlockGraph = blockGraph;

  class LegacyNode {
    constructor(socket, userId) {
      this.socket = socket;
      this.userId = userId;
      this.prev = null;
      this.next = null;
    }
  }

  let head = null;
  let tail = null;
  let size = 0;
  const nodesMap = new Map();

  function add(socket, userId) {
    const node = new LegacyNode(socket, userId);
    nodesMap.set(socket.id, node);
    if (!head) {
      head = tail = node;
    } else {
      tail.next = node;
      node.prev = tail;
      tail = node;
    }
    size++;
  }

  function remove(socketId) {
    const node = nodesMap.get(socketId);
    if (!node) return;
    if (node.prev) node.prev.next = node.next;
    else head = node.next;
    if (node.next) node.next.prev = node.prev;
    else tail = node.prev;
    nodesMap.delete(socketId);
    size--;
  }

  function rotateHeadToTail() {
    if (size < 2 || !head) return;
    const oldHead = head;
    remove(oldHead.socket.id);
    add(oldHead.socket, oldHead.userId);
  }

  for (let i = 0; i < n; i++) {
    add(makeFakeSocket(`sock-${i}`), `user-${i}`);
  }

  let attempts = 0;
  while (size >= 2 && attempts < size) {
    const user1 = head;
    if (!user1) break;

    let user2 = user1.next;
    let foundMatch = false;

    while (user2) {
      // The legacy call: one DB round-trip per PAIR comparison.
      const blocked = await dbService.hasBlocked(user1.userId, user2.userId);
      if (!blocked) {
        foundMatch = true;
        break;
      }
      user2 = user2.next;
    }

    if (!foundMatch || !user2) {
      rotateHeadToTail();
      attempts++;
      continue;
    }

    attempts = 0;
    remove(user1.socket.id);
    remove(user2.socket.id);
  }

  return { dbCalls: dbCallCount, unmatched: size };
}

// ---------------------------------------------------------------------------
// Run + report
// ---------------------------------------------------------------------------
(async () => {
  const realConsoleLog = console.log;
  // MatchmakerQueue logs on every match/skip — silence it, it's irrelevant noise here.
  console.log = () => {};

  const useCluster = args.cluster !== undefined;
  const clusterFraction = args.cluster ? Number(args.cluster) : 0.5;

  const results = [];

  for (const n of QUEUE_SIZES) {
    const blockGraph = useCluster
      ? buildClusteredBlockGraph(n, clusterFraction)
      : buildBlockGraph(n, BLOCK_RATE, 0xc0ffee + n);

    const legacy = await benchmarkLegacy(n, blockGraph);
    const current = await benchmarkCurrent(n, blockGraph);

    results.push({ n, legacy, current });
  }

  console.log = realConsoleLog;

  const scenarioLabel = useCluster
    ? `a mutually-blocked cluster covering ${(clusterFraction * 100).toFixed(0)}% of the queue`
    : `~${(BLOCK_RATE * 100).toFixed(0)}% of candidate pairs randomly blocked`;

  console.log(
    `\nMatchmakerQueue benchmark — ${QUEUE_SIZES.length} queue sizes, ${scenarioLabel}\n` +
      `Estimated time columns assume ${DB_LATENCY_MS}ms per DB round-trip (change with --latency=<ms>; ` +
      `pull your own p50 from the Neon console for a number specific to your deployment).\n`
  );
  console.log(
    "queue size | legacy DB calls | legacy est. time | current DB calls | current est. time | call reduction"
  );
  console.log("-".repeat(100));

  for (const { n, legacy, current } of results) {
    const legacyMs = legacy.dbCalls * DB_LATENCY_MS;
    const currentMs = current.dbCalls * DB_LATENCY_MS;
    const reduction = (
      ((legacy.dbCalls - current.dbCalls) / legacy.dbCalls) *
      100
    ).toFixed(0);

    console.log(
      `${String(n).padEnd(10)} | ${String(legacy.dbCalls).padStart(15)} | ${legacyMs
        .toFixed(0)
        .padStart(16)}ms | ${String(current.dbCalls).padStart(17)} | ${currentMs
        .toFixed(0)
        .padStart(17)}ms | ${reduction}% fewer calls`
    );
  }

  console.log(
    "\nMethodology: call counts are measured exactly against the real MatchmakerQueue " +
      "source (require()'d directly, dbService stubbed). Estimated-time columns are " +
      "call-count × assumed per-call latency, not a live timed run — see header comment " +
      "for why (timer-granularity noise at high call volumes).\n"
  );
})();
