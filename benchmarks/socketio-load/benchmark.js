/**
 * Socket.IO concurrent-connection + matchmaking-latency load test.
 *
 * Connects N real, Firebase-authenticated Socket.IO clients to a running
 * backend (default: http://localhost:5000 — your own local dev instance,
 * NOT production; never point this at a shared/deployed instance real
 * users might be on), has each one join the matchmaking queue exactly like
 * the real frontend does, and measures:
 *   - connection success rate (how many of N actually authenticate)
 *   - time from "find_match" emitted to "match_found" received (p50/p95/p99)
 *   - how many ended up successfully paired vs left waiting/errored
 *
 * This measures YOUR LOCAL MACHINE's capacity running the backend process,
 * not your production host's (e.g. Render free tier) — say so explicitly
 * if you quote a number from this.
 *
 * Usage:
 *   node benchmarks/socketio-load/benchmark.js --n=40
 *   node benchmarks/socketio-load/benchmark.js --n=40 --url=http://localhost:5000
 *   node benchmarks/socketio-load/benchmark.js --sizes=10,20,40,80
 */

const { io } = require("socket.io-client");
const { provisionUsers, cleanupUsers } = require("./provisionTestUsers");

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace(/^--/, "").split("=");
  acc[key] = value;
  return acc;
}, {});

const BACKEND_URL = args.url || "http://localhost:5000";
const MATCH_TIMEOUT_MS = args.timeout ? Number(args.timeout) : 20000;
const SIZES = args.sizes
  ? args.sizes.split(",").map(Number)
  : [args.n ? Number(args.n) : 20];

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return null;
  const idx = Math.min(
    sortedArr.length - 1,
    Math.floor((p / 100) * sortedArr.length)
  );
  return sortedArr[idx];
}

/**
 * Runs one round: connects `users.length` clients, has each join the queue,
 * waits for match_found (or timeout/error) on every one, then disconnects
 * everyone. Returns aggregate stats for this round.
 */
function runRound(users, backendUrl) {
  return new Promise((resolve) => {
    const perClient = users.map((user) => ({
      uid: user.uid,
      socket: null,
      connectedAt: null,
      findMatchAt: null,
      matchedAt: null,
      outcome: "pending", // pending | connected_no_match | matched | connect_error | timeout
    }));

    let settledCount = 0;
    const finish = () => {
      if (settledCount < perClient.length) return;
      for (const c of perClient) {
        c.socket?.removeAllListeners();
        c.socket?.disconnect();
      }
      resolve(perClient);
    };

    const settle = (client, outcome) => {
      if (client.outcome !== "pending") return;
      client.outcome = outcome;
      settledCount++;
      if (settledCount === perClient.length) {
        setImmediate(finish);
      }
    };

    perClient.forEach((client, i) => {
      const user = users[i];
      const socket = io(backendUrl, {
        transports: ["websocket"],
        auth: { token: user.idToken },
        reconnection: false,
        timeout: 10000,
      });
      client.socket = socket;

      const timeoutHandle = setTimeout(() => {
        settle(client, "timeout");
      }, MATCH_TIMEOUT_MS);

      socket.on("connect", () => {
        client.connectedAt = Date.now();
        client.findMatchAt = Date.now();
        socket.emit("find_match");
      });

      socket.on("match_found", () => {
        client.matchedAt = Date.now();
        clearTimeout(timeoutHandle);
        settle(client, "matched");
      });

      socket.on("connect_error", (err) => {
        client.error = err.message;
        clearTimeout(timeoutHandle);
        settle(client, "connect_error");
      });

      socket.on("banned_alert", (data) => {
        client.error = data?.message;
        clearTimeout(timeoutHandle);
        settle(client, "connect_error");
      });

      socket.on("cooldown_active", () => {
        client.error = "cooldown_active";
        clearTimeout(timeoutHandle);
        settle(client, "connect_error");
      });
    });
  });
}

async function main() {
  console.log(
    `Socket.IO load test against ${BACKEND_URL} — sizes: ${SIZES.join(", ")}\n`
  );
  console.log(
    "concurrent users | connected | matched | match latency p50 | p95 | p99 | errors/timeouts"
  );
  console.log("-".repeat(100));

  for (const n of SIZES) {
    const users = await provisionUsers(n);

    try {
      const results = await runRound(users, BACKEND_URL);

      const connected = results.filter((r) => r.connectedAt !== null).length;
      const matched = results.filter((r) => r.outcome === "matched");
      const failed = results.filter(
        (r) => r.outcome === "connect_error" || r.outcome === "timeout"
      );

      const latencies = matched
        .map((r) => r.matchedAt - r.findMatchAt)
        .sort((a, b) => a - b);

      const p50 = percentile(latencies, 50);
      const p95 = percentile(latencies, 95);
      const p99 = percentile(latencies, 99);

      console.log(
        `${String(n).padEnd(17)} | ${String(connected).padEnd(9)} | ${String(
          matched.length
        ).padEnd(7)} | ${String(p50 ?? "-").padEnd(17)}ms | ${String(
          p95 ?? "-"
        ).padEnd(3)}ms | ${String(p99 ?? "-").padEnd(3)}ms | ${failed.length}`
      );

      if (failed.length > 0) {
        const sample = failed.slice(0, 3).map((f) => f.error || f.outcome);
        console.log(`   (sample failure reasons: ${sample.join(", ")})`);
      }
    } finally {
      await cleanupUsers(users.map((u) => u.uid));
    }
  }

  console.log(
    "\nNote: this measures YOUR LOCAL MACHINE running the backend process — " +
      "not your production hosting tier's capacity. 'matched' counts users " +
      "paired with ANOTHER load-test user in the same round (each round " +
      "queues exactly N users, so pairing requires an even number and no " +
      "pre-existing real users competing for the same queue).\n"
  );
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
