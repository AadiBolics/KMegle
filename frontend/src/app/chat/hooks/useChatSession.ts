"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "../../../context/authContext";
import { ChatMessage, ConnectionPhase } from "../types/chat";

type Match = { roomId: string; sessionNonce: string; role?: string };
type Signal = Match & {
  negotiationId: number;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};
type Call = Match & {
  pc: RTCPeerConnection;
  epoch: number;
  initiator: boolean;
  candidates: Map<number, RTCIceCandidateInit[]>;
  timer?: ReturnType<typeof setTimeout>;
  recovery?: ReturnType<typeof setTimeout>;
  disconnect?: ReturnType<typeof setTimeout>;
  restarting: boolean;
  playable: boolean;
};
const constraints: MediaStreamConstraints = {
  video: {
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 24, max: 30 },
  },
  audio: { echoCancellation: true, noiseSuppression: true },
};
const baseIce: RTCConfiguration = {
  iceTransportPolicy: "all",
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};
const diagnosticsEnabled =
  process.env.NEXT_PUBLIC_CONNECTION_DIAGNOSTICS === "true";
function origin() {
  return /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000"
    : location.origin;
}
function api(path: string) {
  return /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? `${origin()}/api/${path}`
    : `/api/backend/${path}`;
}
async function getToken(
  user: { getIdToken: () => Promise<string> },
  signal?: AbortSignal,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let cancel: () => void = () => {};
  const deadline = new Promise<never>((_, reject) => {
    cancel = () => reject(new DOMException("Request cancelled", "AbortError"));
    timeout = setTimeout(
      () => reject(new Error("Sign-in timed out. Please retry.")),
      6000,
    );
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
  });
  try {
    return await Promise.race([user.getIdToken(), deadline]);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}
function explanation(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError")
    return "Allow camera and microphone access in your browser, then try again.";
  if (name === "NotFoundError")
    return "No camera or microphone found. Connect your devices and try again.";
  if (name === "NotReadableError")
    return "A device is busy. Close other camera apps and try again.";
  return error instanceof Error
    ? error.message
    : "Unable to connect. Please try again.";
}
export function useChatSession() {
  const { user, loading: authLoading } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const call = useRef<Call | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [viewVersion, setViewVersion] = useState(0);
  const [safetyTarget, setSafetyTarget] = useState<Match | null>(null);
  const [searching, setSearching] = useState(false);
  const wantsSearch = useRef(false);
  const [status, setStatus] = useState(
    "Check your camera, then meet someone from campus.",
  );
  const [isError, setIsError] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [signalingReady, setSignalingReady] = useState(false);
  const [peerReady, setPeerReady] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const remoteSource = useRef<MediaStream | null>(null);
  const [channelReady, setChannelReady] = useState(false);
  const [partnerAway, setPartnerAway] = useState(false);
  const [selfReconnecting, setSelfReconnecting] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const local = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const owner = useRef(0);
  const mounted = useRef(true);
  const acquisition = useRef<{
    generation: number;
    promise: Promise<MediaStream>;
  } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageSession = useRef("");
  const operation = useRef(false);
  const pendingSafety = useRef<{
    event: string;
    packet: Match & { requestId: string; reason: string };
  } | null>(null);
  const [safetyPending, setSafetyPending] = useState(false);
  const safetyTransport = useRef<Socket | null>(null);
  const safetyBusy = useRef<string | null>(null);
  const [safetyRetry, setSafetyRetry] = useState(false);
  const [devicePending, setDevicePending] = useState(false);
  const [cameraPending, setCameraPending] = useState(false);
  const searchVersion = useRef(0);
  const deviceOperation = useRef(false);
  const ice = useRef(baseIce);
  const iceMode = useRef("all");
  const timings = useRef<{
    started?: number;
    media?: number;
    credentials?: number;
    search?: number;
    playback?: number;
    matched?: number;
    connected?: number;
  }>({});
  const append = useCallback(
    (sender: ChatMessage["sender"], text: string) =>
      setMessages((prev) => [
        ...prev.slice(-199),
        { id: crypto.randomUUID(), sender, text },
      ]),
    [],
  );
  const owns = useCallback(
    (c: Call) => mounted.current && call.current === c,
    [],
  );
  const clearPeer = useCallback(() => {
    setViewVersion((version) => version + 1);
    wantsSearch.current = false;
    setSearching(false);
    const old = call.current;
    call.current = null;
    if (old) {
      clearTimeout(old.timer);
      clearTimeout(old.recovery);
      clearTimeout(old.disconnect);
      old.pc.ontrack = null;
      old.pc.onicecandidate = null;
      old.pc.onconnectionstatechange = null;
      old.pc.oniceconnectionstatechange = null;
      old.pc.close();
    }
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = null;
    channel.current?.close();
    channel.current = null;
    setChannelReady(false);
    setPeerReady(false);
    setMediaReady(false);
    remoteSource.current = null;
    setRemoteStream(null);
    setRoomId(null);
    setPartnerAway(false);
    setSelfReconnecting(false);
  }, []);
  const leave = useCallback((c: Call | null) => {
    if (c && socketRef.current?.connected)
      socketRef.current.emit("leave_room", {
        roomId: c.roomId,
        sessionNonce: c.sessionNonce,
      });
  }, []);
  const endCall = useCallback(
    (message: string) => {
      const c = call.current;
      if (c)
        setSafetyTarget({ roomId: c.roomId, sessionNonce: c.sessionNonce });
      leave(c);
      clearPeer();
      setStatus(message);
      setIsError(true);
    },
    [leave, clearPeer],
  );
  const cleanupConnection = useCallback(() => {
    safetyTransport.current?.removeAllListeners();
    safetyTransport.current?.disconnect();
    safetyTransport.current = null;
    safetyBusy.current = null;
    owner.current++;
    abort.current?.abort();
    abort.current = null;
    setSafetyTarget(null);
    searchVersion.current++;
    setCameraPending(false);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    leave(call.current);
    if (pendingSafety.current && socketRef.current?.connected)
      socketRef.current.emit("leave_room", pendingSafety.current.packet);
    const s = socketRef.current;
    socketRef.current = null;
    if (s) {
      if (s.connected) s.emit("stop_search");
      s.removeAllListeners();
      s.disconnect();
    }
    clearPeer();
    setSocket(null);
    setSignalingReady(false);
    setIsConnecting(false);
    local.current?.getTracks().forEach((track) => track.stop());
    local.current = null;
    setLocalStream(null);
    operation.current = false;
  }, [leave, clearPeer]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cleanupConnection();
    };
  }, [cleanupConnection]);
  useEffect(() => {
    if (!safetyTarget) return;
    const timer = setTimeout(() => setSafetyTarget(null), 300000);
    return () => clearTimeout(timer);
  }, [safetyTarget]);
  const refreshDevices = useCallback(async () => {
    if (navigator.mediaDevices?.enumerateDevices) {
      const list = await navigator.mediaDevices.enumerateDevices();
      if (mounted.current) setDevices(list);
    }
  }, []);
  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media) return;
    const update = () => {
      void refreshDevices().catch(() => {});
    };
    media.addEventListener("devicechange", update);
    return () => media.removeEventListener("devicechange", update);
  }, [refreshDevices]);
  const acquire = useCallback(async () => {
    if (local.current?.getTracks().some((t) => t.readyState === "live"))
      return local.current;
    const generation = owner.current;
    if (acquisition.current?.generation === generation)
      return acquisition.current.promise;
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error(
        "Camera access needs a secure HTTPS connection and a supported browser.",
      );
    setCameraPending(true);
    const promise = navigator.mediaDevices
      .getUserMedia(constraints)
      .then((stream) => {
        if (!mounted.current || owner.current !== generation) {
          stream.getTracks().forEach((t) => t.stop());
          throw new DOMException("Capture cancelled", "AbortError");
        }
        local.current = stream;
        setLocalStream(stream);
        setAudioEnabled(true);
        setVideoEnabled(true);
        stream.getTracks().forEach((track) => {
          track.onended = () => {
            if (!local.current?.getTracks().includes(track)) return;
            setStatus(
              `${track.kind === "audio" ? "Microphone" : "Camera"} disconnected. Choose another device in Devices.`,
            );
            setIsError(true);
            if (track.kind === "audio") setAudioEnabled(false);
            else setVideoEnabled(false);
          };
        });
        void refreshDevices().catch(() => {});
        return stream;
      })
      .finally(() => {
        if (acquisition.current?.promise === promise)
          acquisition.current = null;
        if (mounted.current && owner.current === generation)
          setCameraPending(false);
      });
    acquisition.current = { generation, promise };
    return promise;
  }, [refreshDevices]);
  const prepareCamera = useCallback(async () => {
    setIsError(false);
    try {
      await acquire();
    } catch (error) {
      if (
        mounted.current &&
        !(error instanceof DOMException && error.name === "AbortError")
      ) {
        setStatus(explanation(error));
        setIsError(true);
      }
    }
  }, [acquire]);
  const configureIce = useCallback(
    async (generation: number) => {
      const mode = diagnosticsEnabled
        ? new URLSearchParams(location.search).get("ice")
        : "all";
      iceMode.current = ["host", "stun", "relay"].includes(mode || "")
        ? mode!
        : "all";
      if (mode === "host" || mode === "stun") {
        ice.current = {
          ...baseIce,
          iceServers: mode === "host" ? [] : baseIce.iceServers,
        };
        return;
      }
      const controller = new AbortController();
      abort.current = controller;
      const timeout = setTimeout(() => controller.abort(), 6000);
      try {
        const token = await getToken(user!, controller.signal);
        if (owner.current !== generation)
          throw new DOMException("Cancelled", "AbortError");
        const response = await fetch(api("turn-credentials"), {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok)
          throw new Error(
            response.status === 401 || response.status === 403
              ? "Your account cannot start a call. Sign in again or contact support."
              : "Relay service unavailable. Please retry shortly.",
          );
        const data = await response.json();
        if (
          !Array.isArray(data.iceServers) ||
          !data.iceServers.length ||
          !data.iceServers.every(
            (s: RTCIceServer) =>
              s && (typeof s.urls === "string" || Array.isArray(s.urls)),
          )
        )
          throw new Error(
            "The connection service returned an invalid configuration.",
          );
        if (owner.current === generation)
          ice.current = {
            ...baseIce,
            iceTransportPolicy: mode === "relay" ? "relay" : "all",
            iceServers: [...baseIce.iceServers!, ...data.iceServers],
          };
      } finally {
        clearTimeout(timeout);
        if (abort.current === controller) abort.current = null;
      }
    },
    [user],
  );
  const setupChannel = useCallback(
    (c: Call, dc: RTCDataChannel) => {
      if (!owns(c)) {
        dc.close();
        return;
      }
      channel.current = dc;
      let received = 0,
        windowStart = Date.now();
      dc.onopen = () => {
        if (owns(c) && channel.current === dc) setChannelReady(true);
      };
      dc.onclose = dc.onerror = () => {
        if (owns(c) && channel.current === dc) setChannelReady(false);
      };
      dc.onmessage = (e) => {
        if (!owns(c) || typeof e.data !== "string" || e.data.length > 1000)
          return;
        if (Date.now() - windowStart > 3000) {
          received = 0;
          windowStart = Date.now();
        }
        if (++received > 15) return;
        const text = e.data.trim();
        if (text) append("stranger", text);
      };
    },
    [owns, append],
  );
  const emitSignal = useCallback(
    (c: Call, event: string, extra: object = {}) => {
      if (owns(c) && socketRef.current?.connected)
        socketRef.current.emit(event, {
          roomId: c.roomId,
          sessionNonce: c.sessionNonce,
          negotiationId: c.epoch,
          ...extra,
        });
    },
    [owns],
  );
  const offer = useCallback(
    async (c: Call, restart = false) => {
      if (
        !owns(c) ||
        !c.initiator ||
        c.pc.signalingState !== "stable" ||
        !socketRef.current?.connected
      )
        return;
      try {
        if (restart) c.epoch++;
        const description = await c.pc.createOffer(
          restart ? { iceRestart: true } : {},
        );
        if (!owns(c)) return;
        await c.pc.setLocalDescription(description);
        if (owns(c))
          emitSignal(c, "webrtc_offer", { offer: c.pc.localDescription });
      } catch {
        if (owns(c))
          endCall("Call setup failed. Choose Next to try someone else.");
      }
    },
    [owns, emitSignal, endCall],
  );
  const recover = useCallback(
    (c: Call) => {
      if (!owns(c) || c.restarting) return;
      if (!socketRef.current?.connected) return; // Keep media during the transport's bounded reconnect window.
      c.restarting = true;
      setStatus("Connection interrupted. Trying to reconnect…");
      setPeerReady(false);
      c.recovery = setTimeout(() => {
        if (!owns(c)) return;
        if (c.pc.connectionState !== "connected")
          endCall(
            "Could not restore this call. Choose Next to meet someone else.",
          );
        else {
          c.restarting = false;
          c.recovery = undefined;
          setPeerReady(true);
          setStatus("Connected to another student.");
        }
      }, 10000);
      if (c.initiator) void offer(c, true);
      else emitSignal(c, "webrtc_restart_request");
    },
    [owns, offer, emitSignal, endCall],
  );
  const find = useCallback((s: Socket) => {
    if (!s.connected) return;
    const version = ++searchVersion.current;
    wantsSearch.current = true;
    setSearching(true);
    timings.current.search = performance.now();
    setStatus("Looking for another student…");
    setIsError(false);
    s.timeout(8000).emit(
      "find_match",
      { requestId: crypto.randomUUID() },
      (error: Error | null, result?: { ok: boolean; message?: string }) => {
        if (
          socketRef.current !== s ||
          call.current ||
          searchVersion.current !== version
        )
          return;
        if (error || !result?.ok) {
          wantsSearch.current = false;
          setSearching(false);
          setStatus(
            result?.message || "Search did not start. Choose Next to retry.",
          );
          setIsError(true);
        }
      },
    );
  }, []);
  const start = useCallback(async () => {
    if (
      !user ||
      authLoading ||
      operation.current ||
      pendingSafety.current ||
      (socketRef.current && (!socketRef.current.connected || call.current))
    )
      return;
    setSafetyTarget(null);
    const existingSocket = socketRef.current;
    operation.current = true;
    const generation = owner.current;
    setIsConnecting(true);
    setIsError(false);
    setStatus("Preparing your devices and connection…");
    timings.current = { started: performance.now() };
    try {
      await acquire();
      timings.current.media = performance.now();
      if (owner.current !== generation) return;
      await configureIce(generation);
      timings.current.credentials = performance.now();
      if (owner.current !== generation) return;
      if (existingSocket) {
        if (socketRef.current !== existingSocket) return;
        if (existingSocket.connected) find(existingSocket);
        else {
          wantsSearch.current = true;
          setStatus("Reconnecting before searching…");
        }
        setIsConnecting(false);
        return;
      }
      if (!pageSession.current) pageSession.current = crypto.randomUUID();
      const s = io(origin(), {
        autoConnect: false,
        reconnectionAttempts: 6,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 4000,
        timeout: 8000,
        auth: async (callback) => {
          try {
            const token = await getToken(user);
            if (owner.current === generation)
              callback({
                token,
                sessionId: pageSession.current,
                protocolVersion: 2,
              });
          } catch {
            callback({});
          }
        },
      });
      socketRef.current = s;
      setSocket(s);
      let connectedOnce = false,
        serviceRetries = 0;
      s.on("connect", () => {
        if (socketRef.current !== s) return;
        setSignalingReady(true);
        setIsConnecting(false);
        setSelfReconnecting(false);
        if (!connectedOnce) {
          connectedOnce = true;
          find(s);
        } else if (call.current) {
          const captured = call.current;
          resumeTimer.current = setTimeout(() => {
            if (owns(captured)) {
              endCall("The previous call could not resume. Choose Next.");
            }
          }, 5000);
        } else if (wantsSearch.current) find(s);
        else setStatus("Connected to the service. Choose Next for a new call.");
      });
      s.on("disconnect", (reason: string) => {
        if (socketRef.current !== s) return;
        if (reason === "io server disconnect") {
          cleanupConnection();
          setStatus(
            "The call service closed this connection. Try again when it is available.",
          );
          setIsError(true);
          return;
        }
        setSignalingReady(false);
        setSelfReconnecting(true);
        setStatus("Signaling interrupted. Reconnecting…");
      });
      s.on(
        "connect_error",
        (error: Error & { data?: { retryable?: boolean } }) => {
          if (socketRef.current !== s) return;
          setIsError(true);
          if (
            error.data?.retryable === true &&
            !s.active &&
            serviceRetries++ < 6
          ) {
            setStatus("Connection service unavailable. Retrying; End cancels.");
            retryTimer.current = setTimeout(
              () => {
                if (socketRef.current === s) s.connect();
              },
              Math.min(4000, 1000 * serviceRetries),
            );
          } else if (error.data?.retryable === false || !s.active) {
            cleanupConnection();
            setStatus("Unable to sign in to calls. Reload or sign in again.");
          } else
            setStatus(
              "Connection service unavailable. Retrying; you can End at any time.",
            );
        },
      );
      s.io.on("reconnect_failed", () => {
        if (socketRef.current === s) {
          cleanupConnection();
          setStatus(
            "Connection attempts exhausted. Check your network and try again.",
          );
          setIsError(true);
        }
      });
      s.on("match_found", async (data: Match) => {
        if (
          socketRef.current !== s ||
          !s.connected ||
          !data?.roomId ||
          !data.sessionNonce
        )
          return;
        clearPeer();
        const stream = local.current;
        if (!stream) {
          endCall("Camera unavailable. Check your devices.");
          return;
        }
        const pc = new RTCPeerConnection(ice.current);
        const c: Call = {
          ...data,
          pc,
          epoch: 0,
          initiator: data.role === "initiator",
          candidates: new Map(),
          restarting: false,
          playable: false,
        };
        call.current = c;
        setRoomId(c.roomId);
        setMessages([]);
        setChatInput("");
        setStatus("Student found. Connecting your call…");
        setIsError(false);
        setSafetyTarget(data);
        timings.current.matched = performance.now();
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        pc.ontrack = (e) => {
          if (owns(c) && e.streams[0]) {
            remoteSource.current = e.streams[0];
            setRemoteStream(e.streams[0]);
            e.track.onended = () => {
              if (owns(c))
                setStatus(
                  `Student’s ${e.track.kind === "audio" ? "microphone" : "camera"} stopped. Text and End remain available.`,
                );
            };
          }
        };
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            const fragment = c.pc.localDescription?.sdp.match(
              /a=ice-ufrag:([^\r\n]+)/,
            )?.[1];
            if (
              e.candidate.usernameFragment &&
              fragment &&
              e.candidate.usernameFragment !== fragment
            )
              return;
            emitSignal(c, "webrtc_ice_candidate", {
              candidate: e.candidate.toJSON(),
            });
          }
        };
        pc.ondatachannel = (e) => setupChannel(c, e.channel);
        const update = () => {
          if (!owns(c)) return;
          if (pc.connectionState === "connected") {
            if (c.playable) clearTimeout(c.timer);
            clearTimeout(c.disconnect);
            clearTimeout(c.recovery);
            c.disconnect = undefined;
            c.recovery = undefined;
            c.restarting = false;
            timings.current.connected ??= performance.now();
            setPeerReady(true);
            setIsError(false);
            setStatus("Connected to another student.");
          } else if (pc.connectionState === "failed") recover(c);
          else if (pc.connectionState === "disconnected" && !c.disconnect) {
            setPeerReady(false);
            setStatus("Connection interrupted. Waiting for your network…");
            c.disconnect = setTimeout(() => {
              c.disconnect = undefined;
              recover(c);
            }, 5000);
          }
        };
        pc.onconnectionstatechange = update;
        pc.oniceconnectionstatechange = () => {
          if (owns(c) && pc.iceConnectionState === "failed") recover(c);
        };
        c.timer = setTimeout(() => {
          if (owns(c))
            endCall("This call could not connect. Choose Next to try again.");
        }, 18000);
        if (c.initiator) {
          setupChannel(c, pc.createDataChannel("chat"));
          await offer(c);
        }
      });
      const accept = (p: Signal) => {
        const c = call.current;
        return c &&
          p &&
          c.roomId === p.roomId &&
          c.sessionNonce === p.sessionNonce
          ? c
          : null;
      };
      const drain = async (c: Call, epoch: number) => {
        const list = c.candidates.get(epoch) || [];
        c.candidates.delete(epoch);
        for (const candidate of list) {
          if (!owns(c) || c.epoch !== epoch) return;
          try {
            await c.pc.addIceCandidate(candidate);
          } catch {
            /* A stale ICE candidate must not end a healthy call. */
          }
        }
      };
      s.on("webrtc_offer", async (p: Signal) => {
        const c = accept(p);
        if (!c || c.initiator || p.negotiationId < c.epoch || !p.offer) return;
        try {
          c.epoch = p.negotiationId;
          await c.pc.setRemoteDescription(p.offer);
          if (!owns(c)) return;
          await drain(c, c.epoch);
          const answer = await c.pc.createAnswer();
          if (!owns(c)) return;
          await c.pc.setLocalDescription(answer);
          if (owns(c))
            emitSignal(c, "webrtc_answer", { answer: c.pc.localDescription });
        } catch {
          if (owns(c))
            endCall("Call negotiation failed. Choose Next to retry.");
        }
      });
      s.on("webrtc_answer", async (p: Signal) => {
        const c = accept(p);
        if (
          !c ||
          !c.initiator ||
          c.epoch !== p.negotiationId ||
          !p.answer ||
          c.pc.signalingState !== "have-local-offer"
        )
          return;
        try {
          await c.pc.setRemoteDescription(p.answer);
          if (owns(c)) await drain(c, c.epoch);
        } catch {
          if (owns(c))
            endCall("Call negotiation failed. Choose Next to retry.");
        }
      });
      s.on("webrtc_ice_candidate", async (p: Signal) => {
        const c = accept(p);
        if (
          !c ||
          !p.candidate ||
          p.negotiationId < c.epoch ||
          p.negotiationId > c.epoch + 1
        )
          return;
        try {
          if (c.pc.remoteDescription && p.negotiationId === c.epoch)
            await c.pc.addIceCandidate(p.candidate);
          else {
            const list = c.candidates.get(p.negotiationId) || [];
            if (list.length < 128) list.push(p.candidate);
            c.candidates.set(p.negotiationId, list);
          }
        } catch {
          /* Bounded candidate rejection; recovery is driven by transport state. */
        }
      });
      s.on("webrtc_restart_request", (p: Signal) => {
        const c = accept(p);
        if (c && c.initiator) recover(c);
      });
      s.on("partner_connection_lost", (p: Signal) => {
        if (accept(p)) {
          setPartnerAway(true);
          setStatus(
            "Student disconnected briefly. Waiting for them to return…",
          );
        }
      });
      s.on("partner_reconnected", (p: Signal) => {
        const c = accept(p);
        if (c) {
          setPartnerAway(false);
          if (c.pc.connectionState !== "connected") recover(c);
          else setStatus("Connected to another student.");
        }
      });
      s.on("session_resume_result", (p: Signal & { resumed: boolean }) => {
        if (!connectedOnce) return;
        const c = call.current;
        if (!c) return;
        if (resumeTimer.current) clearTimeout(resumeTimer.current);
        resumeTimer.current = null;
        if (!p.resumed || !accept(p)) {
          endCall("The previous call ended. Choose Next.");
        } else if (c.pc.connectionState !== "connected") recover(c);
        else setStatus("Connected to another student.");
      });
      s.on("stranger_disconnected", (p: Signal) => {
        if (accept(p)) {
          clearPeer();
          setSafetyTarget({ roomId: p.roomId, sessionNonce: p.sessionNonce });
          setStatus("The student left. Choose Next to meet someone else.");
          append("system", "The call ended.");
        }
      });
      s.on("match_error", (p: { message?: string }) => {
        setStatus(p?.message || "Search unavailable. Try again.");
        setIsError(true);
      });
      s.on("banned_alert", () => {
        cleanupConnection();
        setStatus(
          "Your account is suspended. Contact support if this is a mistake.",
        );
        setIsError(true);
      });
      s.on("cooldown_active", (p: { remaining: number }) => {
        cleanupConnection();
        setStatus(
          `Please wait ${Math.max(0, Math.min(300, p?.remaining || 30))} seconds before trying again.`,
        );
        setIsError(true);
      });
      s.connect();
    } catch (error) {
      if (owner.current === generation && mounted.current) {
        setStatus(explanation(error));
        setIsError(true);
        setIsConnecting(false);
      }
    } finally {
      if (owner.current === generation) operation.current = false;
    }
  }, [
    user,
    authLoading,
    acquire,
    configureIce,
    find,
    owns,
    endCall,
    cleanupConnection,
    clearPeer,
    append,
    emitSignal,
    setupChannel,
    recover,
    offer,
  ]);
  const stop = useCallback(
    (message?: string) => {
      cleanupConnection();
      pendingSafety.current = null;
      setSafetyRetry(false);
      setSafetyPending(false);
      setStatus(message || "You left. Camera and microphone are off.");
      setIsError(!!message);
    },
    [cleanupConnection],
  );
  const next = useCallback(() => {
    const s = socketRef.current;
    if (
      !s?.connected ||
      safetyPending ||
      pendingSafety.current ||
      operation.current
    )
      return;
    s.emit("stop_search");
    leave(call.current);
    clearPeer();
    setSafetyTarget(null);
    setMessages([]);
    void start();
  }, [leave, clearPeer, start, safetyPending]);
  const toggleSearch = useCallback(() => {
    if (socketRef.current || isConnecting) stop();
    else void start();
  }, [isConnecting, start, stop]);
  const toggleTrack = useCallback((kind: "audio" | "video") => {
    const tracks =
      local.current
        ?.getTracks()
        .filter((t) => t.kind === kind && t.readyState === "live") || [];
    if (!tracks.length) return;
    const enabled = !tracks.some((t) => t.enabled);
    tracks.forEach((t) => {
      t.enabled = enabled;
    });
    if (kind === "audio") setAudioEnabled(enabled);
    else setVideoEnabled(enabled);
  }, []);
  const selectDevice = useCallback(
    async (kind: "audio" | "video", deviceId: string) => {
      if (deviceOperation.current) return;
      deviceOperation.current = true;
      setDevicePending(true);
      const generation = owner.current;
      const capturedCall = call.current;
      let replacement: MediaStream | null = null;
      try {
        replacement = await navigator.mediaDevices.getUserMedia({
          [kind]: { deviceId: { exact: deviceId } },
        });
        if (
          owner.current !== generation ||
          !mounted.current ||
          call.current !== capturedCall
        )
          return;
        const stream = local.current;
        if (!stream)
          throw new Error("Start Camera check before choosing a device.");
        const track = replacement.getTracks()[0];
        const old = stream.getTracks().find((t) => t.kind === kind);
        track.enabled = old?.enabled ?? true;
        const sender = capturedCall?.pc
          .getSenders()
          .find((s) => s.track?.kind === kind);
        if (sender) await sender.replaceTrack(track);
        if (
          owner.current !== generation ||
          !mounted.current ||
          call.current !== capturedCall
        )
          return;
        old?.stop();
        track.onended = () => {
          if (local.current?.getTracks().includes(track)) {
            setStatus(
              `${kind === "audio" ? "Microphone" : "Camera"} disconnected. Choose another device.`,
            );
            setIsError(true);
            if (kind === "audio") setAudioEnabled(false);
            else setVideoEnabled(false);
          }
        };
        const updated = new MediaStream([
          ...stream.getTracks().filter((t) => t.kind !== kind),
          track,
        ]);
        local.current = updated;
        setLocalStream(updated);
        replacement = null;
        await refreshDevices();
        setStatus("Device updated.");
      } catch (error) {
        if (owner.current === generation) {
          setStatus(explanation(error));
          setIsError(true);
        }
      } finally {
        replacement?.getTracks().forEach((t) => t.stop());
        deviceOperation.current = false;
        if (mounted.current) setDevicePending(false);
      }
    },
    [refreshDevices],
  );
  const submitSafety = useCallback(async () => {
    const intent = pendingSafety.current;
    let s = socketRef.current,
      temporary: Socket | null = null;
    if (!intent || safetyBusy.current) return;
    safetyBusy.current = intent.packet.requestId;
    setSafetyPending(true);
    setSafetyRetry(false);
    setStatus("Saving your safety request…");
    try {
      if (!s?.connected) {
        if (!user) throw new Error("Sign in again to retry this request.");
        const token = await getToken(user);
        if (pendingSafety.current !== intent || !mounted.current) return;
        temporary = io(origin(), {
          autoConnect: false,
          reconnection: false,
          timeout: 8000,
          auth: { token, sessionId: pageSession.current, protocolVersion: 2 },
        });
        safetyTransport.current = temporary;
        s = temporary;
        const transport = temporary;
        let deadline: ReturnType<typeof setTimeout> | undefined;
        try {
          await new Promise<void>((resolve, reject) => {
            deadline = setTimeout(
              () => reject(new Error("Connection timed out. Please retry.")),
              8000,
            );
            transport.once("connect", resolve);
            transport.once("connect_error", reject);
            transport.connect();
          });
        } finally {
          clearTimeout(deadline);
        }
      }
      if (pendingSafety.current !== intent || !mounted.current) return;
      const result = await s
        .timeout(8000)
        .emitWithAck(intent.event, intent.packet);
      if (pendingSafety.current !== intent) return;
      if (result?.retryable === false) {
        pendingSafety.current = null;
        cleanupConnection();
        setStatus(
          "Could not recover this safety request. It may already have reached the server. Contact support if needed.",
        );
        setIsError(true);
        setSafetyRetry(false);
        return;
      }
      if (!result?.ok)
        throw new Error(result?.message || "Your request was not saved.");
      pendingSafety.current = null;
      setStatus(
        intent.event === "block_user"
          ? "Student blocked. You will not be matched again."
          : "Report saved for review. Your call has ended.",
      );
      setIsError(false);
      cleanupConnection();
    } catch (error) {
      if (pendingSafety.current === intent) {
        setStatus(
          `${explanation(error)} Retry saves the same request for the same student.`,
        );
        setIsError(true);
        setSafetyRetry(true);
      }
    } finally {
      temporary?.removeAllListeners();
      temporary?.disconnect();
      if (safetyTransport.current === temporary) safetyTransport.current = null;
      if (safetyBusy.current === intent.packet.requestId)
        safetyBusy.current = null;
      if (
        mounted.current &&
        (!pendingSafety.current || pendingSafety.current === intent)
      )
        setSafetyPending(false);
    }
  }, [user, cleanupConnection]);
  const safety = useCallback(
    (event: string, reason = "user_reported") => {
      const c = call.current || safetyTarget;
      if (
        !c ||
        !socketRef.current?.connected ||
        safetyPending ||
        pendingSafety.current
      )
        return;
      pendingSafety.current = {
        event,
        packet: {
          roomId: c.roomId,
          sessionNonce: c.sessionNonce,
          requestId: crypto.randomUUID(),
          reason,
        },
      };
      setSafetyTarget(null);
      clearPeer();
      local.current?.getTracks().forEach((t) => t.stop());
      local.current = null;
      setLocalStream(null);
      void submitSafety();
    },
    [clearPeer, submitSafety, safetyPending, safetyTarget],
  );
  const sendMessage = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const text = chatInput.trim().slice(0, 1000),
        dc = channel.current;
      if (!text) return;
      if (!dc || dc.readyState !== "open" || dc.bufferedAmount > 65536) {
        setStatus(
          "Text is unavailable or busy. Your draft is kept; try again shortly.",
        );
        setIsError(true);
        return;
      }
      try {
        dc.send(text);
        append("me", text);
        setChatInput("");
      } catch {
        setStatus("Message could not be sent. Your draft is kept.");
        setIsError(true);
      }
    },
    [chatInput, append],
  );
  const downloadDiagnostics = useCallback(async () => {
    const c = call.current;
    if (!diagnosticsEnabled || !c) return;
    try {
      const stats = await c.pc.getStats();
      if (!owns(c)) return;
      const list = Array.from(stats.values());
      const transport = list.find(
        (s) => s.type === "transport" && s.selectedCandidatePairId,
      );
      const pair = transport
        ? stats.get(transport.selectedCandidatePairId)
        : list.find(
            (s) =>
              s.type === "candidate-pair" &&
              s.nominated &&
              s.state === "succeeded",
          );
      const candidate = (id: string) => {
        const s = stats.get(id);
        return s
          ? {
              type: s.candidateType,
              protocol: s.protocol,
              relayProtocol: s.relayProtocol,
            }
          : null;
      };
      const inbound = list
        .filter((s) => s.type === "inbound-rtp")
        .map((s) => ({
          kind: s.kind,
          bytesReceived: s.bytesReceived,
          packetsLost: s.packetsLost,
          packetsReceived: s.packetsReceived,
          framesDecoded: s.framesDecoded,
        }));
      const t = timings.current;
      const report = {
        mode: iceMode.current,
        peerState: c.pc.connectionState,
        textReady: channel.current?.readyState === "open",
        selectedPair: pair
          ? {
              local: candidate(pair.localCandidateId),
              remote: candidate(pair.remoteCandidateId),
              roundTripTime: pair.currentRoundTripTime,
            }
          : null,
        inbound,
        captureMs:
          t.media !== undefined && t.started !== undefined
            ? t.media - t.started
            : undefined,
        credentialsMs:
          t.credentials !== undefined && t.media !== undefined
            ? t.credentials - t.media
            : undefined,
        queueMs:
          t.matched !== undefined && t.search !== undefined
            ? t.matched - t.search
            : undefined,
        firstPlaybackMs:
          t.playback !== undefined && t.matched !== undefined
            ? t.playback - t.matched
            : undefined,
        connectionMs:
          t.connected && t.matched ? t.connected - t.matched : undefined,
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(report, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "kmegle-connection.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setStatus("Could not collect a connection snapshot.");
      setIsError(true);
    }
  }, [owns]);
  const markMediaReady = useCallback((stream: MediaProvider | null) => {
    if (stream && stream === remoteSource.current && call.current) {
      call.current.playable = true;
      if (call.current.pc.connectionState === "connected")
        clearTimeout(call.current.timer);
      setMediaReady(true);
      timings.current.playback ??= performance.now();
    }
  }, []);
  const connectionPhase: ConnectionPhase =
    peerReady && mediaReady
      ? "live"
      : roomId
        ? "negotiating"
        : isConnecting || (socket && !signalingReady)
          ? "connecting"
          : searching
            ? "waiting"
            : socket
              ? "ended"
              : "idle";
  return {
    viewVersion,
    markMediaReady,
    hasSafetyTarget: !!safetyTarget || !!roomId,
    diagnosticsEnabled,
    downloadDiagnostics,
    socket,
    status,
    isError,
    isConnecting,
    connectionPhase,
    roomId,
    localStream,
    remoteStream,
    messages,
    chatInput,
    setChatInput,
    partnerAway,
    selfReconnecting,
    signalingReady,
    channelReady,
    audioEnabled,
    videoEnabled,
    devices,
    devicePending,
    cameraPending,
    safetyPending,
    safetyRetry,
    prepareCamera,
    cleanupConnection,
    toggleSearch,
    start,
    stop,
    next,
    block: () => safety("block_user"),
    reportUser: (reason: string) => safety("report_user", reason),
    retrySafety: submitSafety,
    sendMessage,
    toggleTrack,
    selectDevice,
  };
}
