const test = require("node:test"),
  assert = require("node:assert/strict"),
  http = require("node:http"),
  express = require("express");
const realFetch = global.fetch;
require.cache[require.resolve("../src/middleware/httpFIrebaseAuth")] = {
  exports: (req, res, next) => {
    req.user = { uid: "fake-verified-user" };
    next();
  },
};
require.cache[require.resolve("../src/services/dbService")] = {
  exports: { isUserBanned: async () => false },
};
process.env.METERED_APP_NAME = "local-test";
process.env.TURN_API_KEY = "not-a-real-secret";
const router = require("../src/routes/turn");
test("credential requests coalesce, validate schema and bound a hung provider", async () => {
  const app = express();
  app.use("/credentials", router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + server.address().port + "/credentials";
  try {
    let requests = 0;
    global.fetch = async () => {
      requests++;
      await new Promise((r) => setTimeout(r, 40));
      return {
        ok: true,
        json: async () => [
          {
            urls: [
              "turn:local:3478?transport=udp",
              "turns:local:443?transport=tcp",
            ],
            username: "fake",
            credential: "fake",
          },
        ],
      };
    };
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => realFetch(url)),
    );
    assert.ok(responses.every((r) => r.status === 200));
    assert.equal(requests, 1);
    assert.equal(responses[0].headers.get("cache-control"), "no-store");
    global.fetch = async () => ({
      ok: true,
      json: async () => [
        { urls: "https://invalid.local", credential: "secret" },
      ],
    });
    let response = await realFetch(url);
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes("secret"));
    for (const status of [401, 403, 429, 502]) {
      global.fetch = async () => ({ ok: false, status });
      response = await realFetch(url);
      assert.equal(response.status, 502);
    }
    global.fetch = (_, { signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        }),
      );
    const started = Date.now();
    response = await realFetch(url);
    assert.equal(response.status, 502);
    assert.ok(
      Date.now() - started < 7000,
      "hung credential provider terminates",
    );
  } finally {
    global.fetch = realFetch;
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
