/**
 * HTTP route benchmark: health-check latency + rate-limit enforcement.
 *
 * Why not a raw "requests/sec" throughput number: the app's HTTP routes are
 * intentionally rate-limited quite strictly (see backend/src/server.js —
 * 20 req/min on /api/turn-credentials and /api/admin via `strictLimiter`,
 * 100 req/min elsewhere via `generalLimiter`). A throughput number against
 * a deliberately-throttled API isn't a meaningful capacity claim — the
 * honest, useful test here is confirming the limiter actually enforces its
 * configured threshold under load, and measuring latency for the
 * unauthenticated health check.
 *
 * Usage:
 *   node benchmarks/http-load/benchmark.js
 *   node benchmarks/http-load/benchmark.js --url=http://localhost:5000
 */

const { provisionUsers, cleanupUsers } = require("../socketio-load/provisionTestUsers");

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace(/^--/, "").split("=");
  acc[key] = value;
  return acc;
}, {});

const BASE_URL = args.url || "http://localhost:5000";

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return null;
  const idx = Math.min(
    sortedArr.length - 1,
    Math.floor((p / 100) * sortedArr.length)
  );
  return sortedArr[idx];
}

async function timedRequest(url, options) {
  const start = process.hrtime.bigint();
  const response = await fetch(url, options);
  const end = process.hrtime.bigint();
  // Drain the body so the connection is freed before the next request.
  await response.text().catch(() => {});
  return { status: response.status, ms: Number(end - start) / 1e6 };
}

async function benchmarkHealthLatency(count) {
  const latencies = [];
  for (let i = 0; i < count; i++) {
    const { status, ms } = await timedRequest(`${BASE_URL}/api/health`);
    if (status !== 200) {
      console.warn(`  unexpected status ${status} on request ${i}`);
    }
    latencies.push(ms);
  }
  latencies.sort((a, b) => a - b);
  return {
    count,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    max: latencies[latencies.length - 1],
  };
}

async function benchmarkRateLimit(count, idToken) {
  const statuses = [];
  let firstRateLimitedAt = null;
  let retryAfterHeader = null;

  for (let i = 0; i < count; i++) {
    const response = await fetch(`${BASE_URL}/api/turn-credentials`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    await response.text().catch(() => {});

    statuses.push(response.status);

    if (response.status === 429 && firstRateLimitedAt === null) {
      firstRateLimitedAt = i + 1; // 1-indexed request number
      retryAfterHeader =
        response.headers.get("retry-after") ||
        response.headers.get("ratelimit-reset");
    }
  }

  const okCount = statuses.filter((s) => s === 200 || s === 502).length;
  const limitedCount = statuses.filter((s) => s === 429).length;

  return { total: count, okCount, limitedCount, firstRateLimitedAt, retryAfterHeader };
}

async function main() {
  console.log(`HTTP route benchmark against ${BASE_URL}\n`);

  // --- 1. Health check latency (unauthenticated, generalLimiter: 100/min) ---
  console.log("1. /api/health latency (50 sequential requests, no auth needed)");
  const healthStats = await benchmarkHealthLatency(50);
  console.log(
    `   p50: ${healthStats.p50.toFixed(1)}ms | p95: ${healthStats.p95.toFixed(
      1
    )}ms | p99: ${healthStats.p99.toFixed(1)}ms | max: ${healthStats.max.toFixed(1)}ms\n`
  );

  // --- 2. Rate limit enforcement on /api/turn-credentials (strictLimiter: 20/min) ---
  console.log("2. /api/turn-credentials rate-limit enforcement (25 sequential authenticated requests)");
  const [testUser] = await provisionUsers(1);
  try {
    const rateLimitStats = await benchmarkRateLimit(25, testUser.idToken);
    console.log(
      `   ${rateLimitStats.okCount}/${rateLimitStats.total} succeeded, ` +
        `${rateLimitStats.limitedCount}/${rateLimitStats.total} rate-limited (429)`
    );
    if (rateLimitStats.firstRateLimitedAt) {
      console.log(
        `   First 429 on request #${rateLimitStats.firstRateLimitedAt} ` +
          `(configured limit: 20/min) — Retry-After/Reset header: ${rateLimitStats.retryAfterHeader}`
      );
      console.log(
        rateLimitStats.firstRateLimitedAt === 21
          ? "   ✅ Matches the configured strictLimiter threshold exactly."
          : "   ⚠️  Does not land exactly on request #21 — check for other recent traffic against this limiter window, or re-run in a fresh rate-limit window."
      );
    } else {
      console.log(
        "   ⚠️  Never hit a 429 in 25 requests — rate limiting may not be enforcing as configured."
      );
    }
  } finally {
    await cleanupUsers([testUser.uid]);
  }

  console.log(
    "\nNote: raw throughput (req/sec) isn't reported here because the API is " +
      "deliberately rate-limited at 20-100 req/min — a throughput number " +
      "against a throttled-by-design API isn't a meaningful capacity claim.\n"
  );
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
