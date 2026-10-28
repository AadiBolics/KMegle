/**
 * WebRTC real connection success rate — the most "did this actually work"
 * test in this suite. Drives real Chromium instances (via Playwright) with
 * fake camera/mic devices through a minimal test harness (harness.html)
 * that replays the exact signaling sequence frontend/src/app/chat/hooks/
 * useChatSession.ts uses, against the real backend. This exercises the
 * real WebRTC/ICE/STUN stack, not a mock.
 *
 * Why not drive the actual Next.js app: the real app's only sign-in path is
 * a Google OAuth popup, which can't be automated headlessly without a
 * separate OAuth-automation setup. The harness sidesteps that by taking an
 * already-obtained Firebase ID token (minted the same way the Socket.IO
 * load test does) directly as a URL param — the WebRTC/signaling code it
 * runs is a faithful port of the real hook's logic, not a simplification
 * of what's being tested, only of how the page gets authenticated.
 *
 * Usage:
 *   node benchmarks/webrtc-pairing/benchmark.js --pairs=5
 *   node benchmarks/webrtc-pairing/benchmark.js --pairs=5 --backend=http://localhost:5000
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { provisionUsers, cleanupUsers } = require("../socketio-load/provisionTestUsers");

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace(/^--/, "").split("=");
  acc[key] = value;
  return acc;
}, {});

const PAIR_COUNT = args.pairs ? Number(args.pairs) : 5;
const BACKEND_URL = args.backend || "http://localhost:5000";
const HARNESS_PORT = args.port ? Number(args.port) : 4321;

function serveHarness(port) {
  const html = fs.readFileSync(path.join(__dirname, "harness.html"));
  // Vendored locally (not loaded from a CDN) — under concurrent browser
  // load, a flaky/slow CDN fetch raced the inline script and occasionally
  // lost, producing a spurious "io is not defined" failure that had
  // nothing to do with the app being tested. Serving it from disk removes
  // that external dependency entirely.
  const socketIoClientJs = fs.readFileSync(
    path.join(
      __dirname,
      "../node_modules/socket.io-client/dist/socket.io.min.js"
    )
  );

  const server = http.createServer((req, res) => {
    if (req.url === "/socket.io.min.js") {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end(socketIoClientJs);
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

async function runPair(browser, backendUrl, harnessUrl, userA, userB) {
  const makeContext = () =>
    browser.newContext({
      permissions: ["camera", "microphone"],
    });

  const [contextA, contextB] = await Promise.all([makeContext(), makeContext()]);
  const [pageA, pageB] = await Promise.all([contextA.newPage(), contextB.newPage()]);

  try {
    const urlFor = (token) =>
      `${harnessUrl}?token=${encodeURIComponent(token)}&backend=${encodeURIComponent(
        backendUrl
      )}`;

    await Promise.all([
      pageA.goto(urlFor(userA.idToken)),
      pageB.goto(urlFor(userB.idToken)),
    ]);

    const waitForResult = (page) =>
      page.waitForFunction(() => window.__testResult !== null, { timeout: 30000 }).then(
        () => page.evaluate(() => window.__testResult),
        () => ({ success: false, error: "playwright_wait_timeout", connectMs: null })
      );

    const [resultA, resultB] = await Promise.all([waitForResult(pageA), waitForResult(pageB)]);
    return { resultA, resultB };
  } finally {
    await contextA.close();
    await contextB.close();
  }
}

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return null;
  const idx = Math.min(sortedArr.length - 1, Math.floor((p / 100) * sortedArr.length));
  return sortedArr[idx];
}

async function main() {
  console.log(
    `WebRTC pairing benchmark — ${PAIR_COUNT} pairs against ${BACKEND_URL}\n` +
      `(each pair = 2 real headless Chromium instances with fake camera/mic devices)\n`
  );

  const server = await serveHarness(HARNESS_PORT);
  const harnessUrl = `http://localhost:${HARNESS_PORT}/harness.html`;

  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });

  const connectTimes = [];
  let successCount = 0;
  const failures = [];

  try {
    for (let i = 0; i < PAIR_COUNT; i++) {
      const [userA, userB] = await provisionUsers(2);
      try {
        const { resultA, resultB } = await runPair(
          browser,
          BACKEND_URL,
          harnessUrl,
          userA,
          userB
        );

        for (const result of [resultA, resultB]) {
          if (result.success) {
            successCount++;
            connectTimes.push(result.connectMs);
          } else {
            failures.push(result.error);
          }
        }

        console.log(
          `  pair ${i + 1}/${PAIR_COUNT}: A=${resultA.success ? "OK" : "FAIL(" + resultA.error + ")"} ` +
            `B=${resultB.success ? "OK" : "FAIL(" + resultB.error + ")"}`
        );
      } finally {
        await cleanupUsers([userA.uid, userB.uid]);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  connectTimes.sort((a, b) => a - b);
  const total = PAIR_COUNT * 2;

  console.log(`\nResults: ${successCount}/${total} peers established a working connection (${((successCount / total) * 100).toFixed(0)}%)`);
  if (connectTimes.length) {
    console.log(
      `Time-to-connect — p50: ${percentile(connectTimes, 50).toFixed(0)}ms, ` +
        `p95: ${percentile(connectTimes, 95).toFixed(0)}ms, ` +
        `max: ${connectTimes[connectTimes.length - 1].toFixed(0)}ms`
    );
  }
  if (failures.length) {
    console.log(`Failure reasons: ${failures.join(", ")}`);
  }
  console.log(
    "\nNote: measures STUN-only (Google's public STUN server) connectivity on your " +
      "local network/machine. Your TURN relay fallback (Metered) is NOT exercised " +
      "here since this harness doesn't fetch /api/turn-credentials — most local-to-local " +
      "connections succeed via STUN/host candidates alone, so this number is an " +
      "optimistic case, not a worst-case NAT scenario.\n"
  );
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
