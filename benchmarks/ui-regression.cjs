// Local-only browser harness: real dashboard, hook, matchmaking and WebRTC.
// Fake identity, database, TURN endpoint and classifier; no production accounts or services.
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const { build } = require("esbuild");
const { chromium } = require("playwright");
const { Server } = require("../backend/node_modules/socket.io");
const registerRoom = require("../backend/src/sockets/roomSocket"),
  registerMatch = require("../backend/src/sockets/matchSocket"),
  registerWebRTC = require("../backend/src/sockets/webrtcSocket");
const rooms = require("../backend/src/services/roomService"),
  presence = require("../backend/src/services/presenceService");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, "output", "ui-validation");
fs.mkdirSync(out, { recursive: true });
const assert = require("node:assert/strict");
(async () => {
  let io, browser;
  const saved = [];
  const db = {
    hasAccepted: async () => true,
    isUserBanned: async () => false,
    getCooldownRemaining: async () => 0,
    getBlockGraphForUsers: async (ids) =>
      new Map(ids.map((id) => [id, new Set()])),
    recordReport: async (...args) => {
      saved.push(args);
      return true;
    },
    blockUser: async () => true,
  };
  const server = http.createServer((req, res) => {
    if (req.url === "/api/turn-credentials") {
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify({ iceServers: [{ urls: "stun:localhost:9" }] }),
      );
    }
    const file =
      req.url === "/app.js"
        ? "app.js"
        : req.url === "/app.css"
          ? "app.css"
          : null;
    if (file) {
      res.setHeader(
        "Content-Type",
        file.endsWith(".js") ? "text/javascript" : "text/css",
      );
      return res.end(fs.readFileSync(path.join(out, file)));
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}h1,h2,h3,p{margin:0}button,input,select{font:inherit}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}a{color:inherit}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port,
    base = `http://localhost:${port}`;
  io = new Server(server, { cors: { origin: true } });
  require.cache[require.resolve("../backend/src/services/dbService")] = {
    exports: db,
  };
  const Queue = require("../backend/src/matchmaker/MatchmakerQueue");
  const queue = new Queue();
  io.use((socket, next) => {
    socket.user = { uid: socket.handshake.auth.token };
    next();
  });
  io.on("connection", (socket) => {
    registerRoom(socket, queue, rooms, db, io);
    registerMatch(socket, queue, db, rooms, io);
    registerWebRTC(socket, rooms);
    if (!presence.resume({ io, roomService: rooms, socket }))
      socket.emit("session_resume_result", { resumed: false });
  });
  const auth = `const user={uid:crypto.randomUUID(),getIdToken:async()=>user.uid};export const useAuth=()=>({user,loading:false});`;
  const mocks = {
    auth,
    router: "export const useRouter=()=>({replace(){},push(){}});",
    link: 'import React from "react";export default function Link(props){return React.createElement("a",props);}',
    moderation:
      "export const useNsfwModeration=({isActive})=>({moderationStatus:isActive?'unavailable':'inactive',isReady:false,isWarning:false,isRemoteWarning:false,isCooldownActive:false});",
  };
  await build({
    stdin: {
      contents:
        'import React from "react";import {createRoot} from "react-dom/client";import Dashboard from "./src/app/chat/components/chat/ChatDashboard";import {ThemeProvider} from "./src/context/themeContext";createRoot(document.getElementById("root")).render(<ThemeProvider><Dashboard/></ThemeProvider>);',
      loader: "tsx",
      resolveDir: path.join(root, "frontend"),
    },
    bundle: true,
    outfile: path.join(out, "app.js"),
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"development"',
      "process.env.NEXT_PUBLIC_CONNECTION_DIAGNOSTICS": '"false"',
      "process.env.NEXT_PUBLIC_BACKEND_URL": JSON.stringify(base),
    },
    nodePaths: [path.join(root, "frontend", "node_modules")],
    plugins: [
      {
        name: "test-boundaries",
        setup(b) {
          b.onResolve(
            {
              filter:
                /authContext|^next\/navigation$|^next\/link$|useNsfwModeration/,
            },
            (args) => ({
              path: args.path.includes("authContext")
                ? "auth"
                : args.path.includes("navigation")
                  ? "router"
                  : args.path.includes("link")
                    ? "link"
                    : "moderation",
              namespace: "qa",
            }),
          );
          b.onLoad({ filter: /.*/, namespace: "qa" }, (args) => ({
            contents: mocks[args.path],
            loader: "jsx",
            resolveDir: path.join(root, "frontend"),
          }));
        },
      },
    ],
  });
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    });
    const context = await browser.newContext({
      permissions: ["camera", "microphone"],
      viewport: { width: 1440, height: 900 },
    });
    const a = await context.newPage(),
      b = await context.newPage();
    const errors = [];
    for (const page of [a, b])
      page.on("pageerror", (error) => errors.push(error.message));
    await a.goto(base);
    await b.goto(base);
    assert.deepEqual(errors, []);
    await a.getByRole("button", { name: "Check camera & microphone" }).click();
    await a.waitForFunction(
      () =>
        document.querySelector('video[aria-label="Your camera preview"]')
          .srcObject?.active,
    );
    await a.getByRole("button", { name: "Mute mic", exact: true }).click();
    assert.equal(
      await a
        .locator('video[aria-label="Your camera preview"]')
        .evaluate((el) => el.srcObject.getAudioTracks()[0].enabled),
      false,
    );
    await a.getByRole("button", { name: "Unmute mic", exact: true }).click();
    await a.screenshot({ path: path.join(out, "camera-check-desktop.png") });
    await a.getByRole("button", { name: "Find a student" }).click();
    await b.getByRole("button", { name: "Find a student" }).click();
    for (const page of [a, b]) {
      await page.waitForFunction(
        () => {
          const v = document.querySelector('video[aria-label="Student video"]');
          return (
            v.videoWidth > 0 &&
            !document.querySelector("#chat-message").disabled
          );
        },
        { timeout: 20000 },
      );
    }
    await a.locator("#chat-message").fill("Hello campus");
    await a.getByRole("button", { name: "Send message" }).click();
    await b.getByText("Hello campus", { exact: true }).waitFor();
    const normalVideo = await a.locator(".video-stage").boundingBox();
    assert.ok(Math.abs(normalVideo.width / 1440 - 0.75) < 0.02);
    assert.ok(normalVideo.height / 900 > 0.9);
    await a.screenshot({ path: path.join(out, "normal-video-desktop.png") });
    await a.getByRole("button", { name: "Account", exact: true }).click();
    await a.getByRole("dialog", { name: "Account settings" }).waitFor();
    await a.getByRole("button", { name: "Stay here" }).click();
    assert.equal(await a.locator("#chat-message").isEnabled(), true);
    assert.equal(
      await a
        .getByRole("link", { name: "Community & privacy" })
        .getAttribute("href"),
      "/policies",
    );
    // Exercise sender backpressure and bounded history via a real channel with normal paced messages.
    await a.getByRole("button", { name: "Fullscreen", exact: false }).click();
    await a.locator(".chat-drawer").waitFor();
    for (const selector of [
      ".chat-drawer",
      ".chat-drawer .call-chat",
      ".chat-drawer .message",
    ]) {
      assert.equal(
        await a
          .locator(selector)
          .first()
          .evaluate((el) => getComputedStyle(el).backgroundColor),
        "rgba(0, 0, 0, 0)",
      );
    }
    assert.equal(
      await a
        .locator(".chat-drawer")
        .evaluate((el) => getComputedStyle(el).backdropFilter),
      "none",
    );
    const fullVideo = await a.locator(".video-stage").boundingBox();
    assert.ok(fullVideo.width >= 1438 && fullVideo.height >= 898);
    await a.getByRole("button", { name: "Hide chat" }).click();
    await a.getByRole("button", { name: "Show chat" }).click();
    assert.deepEqual(await a.locator(".video-stage").boundingBox(), fullVideo);
    const drawerBounds = await a.locator(".chat-drawer").boundingBox();
    const controlsBounds = await a.locator(".call-controls").boundingBox();
    assert.ok(drawerBounds.y + drawerBounds.height <= controlsBounds.y);
    await a.locator("#chat-message").fill("Focus chat works");
    await a.getByRole("button", { name: "Send message" }).click();
    await b.getByText("Focus chat works", { exact: true }).waitFor();
    await a.screenshot({ path: path.join(out, "focus-chat-desktop.png") });
    await a.getByRole("button", { name: "Devices", exact: true }).click();
    await a.getByRole("dialog").waitFor();
    await a.keyboard.press("Escape");
    await a
      .getByRole("button", { name: "Exit fullscreen", exact: false })
      .waitFor();
    await a.keyboard.press("Escape");
    await a.getByRole("button", { name: "Fullscreen", exact: false }).waitFor();
    const first = [...io.sockets.sockets.values()][0];
    first.conn.close();
    await new Promise((r) => setTimeout(r, 2500));
    await a
      .getByText("Connected to another student.", { exact: true })
      .waitFor();
    await a.locator("#chat-message").fill("After reconnect");
    await a.getByRole("button", { name: "Send message" }).click();
    await b.getByText("After reconnect", { exact: true }).waitFor();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await a.setViewportSize({ width, height: width === 768 ? 600 : 820 });
      await a.screenshot({
        path: path.join(out, `live-${width}.png`),
        fullPage: true,
      });
      assert.equal(
        await a.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `No horizontal overflow at ${width}`,
      );
      for (const label of [
        "Mute mic",
        "Camera off",
        "Next student",
        "End",
        "Safety",
      ])
        assert.equal(
          await a
            .getByRole("button", {
              name: label,
              exact: label !== "Next student",
            })
            .count(),
          1,
        );
    }
    await a.setViewportSize({ width: 1440, height: 900 });
    await a.getByRole("button", { name: "Camera off", exact: true }).click();
    assert.equal(
      await a
        .locator('video[aria-label="Your camera preview"]')
        .evaluate((el) => el.srcObject.getVideoTracks()[0].enabled),
      false,
    );
    await a.getByRole("button", { name: "Camera on", exact: true }).click();
    await a.getByRole("button", { name: "Devices", exact: true }).click();
    const camera = a.getByRole("dialog").getByRole("combobox").first();
    const device = await camera.inputValue();
    const oldTrack = await a
      .locator('video[aria-label="Your camera preview"]')
      .evaluate((el) => el.srcObject.getVideoTracks()[0].id);
    await camera.selectOption(device);
    await a.getByText("Device updated.", { exact: true }).first().waitFor();
    assert.notEqual(
      await a
        .locator('video[aria-label="Your camera preview"]')
        .evaluate((el) => el.srcObject.getVideoTracks()[0].id),
      oldTrack,
    );
    await a.getByRole("button", { name: "Done", exact: true }).click();
    await a.getByRole("button", { name: "Fit video", exact: true }).click();
    await a.getByRole("button", { name: "Fill video", exact: true }).click();
    for (let index = 0; index < 100; index++) {
      await a
        .locator("#chat-message")
        .fill(index === 99 ? "x".repeat(1000) : `Message ${index + 1}`);
      await a.getByRole("button", { name: "Send message" }).click();
      await new Promise((r) => setTimeout(r, 220));
    }
    await b.getByText("x".repeat(1000), { exact: true }).waitFor();
    await b.locator(".message-log").evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event("scroll"));
    });
    await a.locator("#chat-message").fill("A new message while reading");
    await a.getByRole("button", { name: "Send message" }).click();
    await b.getByRole("button", { name: "New messages" }).waitFor();
    assert.equal(
      await b.locator(".message-log").evaluate((el) => el.scrollTop),
      0,
    );
    await b.getByRole("button", { name: "New messages" }).click();
    await a
      .getByRole("button", { name: "Expand self preview", exact: true })
      .click();
    await a.getByRole("button", { name: "Hide chat" }).click();
    await a.getByRole("button", { name: "Show chat" }).click();
    await a.locator("#chat-message").fill("Self view chat works");
    await a.getByRole("button", { name: "Send message" }).click();
    await b.getByText("Self view chat works", { exact: true }).waitFor();
    await a.keyboard.press("Escape");
    await a.getByRole("button", { name: "Use dark theme" }).click();
    await a.screenshot({ path: path.join(out, "live-dark-long-log.png") });
    await a.getByRole("button", { name: "Use light theme" }).click();
    await a.setViewportSize({ width: 720, height: 450 });
    await a.screenshot({
      path: path.join(out, "short-height-zoom-equivalent.png"),
      fullPage: true,
    });
    assert.equal(
      await a.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await a.setViewportSize({ width: 390, height: 844 });
    await a.getByRole("button", { name: "Fullscreen", exact: false }).click();
    await a.getByRole("button", { name: "Hide chat" }).click();
    await a.getByRole("button", { name: "Show chat" }).click();
    await a.screenshot({ path: path.join(out, "focus-chat-mobile.png") });
    for (const [width, height] of [
      [390, 844],
      [320, 700],
      [720, 450],
    ]) {
      await a.setViewportSize({ width, height });
      await a.waitForFunction(() => {
        const drawer = document
          .querySelector(".chat-drawer")
          ?.getBoundingClientRect();
        const controls = document
          .querySelector(".call-controls")
          ?.getBoundingClientRect();
        const composer = document
          .querySelector(".message-composer")
          ?.getBoundingClientRect();
        return (
          drawer &&
          controls &&
          composer &&
          drawer.bottom <= controls.top &&
          composer.bottom <= drawer.bottom + 1
        );
      });
      const video = await a.locator(".video-stage").boundingBox();
      const drawer = await a.locator(".chat-drawer").boundingBox();
      const controls = await a.locator(".call-controls").boundingBox();
      assert.ok(video.width >= width - 2 && video.height >= height - 2);
      assert.ok(drawer.y + drawer.height <= controls.y);
      assert.ok(drawer.y >= 0 && drawer.x >= 0);
      assert.ok(controls.y + controls.height <= height);
      assert.ok(await a.locator("#chat-message").isVisible());
      if (height >= 650) {
        const preview = await a.locator(".self-preview").boundingBox();
        assert.ok(preview.y + preview.height <= drawer.y);
      }
      await a.screenshot({
        path: path.join(out, `fullscreen-${width}-${height}.png`),
      });
    }
    await a.setViewportSize({ width: 390, height: 844 });
    const bubble = a.getByRole("button", { name: "Chat bubble", exact: true });
    await bubble.click();
    assert.equal(await a.locator(".chat-drawer").count(), 0);
    await b.locator("#chat-message").fill("Unread mobile message");
    await b.getByRole("button", { name: "Send message" }).click();
    await bubble.locator(".unread-badge").waitFor();
    assert.equal(await bubble.locator(".unread-badge").innerText(), "1");
    assert.equal(
      await a
        .getByRole("button", { name: "Show chat", exact: true })
        .locator(".unread-badge")
        .innerText(),
      "1",
    );
    await a.screenshot({ path: path.join(out, "mobile-chat-unread.png") });
    await bubble.click();
    await a.getByText("Unread mobile message", { exact: true }).waitFor();
    await a.waitForFunction(
      () => document.querySelectorAll(".unread-badge").length === 0,
    );
    await a.locator("#chat-message").fill("Draft stays after minimizing");
    await bubble.click();
    await bubble.click();
    assert.equal(
      await a.locator("#chat-message").inputValue(),
      "Draft stays after minimizing",
    );
    await a.locator("#chat-message").fill("");
    await a.locator(".message-log").evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event("scroll"));
    });
    await b
      .locator("#chat-message")
      .fill("Unread while reading older messages");
    await b.getByRole("button", { name: "Send message" }).click();
    await bubble.locator(".unread-badge").waitFor();
    await a.getByRole("button", { name: "New messages" }).click();
    await a.waitForFunction(
      () => document.querySelectorAll(".unread-badge").length === 0,
    );
    await bubble.click();
    await b.locator("#chat-message").fill("Unread stays after removing bubble");
    await b.getByRole("button", { name: "Send message" }).click();
    await bubble.locator(".unread-badge").waitFor();
    const head = await bubble.boundingBox();
    await a.mouse.move(head.x + 28, head.y + 28);
    await a.mouse.down();
    await a.mouse.move(head.x + 16, head.y + 50, { steps: 3 });
    const remove = a.getByRole("button", {
      name: "Remove chat bubble",
      exact: true,
    });
    await remove.waitFor();
    const target = await remove.boundingBox();
    await a.mouse.move(
      target.x + target.width / 2,
      target.y + target.height / 2,
      { steps: 10 },
    );
    await a.screenshot({ path: path.join(out, "mobile-bubble-remove.png") });
    await a.mouse.up();
    assert.equal(await bubble.count(), 0);
    assert.equal(await a.locator(".chat-drawer").count(), 0);
    assert.equal(
      await a
        .getByRole("button", { name: "Show chat", exact: true })
        .locator(".unread-badge")
        .innerText(),
      "1",
    );
    await a.getByRole("button", { name: "Show chat", exact: true }).click();
    await bubble.waitFor();
    await a
      .getByText("Unread stays after removing bubble", { exact: true })
      .waitFor();
    await a.waitForFunction(
      () => document.querySelectorAll(".unread-badge").length === 0,
    );
    await a.screenshot({ path: path.join(out, "transparent-mobile-chat.png") });
    const touch = await context.newCDPSession(a);
    await touch.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 1,
    });
    const restoredHead = await bubble.boundingBox();
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: restoredHead.x + 28, y: restoredHead.y + 28 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 24, y: 220 }],
    });
    await a
      .getByRole("button", { name: "Remove chat bubble", exact: true })
      .waitFor();
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await bubble.waitFor();
    assert.equal(await a.locator(".chat-remove-target").count(), 0);
    await bubble.focus();
    await a.keyboard.press("Enter");
    await a.locator("#chat-message").waitFor();
    await a.keyboard.press("Delete");
    assert.equal(await bubble.count(), 0);
    await a.getByRole("button", { name: "Show chat", exact: true }).click();
    await bubble.waitFor();
    await touch.detach();
    await a.screenshot({ path: path.join(out, "mobile-chat-restored.png") });
    await a.keyboard.press("Escape");
    await a.getByRole("button", { name: "Safety", exact: true }).click();
    await a.getByRole("dialog").waitFor();
    await a.keyboard.press("Escape");
    assert.equal(await a.getByRole("dialog").count(), 0);
    await a.getByRole("button", { name: "Fullscreen", exact: false }).click();
    await a.getByRole("button", { name: "End", exact: true }).click();
    await a.getByRole("button", { name: "Find a student" }).click();
    await b.getByRole("button", { name: "Next student" }).click();
    await a
      .getByText("Connected to another student.", { exact: true })
      .waitFor();
    assert.equal(await bubble.count(), 0, "new calls reset the old bubble");
    await a.getByRole("button", { name: "Show chat", exact: true }).click();
    await a.waitForFunction(
      () => !document.querySelector("#chat-message").disabled,
    );
    assert.equal(
      await a
        .getByRole("button", { name: "Exit fullscreen", exact: false })
        .count(),
      0,
      "a new call cannot inherit an ended focus mode",
    );
    await a.getByRole("button", { name: "Safety", exact: true }).click();
    await a.getByRole("button", { name: "Report & end call" }).click();
    await a
      .getByText("Report saved for review. Your call has ended.", {
        exact: true,
      })
      .waitFor();
    assert.equal(saved.length, 1);
    assert.equal(
      await a
        .locator('video[aria-label="Your camera preview"]')
        .evaluate((el) => el.srcObject),
      null,
    );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify(
        {
          passed: true,
          checks: [
            "real two-peer audio/video capture and decoded video",
            "open data channel text",
            "mute track state",
            "focus drawer text",
            "transparent fullscreen chat surfaces without backdrop blur",
            "mobile bubble open/minimize and draft preservation",
            "incoming-only unread badges on toolbar and bubble; reading clears them",
            "drag to remove bubble preserves history and unread state; toolbar restores it",
            "touch drag cancellation and keyboard bubble dismissal",
            "normal video uses 75% of desktop width and over 90% of height",
            "fullscreen video fills viewport; toggling chat never resizes it",
            "fullscreen drawer clears controls at desktop, mobile and short heights",
            "device dialog works in fullscreen and Escape returns to the call",
            "same-page signaling resume",
            "320/390/768/1024/1440 overflow",
            "mobile focus drawer",
            "safety dialog Escape",
            "camera toggle and live device replacement",
            "fit/fill",
            "100 messages and 1000-character token",
            "preserved reading position and New messages",
            "self expansion with text",
            "both themes",
            "short height / 200-percent layout equivalent",
            "End and Next restart into a fresh normal view",
            "report persistence acknowledgement",
            "capture cleared after report",
          ],
          errors,
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS browser UI and two-peer WebRTC; artifacts in output/ui-validation",
    );
  } finally {
    await browser?.close();
    for (const roomId of [...rooms.getAllRooms().keys()])
      presence.endRoom({ io, roomService: rooms, roomId });
    await io.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
