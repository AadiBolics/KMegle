# KMegle Benchmarks

Standalone, reproducible scripts that measure real performance/scale
characteristics of the app — no hand-wavy numbers. Each subfolder is a
self-contained test with its methodology documented in the script itself
and raw output saved under `results/`.

## Index

| Test | Status | Script | Results |
|---|---|---|---|
| Matchmaker DB round-trip scaling | Done | [`matchmaker/benchmark.js`](matchmaker/benchmark.js) | [results/matchmaker-random-blocking.txt](results/matchmaker-random-blocking.txt), [results/matchmaker-clustered-worst-case.txt](results/matchmaker-clustered-worst-case.txt) |
| Socket.IO concurrent connections / matchmaking latency | Done | [`socketio-load/benchmark.js`](socketio-load/benchmark.js) | [results/socketio-load-local.txt](results/socketio-load-local.txt) |
| HTTP route throughput & rate-limit verification | Done | [`http-load/benchmark.js`](http-load/benchmark.js) | [results/http-load.txt](results/http-load.txt) |
| WebRTC real connection success rate | Done | [`webrtc-pairing/benchmark.js`](webrtc-pairing/benchmark.js) | [results/webrtc-pairing.txt](results/webrtc-pairing.txt) |

---

## 1. Matchmaker DB round-trip scaling

**This went through two rounds of optimization, driven by real load-test
findings — the second round only exists because the Socket.IO load test
below (section 2) exposed that the first "fix" wasn't actually enough.**

**v1 (superseded):** one `dbService.getBlockedIds()` call per queued
*user* per matching pass (down from one `hasBlocked()` call per candidate
*pair* — O(n²) worst case — in the original code). This was a real
improvement in the worst case, but testing against a real backend (section
2) showed N sequential round-trips was *itself* the bottleneck once queue
size reached the low hundreds, because `MatchmakerQueue.tryMatch()`
processes the whole queue under a single lock, one `await` at a time.

**v2 (current):** one `dbService.getBlockGraphForUsers()` call for the
*entire* queue per matching pass — a single
`WHERE blocker_id = ANY($1) OR blocked_id = ANY($1)` query instead of N
individual queries. DB round-trips per pass are now **O(1)**, period,
regardless of queue size or block density.

**Results — v2 vs. the original O(n²) algorithm, both scenarios:**

```
Typical case (~15% of pairs randomly blocked):
queue size | legacy DB calls | legacy est. time | current DB calls | current est. time | call reduction
----------------------------------------------------------------------------------------------------
20         |              12 |               96ms |                 1 |                 8ms | 92% fewer calls
50         |              31 |              248ms |                 1 |                 8ms | 97% fewer calls
100        |              63 |              504ms |                 1 |                 8ms | 98% fewer calls
150        |              87 |              696ms |                 1 |                 8ms | 99% fewer calls
200        |             119 |              952ms |                 1 |                 8ms | 99% fewer calls

Worst case (a mutually-blocked cluster covering 50% of the queue):
queue size | legacy DB calls | legacy est. time | current DB calls | current est. time | call reduction
----------------------------------------------------------------------------------------------------
50         |             121 |              968ms |                 1 |                 8ms | 99% fewer calls
100        |             671 |             5368ms |                 1 |                 8ms | 100% fewer calls
150        |            1846 |            14768ms |                 1 |                 8ms | 100% fewer calls
200        |            3646 |            29168ms |                 1 |                 8ms | 100% fewer calls
300        |            3796 |            30368ms |                 1 |                 8ms | 100% fewer calls
```

Unlike v1 (which had an honest trade-off — fewer worst-case calls, but
*more* typical-case calls than the original), v2 is a strict improvement
in **every** scenario, because it doesn't scale with queue size at all.

**The number that actually matters is in section 2, not this synthetic
benchmark:** this script proves the algorithm is O(1) in isolation, but
the real, authoritative evidence that it fixes anything is the live
Socket.IO test below going from a 42%-72% failure rate at 250-300
concurrent users to **100% success at 500** after this change shipped.

**Reproduce it yourself:**
```
node benchmarks/matchmaker/benchmark.js --sizes=20,50,100,150,200
node benchmarks/matchmaker/benchmark.js --sizes=50,100,150,200,300 --cluster=0.5
```

---

## 2. Socket.IO concurrent connections / matchmaking latency

**What it tests:** real, Firebase-authenticated Socket.IO clients
(`socket.io-client`) connecting to a running backend and going through the
actual matchmaking flow — connect, emit `find_match`, wait for
`match_found` — exactly like the real frontend does. Test accounts are
genuine throwaway Firebase Auth users (`@gmail.com`, created via
`firebase-admin`, deleted again after each round) so the backend's real
auth middleware is exercised, not mocked.

**Why this needed real accounts, not mocks:** the backend's `firebaseAuth`
middleware verifies a real signed ID token — there's no way to load-test
the actual authenticated connection path without either modifying
production auth code (which we don't want to do just for a benchmark) or
provisioning real, if temporary, accounts. `provisionTestUsers.js` mints a
Firebase custom token per test user and exchanges it for a real ID token
via the Identity Toolkit REST API, the same exchange the Firebase client
SDK does internally — no browser needed.

**This test drove two real fixes — the story is the valuable part, not
just the final number.**

### Round 1 — baseline: default `pg.Pool` (max=10), one DB call per queued user

```
concurrent users | connected | matched | match latency p50 | p95 | p99 | errors/timeouts
----------------------------------------------------------------------------------------------------
4                 | 4         | 4       | 246ms             | 531ms | 531ms | 0
10                | 10        | 10      | 422ms             | 541ms | 541ms | 0
80                | 80        | 80      | 3435ms            | 5243ms | 5351ms | 0
150               | 150       | 150     | 7974ms            | 12502ms | 12887ms | 0
200               | 200       | 190     | 9796ms            | 14593ms | 15066ms | 10
250               | 250       | 70      | 9054ms            | 11035ms | 11165ms | 180
300               | 300       | 174     | 9996ms            | 13875ms | 14265ms | 126
```

100% success through n=150, then a sharp cliff: 5% failures at 200,
jumping to 72% at 250. A sharp jump rather than gradual decay is the
signature of a shared resource hitting saturation. Diagnosis: every
connecting socket independently fires `banCheck`'s ban query and
`find_match`'s cooldown query *in parallel* — with `pg.Pool`'s default
`max: 10`, ~290 of 300 simultaneous queries queue up behind 10 connections.

### Round 2 — after raising `pg.Pool` max to 50

```
concurrent users | connected | matched | match latency p50 | p95 | p99 | errors/timeouts
----------------------------------------------------------------------------------------------------
150               | 150       | 150     | 4922ms            | 9119ms | 9488ms | 0
200               | 200       | 200     | 6914ms            | 12027ms | 12473ms | 0
250               | 250       | 250     | 9259ms            | 15752ms | 16306ms | 0
260               | 260       | 260     | 9244ms            | 16034ms | 16611ms | 0
280               | 280       | 208     | 9285ms            | 17476ms | 17994ms | 72
300               | 300       | 134     | 6566ms            | 16159ms | 18044ms | 166
```

Ceiling moved from ~150 to ~260 (roughly doubled) — real progress, but
not enough. And the pool wasn't even the limit anymore at this point:
latency at n=200-260 was already ~9s p50 / ~16s p95, dangerously close to
this test's own 20s match-timeout. The new bottleneck was structural:
`MatchmakerQueue.tryMatch()` processes the whole queue under a single
lock, one DB call at a time — at ~35-40ms per real Neon round-trip, a
300-user pass needed ~10-12s of DB latency alone, no matter how big the
connection pool was.

### Round 3 — after replacing N per-user queries with 1 batched query per pass

```
concurrent users | connected | matched | match latency p50 | p95 | p99 | errors/timeouts
----------------------------------------------------------------------------------------------------
10                | 10        | 10      | 165ms             | 356ms | 356ms | 0
50                | 50        | 50      | 156ms             | 291ms | 329ms | 0
150               | 150       | 150     | 413ms             | 469ms | 482ms | 0
300               | 300       | 300     | 812ms             | 950ms | 979ms | 0
400               | 400       | 400     | 1159ms            | 1339ms | 1354ms | 0
500               | 500       | 500     | 1413ms            | 1648ms | 1672ms | 0
```

**100% success at every size tested, through n=500** — matching latency
dropped from ~10s to ~1.4s *at the same concurrency*, because the
matchmaker now makes exactly one DB round-trip per pass instead of N.

**Caveats:**
- Measures your **local machine** running the backend process, not your
  production host's (e.g. Render free tier: 0.1 CPU, 512MB RAM) capacity
  — not yet tested against the real deployment.
- Each round queues exactly N load-test users with no other real traffic
  in the same queue.
- The load-test *client* itself hit a V8 out-of-memory crash around 540
  cumulative socket.io-client instances in one Node process — a limit of
  the test harness, not the backend (mitigated with
  `node --max-old-space-size=4096` when running this script at high n).
- Two transient Firebase Admin API quirks were hit and fixed during
  testing (an occasional false-negative "already exists" on account
  creation, and a delete-quota hit under heavy consecutive load) — see
  `provisionTestUsers.js` and `results/socketio-load-local.txt` for
  details. Verified zero orphaned test accounts after every run.

**Reproduce it yourself** (needs `backend/.env` and `frontend/.env.local`
populated locally, and a backend instance running):
```
node --max-old-space-size=4096 benchmarks/socketio-load/benchmark.js --sizes=10,50,150,300,500
```

## 3. HTTP route throughput & rate-limit verification

**What it tests:** the app's HTTP routes are intentionally rate-limited
quite strictly (20 req/min on `/api/turn-credentials` and `/api/admin`,
100 req/min elsewhere) via `express-rate-limit`. A raw "requests/sec"
throughput number isn't a meaningful claim for a deliberately-throttled
API, so this test instead (1) measures real per-request latency on the
unauthenticated health check, and (2) confirms the rate limiter enforces
its configured threshold *exactly*, using a real authenticated test user.

**Results:**

```
/api/health (50 sequential requests, no auth):
  p50: 1.1ms | p95: 2.0ms | p99: 41.4ms | max: 41.4ms

/api/turn-credentials rate limit (25 sequential authenticated requests):
  20/25 succeeded, 5/25 rate-limited (429)
  First 429 on request #21 — exactly matches the configured 20 req/min limit.
```

The limiter's threshold landed on *exactly* request #21 in a clean 60s
window — not "roughly 20," precisely 20. Re-running the test within the
same 60-second window (done once, unintentionally) showed every request
immediately rejected, which is further confirmation the rate-limit state
correctly persists per-client across requests rather than resetting on
each new connection.

**Caveat:** don't re-run this within 60s of a previous run against the
same backend process — you'll see pre-exhausted rate-limit state, not a
fresh measurement (see `results/http-load.txt` for exactly this happening).

## 4. WebRTC real connection success rate

**What it tests:** real headless Chromium instances (Playwright, two per
pair, with `--use-fake-device-for-media-stream` providing a synthetic
camera/mic) going through the *actual* signaling sequence — connect,
`find_match`, `match_found`, offer/answer/ICE candidate exchange — against
the real backend, then checking whether `RTCPeerConnection.connectionState`
actually reaches `"connected"`. This is the only test in this suite that
exercises real browser WebRTC/ICE negotiation rather than application
logic alone.

**Why not drive the real Next.js app directly:** its only sign-in path is
a Google OAuth popup, which can't be automated headlessly without a
separate OAuth-automation setup. Instead, `harness.html` is a minimal
standalone page — not part of the deployed app — that takes an
already-obtained Firebase ID token as a URL param (minted the same way the
Socket.IO load test does it) and replays the *same* signaling/WebRTC
sequence as `useChatSession.ts` line-for-line. Only the auth bootstrapping
is simplified; the thing actually being measured — real ICE negotiation
against the real backend — is not.

**A bug in the harness itself, caught and fixed:** the first run at scale
showed 16/20 (80%) success with two failures reading `"io is not
defined"`. That's not an app bug — the harness originally loaded
`socket.io-client` from a public CDN, and under concurrent multi-browser
load that fetch occasionally lost a race against the inline script that
needed it. Vendoring the library locally (served from the same tiny Node
HTTP server as the harness page, no CDN dependency) made the flakiness
disappear entirely on re-run. Documented because an interviewer asking
"how do you know your test itself isn't the problem" is a question worth
having a real answer to.

**Results** (after the fix, 15 pairs / 30 individual peer connections):

```
30/30 peers established a working connection (100%)
Time-to-connect — p50: 525ms, p95: 1058ms, max: 1071ms
```

**Caveats — read before quoting this number:**
- This measures **STUN-only** connectivity (Google's public STUN server)
  between two processes on the same local machine/network. Both peers
  resolve to local/loopback-adjacent ICE candidates almost immediately —
  this is the *easy* NAT case. The harness does not call
  `/api/turn-credentials`, so the TURN relay fallback (for genuinely
  restrictive NATs, e.g. two people on different cellular/corporate
  networks) is **not exercised here**. A 100% success rate under these
  conditions is not evidence the TURN fallback path works — it's evidence
  the signaling + happy-path ICE negotiation works.
- Sample size is 30 connections — enough to say "the happy path reliably
  works," not enough to bound a tail/rare-failure rate precisely.

**Reproduce it yourself:**
```
node benchmarks/webrtc-pairing/benchmark.js --pairs=15
```
