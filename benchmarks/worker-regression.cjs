// Runs the actual worker on a synthetic frame. No student media or remote model server.
const { build } = require("esbuild"),
  { chromium } = require("playwright"),
  http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, "output", "worker-validation");
fs.mkdirSync(out, { recursive: true });
(async () => {
  await build({
    entryPoints: [path.join(root, "frontend/src/workers/nsfwWorker.ts")],
    bundle: true,
    format: "esm",
    splitting: true,
    outdir: out,
    platform: "browser",
  });
  const requests = [];
  const server = http.createServer((req, res) => {
    const file = path.basename(req.url.split("?")[0]);
    if (file.endsWith(".js") && fs.existsSync(path.join(out, file))) {
      res.setHeader("Content-Type", "text/javascript");
      res.end(fs.readFileSync(path.join(out, file)));
    } else {
      res.setHeader("Content-Type", "text/html");
      res.end("<!doctype html><html><body>Worker validation</body></html>");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.context().on("request", (req) => requests.push(req.url()));
    await page.goto("http://localhost:" + server.address().port);
    const result = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const worker = new Worker("/nsfwWorker.js", { type: "module" }),
            timer = setTimeout(() => {
              worker.terminate();
              reject(new Error("Worker timed out"));
            }, 45000);
          worker.onerror = (e) => {
            clearTimeout(timer);
            worker.terminate();
            reject(new Error(e.message));
          };
          worker.onmessage = async ({ data }) => {
            if (data.type === "ERROR") {
              clearTimeout(timer);
              worker.terminate();
              reject(new Error(data.error || "Inference failed"));
            } else if (data.type === "READY") {
              const canvas = new OffscreenCanvas(224, 224);
              const ctx = canvas.getContext("2d");
              ctx.fillStyle = "#d8c8b5";
              ctx.fillRect(0, 0, 224, 224);
              const imageBitmap = await createImageBitmap(canvas);
              worker.postMessage(
                {
                  type: "CHECK_FRAME",
                  source: "local",
                  frameId: 1,
                  generation: "synthetic-test",
                  imageBitmap,
                },
                [imageBitmap],
              );
            } else if (data.type === "PREDICTION") {
              clearTimeout(timer);
              worker.terminate();
              resolve({
                type: data.type,
                source: data.source,
                frameId: data.frameId,
                generation: data.generation,
                classes: Object.keys(data.predictions),
              });
            }
          };
          worker.postMessage({ type: "INIT" });
        }),
    );
    assert.equal(result.type, "PREDICTION");
    assert.equal(result.generation, "synthetic-test");
    assert.equal(result.classes.length, 5);
    assert.ok(requests.every((url) => url.startsWith("http://localhost:")));
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify({ passed: true, result, externalRequests: 0 }, null, 2),
    );
    console.log(
      "PASS actual worker load and synthetic-frame inference, no external model requests",
    );
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
