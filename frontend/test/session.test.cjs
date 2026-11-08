const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { act, create } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;
function harness() {
  let state,
    tree,
    resolveCamera,
    captures = 0;
  const sockets = [],
    peers = [],
    timers = new Map();
  let timerId = 0;
  const track = (kind) => ({
    kind,
    enabled: true,
    readyState: "live",
    stop() {
      this.readyState = "ended";
    },
    getSettings() {
      return { deviceId: kind + "-1" };
    },
  });
  const stream = () => {
    const tracks = [track("audio"), track("video")];
    return {
      getTracks: () => tracks,
      getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
    };
  };
  const media = {
    getUserMedia: () => {
      captures++;
      return new Promise((resolve) => {
        resolveCamera = resolve;
      });
    },
    enumerateDevices: async () => [],
    addEventListener() {},
    removeEventListener() {},
  };
  class Peer {
    constructor() {
      this.connectionState = "new";
      this.signalingState = "stable";
      this.iceConnectionState = "new";
      this.senders = [];
      peers.push(this);
    }
    addTrack(track) {
      this.senders.push({
        track,
        replaceTrack: async (t) => {
          this.senders.find((s) => s.track === track).track = t;
        },
      });
    }
    getSenders() {
      return this.senders;
    }
    createDataChannel() {
      const dc = {
        readyState: "connecting",
        bufferedAmount: 0,
        close() {
          this.readyState = "closed";
        },
        send() {},
      };
      this.dc = dc;
      return dc;
    }
    async createOffer(opts) {
      this.offers = (this.offers || []).concat(opts);
      return { type: "offer", sdp: "fake" };
    }
    async createAnswer() {
      return { type: "answer", sdp: "fake" };
    }
    async setLocalDescription(d) {
      this.localDescription = d;
      this.signalingState = d.type === "offer" ? "have-local-offer" : "stable";
    }
    async setRemoteDescription(d) {
      this.remoteDescription = d;
      this.signalingState = d.type === "offer" ? "have-remote-offer" : "stable";
    }
    async addIceCandidate(c) {
      (this.added ||= []).push(c);
    }
    close() {
      this.connectionState = "closed";
    }
  }
  const io = () => {
    const handlers = {};
    const s = {
      connected: false,
      active: true,
      out: [],
      io: { on() {} },
      on(event, fn) {
        handlers[event] = fn;
      },
      once(event, fn) {
        handlers[event] = fn;
      },
      server(event, data) {
        return handlers[event]?.(data);
      },
      emit(event, ...args) {
        this.out.push([event, ...args]);
        const cb = args.at(-1);
        if (event === "find_match" && typeof cb === "function")
          cb(null, { ok: true });
      },
      timeout() {
        return this;
      },
      async emitWithAck(event, packet) {
        this.out.push([event, packet]);
        return this.reply || { ok: true };
      },
      connect() {
        this.connected = true;
        this.server("connect");
      },
      removeAllListeners() {
        for (const key of Object.keys(handlers)) delete handlers[key];
      },
      disconnect() {
        this.connected = false;
      },
    };
    sockets.push(s);
    return s;
  };
  const user = { uid: "test", getIdToken: async () => "fake-token" };
  const code = ts.transpileModule(
    fs.readFileSync("src/app/chat/hooks/useChatSession.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const mod = { exports: {} };
  const context = {
    performance: { now: () => 0 },
    exports: mod.exports,
    module: mod,
    require: (name) =>
      name === "react"
        ? React
        : name === "socket.io-client"
          ? { io }
          : name.includes("authContext")
            ? { useAuth: () => ({ user, loading: false }) }
            : {},
    navigator: { mediaDevices: media },
    location: { hostname: "localhost", origin: "http://localhost:3000" },
    process: { env: {} },
    crypto: require("node:crypto").webcrypto,
    DOMException,
    AbortController,
    RTCPeerConnection: Peer,
    MediaStream: class {},
    fetch: async () => ({
      ok: true,
      json: async () => ({
        iceServers: [{ urls: "turn:test", username: "u", credential: "c" }],
      }),
    }),
    setTimeout: (fn, ms) => {
      const id = ++timerId;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    console,
  };
  vm.runInNewContext(code, context);
  function Probe() {
    state = mod.exports.useChatSession();
    return null;
  }
  return {
    async mount() {
      await act(async () => {
        tree = create(React.createElement(Probe));
      });
    },
    async unmount() {
      await act(async () => tree.unmount());
    },
    async run(fn) {
      await act(fn);
    },
    get state() {
      return state;
    },
    get captures() {
      return captures;
    },
    get socket() {
      return sockets.at(-1);
    },
    get peer() {
      return peers.at(-1);
    },
    peers,
    timers,
    stream,
    resolve(s) {
      resolveCamera(s);
    },
  };
}
test("pending permission then Stop: late tracks stop and capture never retries", async () => {
  const h = harness();
  await h.mount();
  let pending;
  await h.run(async () => {
    pending = h.state.prepareCamera();
  });
  assert.equal(h.captures, 1);
  await h.run(async () => h.state.stop());
  const s = h.stream();
  await h.run(async () => {
    h.resolve(s);
    await pending;
  });
  assert.ok(s.getTracks().every((t) => t.readyState === "ended"));
  assert.equal(h.captures, 1);
  assert.equal(h.state.localStream, null);
  await h.unmount();
});
test("a failed safety request reconnects only to retry its captured target and never restarts capture", async () => {
  const h = harness();
  await h.mount();
  let pending;
  await h.run(async () => {
    pending = h.state.start();
  });
  await h.run(async () => {
    h.resolve(h.stream());
    await pending;
  });
  const original = h.socket;
  await h.run(async () =>
    original.server("match_found", {
      roomId: "reported-room",
      sessionNonce: "reported-nonce",
      role: "responder",
    }),
  );
  original.reply = { ok: false, message: "Database unavailable" };
  await h.run(async () => h.state.reportUser("Harassment"));
  assert.equal(h.state.safetyRetry, true);
  assert.equal(h.state.localStream, null);
  await h.run(async () =>
    original.server("disconnect", "io server disconnect"),
  );
  await h.run(async () => h.state.retrySafety());
  assert.equal(h.captures, 1);
  assert.notEqual(h.socket, original);
  assert.equal(
    h.socket.out.find((packet) => packet[0] === "report_user")[1].roomId,
    "reported-room",
  );
  assert.equal(h.socket.connected, false, "temporary retry transport closes");
  assert.equal(h.state.safetyRetry, false);
  assert.match(h.state.status, /Report saved/);
  await h.unmount();
});
test("preview and Start share capture; late unmount cannot reopen devices", async () => {
  const h = harness();
  await h.mount();
  let a, b;
  await h.run(async () => {
    a = h.state.prepareCamera();
    b = h.state.start();
  });
  assert.equal(h.captures, 1);
  await h.unmount();
  const s = h.stream();
  await h.run(async () => {
    h.resolve(s);
    await Promise.all([a, b]);
  });
  assert.equal(h.captures, 1);
  assert.ok(s.getTracks().every((t) => t.readyState === "ended"));
  assert.equal(h.socket, undefined);
});
test("real hook retains negotiation deadline, initiator role and rejects old match events", async () => {
  const h = harness();
  await h.mount();
  let pending;
  await h.run(async () => {
    pending = h.state.start();
  });
  await h.run(async () => {
    h.resolve(h.stream());
    await pending;
  });
  const socket = h.socket;
  const first = {
    roomId: "room-1",
    sessionNonce: "nonce-1",
    role: "initiator",
  };
  await h.run(async () => socket.server("match_found", first));
  const pc = h.peer;
  const staleDeadline = [...h.timers.values()].find((t) => t.ms === 18000).fn;
  assert.ok(
    [...h.timers.values()].some((t) => t.ms === 18000),
    "deadline remains after peer creation",
  );
  assert.equal(pc.offers.length, 1);
  await h.run(async () => {
    await socket.server("webrtc_answer", {
      ...first,
      negotiationId: 0,
      answer: { type: "answer", sdp: "answer" },
    });
    pc.connectionState = "failed";
    pc.onconnectionstatechange();
    await Promise.resolve();
  });
  assert.equal(pc.offers.length, 2, "assigned initiator sends ICE restart");
  assert.equal(pc.offers[1].iceRestart, true);
  await h.run(async () => {
    pc.oniceconnectionstatechange();
  });
  assert.equal(pc.offers.length, 2, "recovery triggers coalesce");
  await h.run(async () => h.state.next());
  await h.run(async () =>
    socket.server("match_found", {
      roomId: "room-2",
      sessionNonce: "nonce-2",
      role: "responder",
    }),
  );
  const current = h.peer;
  await h.run(async () => {
    staleDeadline();
    socket.server("stranger_disconnected", first);
    await socket.server("webrtc_offer", {
      ...first,
      negotiationId: 0,
      offer: { type: "offer", sdp: "stale" },
    });
  });
  assert.equal(h.state.roomId, "room-2");
  assert.equal(current.remoteDescription, undefined);
  assert.equal(h.state.channelReady, false);
  await h.run(async () => {
    current.ondatachannel({ channel: pc.dc });
    pc.dc.readyState = "open";
    pc.dc.onopen();
  });
  assert.equal(h.state.channelReady, true);
  const incoming = h.stream();
  await h.run(async () => {
    current.ontrack({ streams: [incoming], track: incoming.getTracks()[1] });
    current.connectionState = "connected";
    current.onconnectionstatechange();
  });
  assert.equal(
    h.state.connectionPhase,
    "negotiating",
    "transport and early tracks alone cannot claim live",
  );
  await h.run(async () => h.state.markMediaReady(incoming));
  assert.equal(h.state.connectionPhase, "live");
  await h.unmount();
});
