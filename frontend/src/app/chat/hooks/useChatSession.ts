"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { io, Socket } from "socket.io-client";

import { ChatMessage, ConnectionPhase } from "../types/chat";
import { useAuth } from "../../../context/authContext";

// Dev-only logging helper — keeps debug noise out of production consoles.
// console.error calls are intentionally left untouched so real errors
// remain visible in production for diagnosis.
const debugLog = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(...args);
  }
};

// In production the Next.js rewrite in next.config.ts proxies
// /socket.io/* and /api/backend/* through Vercel to the Render backend.
// Locally the same paths hit localhost:5000 via the dev-server proxy.
// The browser NEVER makes direct requests to onrender.com.
function getSocketUrl() {
  if (typeof window === "undefined") return "http://localhost:5000";
  // In local development, connect directly to localhost:5000 to avoid proxy latency/quirks
  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
  }
  // In production (Vercel), connect to the current origin so all traffic
  // is proxied through Vercel, bypassing ISP/campus DNS blocks on *.onrender.com.
  return window.location.origin;
}

const MAX_MESSAGE_LENGTH = 1000;

// Modest resolution keeps bandwidth, TURN usage and NSFW
// sampling cost reasonable on phones and campus Wi-Fi.
const MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 24, max: 30 },
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
  },
};

// Maps a getUserMedia failure to a plain-language explanation.
function mediaErrorStatus(error: unknown): string {
  const errorName = error instanceof Error ? error.name : undefined;
  const errorMessage = error instanceof Error ? error.message : undefined;
  const isPermissionError =
    errorName === "NotAllowedError" || errorName === "PermissionDeniedError";
  const isNoDevice =
    errorName === "NotFoundError" || errorName === "DevicesNotFoundError";
  const isBusyDevice =
    errorName === "NotReadableError" || errorName === "TrackStartError";

  if (isPermissionError) {
    return "Camera and microphone access is blocked. Allow it in your browser's site settings, then try again.";
  }
  if (isNoDevice) {
    return "No camera or microphone found. Connect one and try again.";
  }
  if (isBusyDevice) {
    return "Your camera or microphone is being used by another app. Close it and try again.";
  }
  return errorMessage || "Failed to start session. Please try again.";
}
// "disconnected" is often a brief network blip that recovers by itself, so
// give the connection a moment before treating it as a lost partner.
const DISCONNECT_GRACE_MS = 6000;
// After a hard ICE failure or a mid-call reconnect, one ICE restart attempt
// gets this long to recover before the call is declared lost.
const ICE_RESTART_GRACE_MS = 8000;
// On a mid-call reconnect, wait this long for the server's resume verdict
// before falling back to a fresh search (also covers old servers that never
// send one).
const RESUME_FALLBACK_MS = 4000;

export function useChatSession() {
  const { user, loading: authLoading } = useAuth();

  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  // In-memory page ownership: survives transport reconnect, not a new tab or reload.
  const sessionIdRef = useRef<string | null>(null);

  const [status, setStatus] = useState("Ready to connect.");

  const [roomId, setRoomId] = useState<string | null>(null);
  const roomIdRef = useRef<string | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  // Dedupes concurrent camera requests (entry preview + Start pressed while
  // the permission prompt is still open must not open the camera twice).
  const cameraPromiseRef = useRef<Promise<MediaStream> | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const disconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitiatorRef = useRef(false);
  const resumeFallbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const iceRestartTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Reconnect banners rendered over live video (the status overlay only
  // renders when there is no remote stream, so it can't cover these cases).
  const [partnerAway, setPartnerAway] = useState(false);
  const [selfReconnecting, setSelfReconnecting] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const searchAttemptRef = useRef(0);
  const reportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while WE are stopping tracks on purpose (cleanup/report/cancel) so
  // track.onended doesn't mistake our own stop for a camera unplugging.
  const intentionalStopRef = useRef(false);
  // True whenever `status` describes a failure rather than progress — lets the UI
  // suppress the "connecting" spinner on error states without parsing status text.
  const [isError, setIsError] = useState(false);

  const iceConfigRef = useRef<RTCConfiguration>({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  // Keep socket ref synchronized with state
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  // Keep local stream ref synchronized with state
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Keep remote stream ref synchronized with state
  useEffect(() => {
    remoteStreamRef.current = remoteStream;
  }, [remoteStream]);

  // ----------------------------------------
  // WEBRTC CLEANUP
  // ----------------------------------------

  const clearPeerConnection = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }

    if (iceRestartTimerRef.current) {
      clearTimeout(iceRestartTimerRef.current);
      iceRestartTimerRef.current = null;
    }

    isInitiatorRef.current = false;
    setPartnerAway(false);
    setSelfReconnecting(false);

    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;

    dataChannelRef.current = null;
    pendingCandidates.current = [];
  }, []);

  // The call died but the socket is still alive: tell the server we left the
  // room (so the partner is notified and the room is freed), then show an
  // error state. Shared by every "call lost" path.
  const handleCallLost = useCallback(
    (message: string) => {
      if (!roomIdRef.current) return;

      socketRef.current?.emit("leave_room", { roomId: roomIdRef.current });
      clearPeerConnection();

      setIsError(true);
      setStatus(message);
      setRemoteStream(null);
      remoteStreamRef.current = null;
      setRoomId(null);
      roomIdRef.current = null;
    },
    [clearPeerConnection],
  );

  // One ICE restart attempt, initiator side only: renegotiates with fresh
  // candidates over the existing peer connection and room.
  const restartIceOffer = useCallback(async () => {
    const pc = peerConnectionRef.current;
    const activeSocket = socketRef.current;
    const activeRoomId = roomIdRef.current;
    if (!pc || !activeSocket?.connected || !activeRoomId) return;
    if (!isInitiatorRef.current) return;
    if (pc.signalingState !== "stable") return;
    try {
      debugLog("🧊 Attempting ICE restart");
      pc.restartIce();
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      activeSocket.emit("webrtc_offer", {
        offer: pc.localDescription,
        roomId: activeRoomId,
      });
    } catch (error) {
      debugLog("ICE restart offer failed:", error);
    }
  }, []);

  // Hard ICE failure, or a blip that outlived the grace period: try one ICE
  // restart (initiator offers, responder asks the initiator via the server)
  // before declaring the call lost.
  const attemptIceRecovery = useCallback(
    (pc: RTCPeerConnection | null) => {
      if (!pc || peerConnectionRef.current !== pc) return;
      if (!socketRef.current?.connected) {
        handleCallLost("Connection lost. Click Next for someone new.");
        return;
      }
      setStatus("Connection unstable... trying to recover.");
      if (isInitiatorRef.current) {
        void restartIceOffer();
      } else {
        socketRef.current.emit("webrtc_restart_request", {
          roomId: roomIdRef.current,
        });
      }
      if (!iceRestartTimerRef.current) {
        iceRestartTimerRef.current = setTimeout(() => {
          iceRestartTimerRef.current = null;
          if (
            peerConnectionRef.current === pc &&
            pc.connectionState !== "connected"
          ) {
            handleCallLost("Connection lost. Click Next for someone new.");
          }
        }, ICE_RESTART_GRACE_MS);
      }
    },
    [handleCallLost, restartIceOffer],
  );

  // Tears down socket + peer connection but keeps the camera and its
  // preview alive, so stopping a search (or a failed attempt) doesn't
  // black out the user's own video.
  const teardownCall = useCallback(() => {
    searchAttemptRef.current += 1;
    if (reportTimerRef.current) {
      clearTimeout(reportTimerRef.current);
      reportTimerRef.current = null;
    }
    setIsConnecting(false);
    const currentSocket = socketRef.current;

    if (currentSocket) {
      if (roomIdRef.current) {
        currentSocket.emit("leave_room", {
          roomId: roomIdRef.current,
        });
      }

      currentSocket.disconnect();
    }

    clearPeerConnection();

    setSocket(null);
    socketRef.current = null;

    setRemoteStream(null);
    remoteStreamRef.current = null;

    setRoomId(null);
    roomIdRef.current = null;

    setMessages([]);
  }, [clearPeerConnection]);

  // Full teardown — also turns the camera off. Used when leaving the chat
  // entirely (unmount, settings, report) or when the account is banned.
  const cleanupConnection = useCallback(() => {
    teardownCall();

    intentionalStopRef.current = true;
    localStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    setLocalStream(null);
    localStreamRef.current = null;
  }, [teardownCall]);

  // ----------------------------------------
  // CONNECTION PHASE (derived)
  // ----------------------------------------
  // A single source of truth for "what's happening right now" so the UI
  // never has to guess by pattern-matching the human-readable `status` text.
  const connectionPhase: ConnectionPhase = (() => {
    if (remoteStream) return "live";
    if (socket && roomId) return "negotiating";
    if (socket) return "waiting";
    if (isConnecting) return "connecting";
    return "idle";
  })();

  // Cleanup when component unmounts
  useEffect(() => {
    return cleanupConnection;
  }, [cleanupConnection]);

  // ----------------------------------------
  // TURN CONFIGURATION
  // ----------------------------------------

  const prefetchIceConfig = useCallback(async () => {
    try {
      const isLocal =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1");

      const url = isLocal
        ? `${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000"}/api/turn-credentials`
        : "/api/backend/turn-credentials";

      const headers: Record<string, string> = {};
      if (user) {
        try {
          const token = await user.getIdToken();
          headers["Authorization"] = `Bearer ${token}`;
        } catch (e) {
          debugLog("Could not get auth token for TURN credentials:", e);
        }
      }

      const response = await fetch(url, { headers });

      const turnData = await response.json();

      if (
        turnData.iceServers &&
        Array.isArray(turnData.iceServers)
      ) {
        iceConfigRef.current = {
          iceServers: [
            {
              urls: "stun:stun.l.google.com:19302",
            },
            {
              urls: "stun:stun1.l.google.com:19302",
            },
            ...turnData.iceServers,
          ],
        };

        return;
      }

      if (turnData.username && turnData.credential) {
        iceConfigRef.current = {
          iceServers: [
            {
              urls: "stun:stun.l.google.com:19302",
            },
            {
              urls: "stun:stun1.l.google.com:19302",
            },
            {
              urls: "turn:global.relay.metered.ca:80",
              username: turnData.username,
              credential: turnData.credential,
            },
            {
              urls: "turn:global.relay.metered.ca:443",
              username: turnData.username,
              credential: turnData.credential,
            },
            {
              urls: "turn:global.relay.metered.ca:443?transport=tcp",
              username: turnData.username,
              credential: turnData.credential,
            },
          ],
        };
      }
    } catch (error) {
      debugLog(
        "Could not fetch TURN credentials, falling back to STUN only.",
        error,
      );
    }
    // `user` must be a dependency: with [] the callback captured the initial
    // null user, so TURN credentials were requested without a token (401) and
    // every call silently fell back to STUN only.
  }, [user]);

  // ----------------------------------------
  // DATA CHANNEL
  // ----------------------------------------

  const setupDataChannel = useCallback(
    (channel: RTCDataChannel) => {
      dataChannelRef.current = channel;

      channel.onopen = () => {
        debugLog("Data channel opened successfully.");
      };

      channel.onmessage = (event) => {
        // The peer is untrusted: accept only plain strings and cap their size.
        if (typeof event.data !== "string") return;
        const text = event.data.slice(0, MAX_MESSAGE_LENGTH);
        if (!text.trim()) return;

        setMessages((prev) => [
          ...prev,
          {
            sender: "stranger",
            text,
          },
        ]);
      };

      channel.onclose = () => {
        if (dataChannelRef.current === channel) {
          dataChannelRef.current = null;
        }
      };
    },
    [],
  );

  // ----------------------------------------
  // WEBRTC PEER CONNECTION
  // ----------------------------------------

  const createPeerConnection = useCallback(
    (
      activeSocket: Socket,
      matchedRoomId: string,
      stream: MediaStream,
    ) => {
      clearPeerConnection();

      const pc = new RTCPeerConnection(
        iceConfigRef.current,
      );

      peerConnectionRef.current = pc;

      stream
        .getTracks()
        .forEach((track) => {
          pc.addTrack(track, stream);
        });

      pc.ontrack = (event) => {
        const [stream] = event.streams;

        if (stream) {
          setRemoteStream(stream);
          remoteStreamRef.current = stream;
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          activeSocket.emit(
            "webrtc_ice_candidate",
            {
              candidate: event.candidate,
              roomId: matchedRoomId,
            },
          );
        }
      };

      pc.onconnectionstatechange = () => {
        debugLog("📡 WebRTC Connection State:", pc.connectionState);
        // If roomId was already cleared (block/skip/disconnect happened),
        // ignore any further state changes from this closing PC.
        if (!roomIdRef.current) return;

        if (pc.connectionState === "connected") {
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
          setIsError(false);
          setStatus("Connected! Video active.");
          if (disconnectTimerRef.current) {
            clearTimeout(disconnectTimerRef.current);
            disconnectTimerRef.current = null;
          }
          if (iceRestartTimerRef.current) {
            clearTimeout(iceRestartTimerRef.current);
            iceRestartTimerRef.current = null;
          }
        } else if (pc.connectionState === "disconnected") {
          setStatus("Connection unstable... trying to recover.");
          if (!disconnectTimerRef.current) {
            disconnectTimerRef.current = setTimeout(() => {
              disconnectTimerRef.current = null;
              if (
                peerConnectionRef.current === pc &&
                pc.connectionState !== "connected"
              ) {
                attemptIceRecovery(pc);
              }
            }, DISCONNECT_GRACE_MS);
          }
        } else if (pc.connectionState === "failed") {
          attemptIceRecovery(pc);
        } else if (pc.connectionState === "closed") {
          handleCallLost("Stranger disconnected. Click Next for someone new.");
        }
      };

      pc.oniceconnectionstatechange = () => {
        debugLog("🧊 WebRTC ICE State:", pc.iceConnectionState);
        if (!roomIdRef.current) return;

        // Transient "disconnected" is handled with a grace period in
        // onconnectionstatechange above. A hard failure gets one ICE
        // restart attempt before the call is declared lost.
        if (pc.iceConnectionState === "failed") {
          attemptIceRecovery(pc);
        }
      };

      return pc;
    },
    [clearPeerConnection, handleCallLost, attemptIceRecovery],
  );

  // ----------------------------------------
  // RESET FOR NEXT MATCH
  // ----------------------------------------

  const resetForNextMatch = useCallback(() => {
    clearPeerConnection();

    const currentSocket = socketRef.current;

    if (currentSocket && roomIdRef.current) {
      currentSocket.emit("leave_room", {
        roomId: roomIdRef.current,
      });
    }

    setRemoteStream(null);
    remoteStreamRef.current = null;

    setRoomId(null);
    roomIdRef.current = null;

    setMessages([
      {
        sender: "system",
        text: "Looking for a new stranger...",
      },
    ]);
  }, [clearPeerConnection]);

  // ----------------------------------------
  // SOCKET EVENT HANDLERS
  // ----------------------------------------

  const registerSocketHandlers = useCallback(
    (
      newSocket: Socket,
      stream: MediaStream,
    ) => {
      // ------------------------------------
      // SOCKET CONNECTED
      // ------------------------------------

      newSocket.on("connect", () => {
        debugLog(
          "🔌 Socket connected:",
          newSocket.id,
        );

        setIsConnecting(false);

        // Mid-call reconnect: the media path is peer-to-peer and may still
        // be alive, and the server holds the room for a grace period. Hold
        // the call and wait for the server's resume verdict instead of
        // tearing everything down.
        if (roomIdRef.current) {
          setStatus("Reconnecting...");
          if (resumeFallbackTimerRef.current) {
            clearTimeout(resumeFallbackTimerRef.current);
          }
          resumeFallbackTimerRef.current = setTimeout(() => {
            resumeFallbackTimerRef.current = null;
            if (!roomIdRef.current) return;
            clearPeerConnection();
            setRemoteStream(null);
            remoteStreamRef.current = null;
            setRoomId(null);
            roomIdRef.current = null;
            setStatus("Finding someone for you...");
            setMessages([
              { sender: "system", text: "Waiting for a stranger..." },
            ]);
            newSocket.emit("find_match");
          }, RESUME_FALLBACK_MS);
          return;
        }

        setIsError(false);

        // On an automatic reconnect the server has already dropped our old
        // room, so discard the stale peer connection before searching again.
        clearPeerConnection();
        setRemoteStream(null);
        remoteStreamRef.current = null;
        setRoomId(null);
        roomIdRef.current = null;

        setStatus(
          "Finding someone for you...",
        );

        setMessages([
          { sender: "system", text: "Waiting for a stranger..." },
        ]);

        // Identity now comes from the
        // authenticated Firebase socket.
        newSocket.emit("find_match");
      });
      const handleUserBlocked = () => {
        debugLog("🛑 user_blocked ack received — entering matchmaking queue");
        // State was already reset optimistically in block(); just re-enter the queue
        newSocket.emit("find_match");
      };

      newSocket.on(
        "user_blocked",
        handleUserBlocked
      );

      // Block could not be saved server-side; keep the user searching rather
      // than stuck on the optimistic "User blocked" screen.
      newSocket.on("block_failed", () => {
        setIsError(true);
        setStatus("Couldn't block that user. Looking for someone new...");
        newSocket.emit("find_match");
      });

      // Server could not start a search (e.g. database hiccup).
      newSocket.on("match_error", (data?: { message?: string }) => {
        setIsError(true);
        setStatus(data?.message || "Could not start searching. Please try again.");
        teardownCall();
      });

      newSocket.on("chat_rate_limited", () => {
        setMessages((prev) => [
          ...prev,
          { sender: "system", text: "You're sending messages too fast." },
        ]);
      });

      // Unexpected drops (server restart, network loss). socket.io retries
      // on its own; tell the user instead of freezing on a dead call.
      newSocket.on("disconnect", (reason) => {
        if (reason === "io client disconnect") return;
        // Signaling dropped. If we are mid-call, the media path is
        // peer-to-peer and may still be alive — hold everything while
        // socket.io reconnects; the resume verdict decides what survives.
        setIsError(true);
        setStatus("Connection to the server was lost. Reconnecting...");
        if (roomIdRef.current) setSelfReconnecting(true);
      });

      // ------------------------------------
      // SOCKET CONNECT ERROR
      // ------------------------------------

      newSocket.on("connect_error", (error) => {
        console.error("❌ SOCKET CONNECTION FAILED");
        console.error("message:", error.message);
        //console.error("description:", error.description);
        //console.error("context:", error.context);
        console.error("error:", error);

        setIsConnecting(false);
        setIsError(true);
        setStatus("Couldn't reach the server. Check your connection and try again.");

        // The socket never actually connected — tear it down so the UI
        // doesn't get stuck believing it's still "waiting" on a dead socket.
        // The camera preview stays on so retrying is instant.
        teardownCall();
      });

      // ------------------------------------
      // BANNED USER
      // ------------------------------------

      newSocket.on("banned_alert", (data) => {
        setIsError(true);
        setStatus(
          `🚨 ${data.message}`,
        );

        cleanupConnection();
      });

      // ------------------------------------
      // COOLDOWN ACTIVE
      // ------------------------------------

      newSocket.on("cooldown_active", (data?: { remaining?: number }) => {
        setIsError(true);
        setStatus(
          data?.remaining
            ? `⏳ On cooldown for content violations. Try again in ${data.remaining}s.`
            : "⏳ Temporarily on cooldown for content violations."
        );
        setIsConnecting(false);
        teardownCall();
      });

      // ------------------------------------
      // MATCH FOUND
      // ------------------------------------

      newSocket.on(
        "match_found",
        async (data) => {

          debugLog(
            "🔥 MATCH_FOUND RECEIVED:",
            data
          );

          try {
            setIsError(false);
            setStatus(
              "Match found! Connecting video..."
            );

            setRoomId(data.roomId);
            roomIdRef.current = data.roomId;
            isInitiatorRef.current = data.role === "initiator";

            pendingCandidates.current = [];

            // Guard: timeout if partner never finishes WebRTC negotiation
            if (connectionTimeoutRef.current) {
              clearTimeout(connectionTimeoutRef.current);
            }
            connectionTimeoutRef.current = setTimeout(() => {
              if (!remoteStreamRef.current && peerConnectionRef.current?.connectionState !== "connected") {
                debugLog("⏱️ WebRTC connection timeout reached");
                // Negotiation failed — free the server-side room too so the
                // partner isn't left waiting on a call that will never start.
                handleCallLost("Couldn't connect to the stranger. Click Next for someone new.");
              }
            }, 12000);

            setMessages([
              {
                sender: "system",
                text:
                  "You are now chatting with a random stranger.",
              },
            ]);

            const currentStream =
              localStreamRef.current || stream;

            debugLog(
              "🔥 Local stream:",
              currentStream
            );

            debugLog(
              "🔥 Creating peer connection..."
            );

            const pc = createPeerConnection(
              newSocket,
              data.roomId,
              currentStream,
            );

            debugLog(
              "🔥 Peer connection created:",
              pc
            );

            if (data.role === "initiator") {
              debugLog(
                "🔥 I am the initiator"
              );

              const channel =
                pc.createDataChannel("chat");

              debugLog(
                "🔥 Data channel created"
              );

              setupDataChannel(channel);

              debugLog(
                "🔥 Creating WebRTC offer..."
              );

              const offer =
                await pc.createOffer();

              debugLog(
                "🔥 Setting local description..."
              );

              await pc.setLocalDescription(
                offer
              );

              debugLog(
                "🔥 Local description set, sending offer..."
              );

              newSocket.emit(
                "webrtc_offer",
                {
                  offer,
                  roomId: data.roomId,
                }
              );

              debugLog(
                "🔥 WebRTC offer emitted"
              );

            } else {
              debugLog(
                "🔥 I am the responder"
              );

              pc.ondatachannel = (event) => {
                debugLog(
                  "🔥 Data channel received"
                );

                setupDataChannel(
                  event.channel
                );
              };
            }

          } catch (error) {
            console.error(
              "❌ MATCH / WEBRTC INITIALIZATION FAILED:",
              error
            );

            setIsError(true);
            setStatus(
              "Failed to establish video connection."
            );
          }
        }
      );

      // ------------------------------------
      // SESSION RESUME (after a signaling blip mid-call)
      // ------------------------------------

      // Server's verdict after a mid-call reconnect.
      newSocket.on(
        "session_resume_result",
        (data?: { resumed?: boolean; roomId?: string }) => {
          if (resumeFallbackTimerRef.current) {
            clearTimeout(resumeFallbackTimerRef.current);
            resumeFallbackTimerRef.current = null;
          }
          if (!roomIdRef.current) return;

          if (data?.resumed && data.roomId === roomIdRef.current) {
            setIsError(false);
            setSelfReconnecting(false);
            const pc = peerConnectionRef.current;
            if (pc && pc.connectionState === "connected") {
              setStatus("Connected! Video active.");
            } else {
              // Signaling is back but media needs help: one ICE restart.
              setStatus("Reconnecting video...");
              attemptIceRecovery(pc);
            }
            return;
          }

          // Room is gone: fall back to a fresh search.
          clearPeerConnection();
          setRemoteStream(null);
          remoteStreamRef.current = null;
          setRoomId(null);
          roomIdRef.current = null;
          setIsError(false);
          setStatus("Finding someone for you...");
          setMessages([
            { sender: "system", text: "Waiting for a stranger..." },
          ]);
          newSocket.emit("find_match");
        },
      );

      // Partner's signaling dropped; their media may still be live and the
      // server is holding the room for them.
      newSocket.on(
        "partner_connection_lost",
        (data?: { message?: string }) => {
          if (!roomIdRef.current) return;
          setPartnerAway(true);
          setStatus(
            data?.message ||
              "Stranger's connection dropped. Waiting for them to reconnect...",
          );
        },
      );

      newSocket.on("partner_reconnected", () => {
        if (!roomIdRef.current) return;
        setPartnerAway(false);
        const pc = peerConnectionRef.current;
        if (pc && pc.connectionState === "connected") {
          setIsError(false);
          setStatus("Connected! Video active.");
        } else {
          setStatus("Reconnecting video...");
          attemptIceRecovery(pc);
        }
      });

      // The responder asked us (the initiator) to drive an ICE restart.
      newSocket.on("webrtc_restart_request", () => {
        void restartIceOffer();
      });

      // ------------------------------------
      // WEBRTC OFFER
      // ------------------------------------

      newSocket.on(
        "webrtc_offer",
        async ({ offer }) => {
          const pc =
            peerConnectionRef.current;

          if (
            !pc ||
            pc.signalingState === "closed"
          ) {
            return;
          }

          try {
            await pc.setRemoteDescription(
              new RTCSessionDescription(
                offer,
              ),
            );

            const answer =
              await pc.createAnswer();

            await pc.setLocalDescription(
              answer,
            );

            newSocket.emit(
              "webrtc_answer",
              {
                answer,
                roomId:
                  roomIdRef.current,
              },
            );

            // Add ICE candidates that arrived
            // before the remote description.
            for (const candidate of
              pendingCandidates.current) {
              try {
                await pc.addIceCandidate(
                  new RTCIceCandidate(
                    candidate,
                  ),
                );
              } catch (error) {
                debugLog(
                  "Failed to add buffered ICE candidate after offer:",
                  error,
                );
              }
            }

            pendingCandidates.current = [];
          } catch (error) {
            console.error(
              "Offer processing error:",
              error,
            );
          }
        },
      );

      // ------------------------------------
      // WEBRTC ANSWER
      // ------------------------------------

      newSocket.on(
        "webrtc_answer",
        async ({ answer }) => {
          const pc =
            peerConnectionRef.current;

          if (
            !pc ||
            pc.signalingState ===
            "closed" ||
            pc.signalingState ===
            "stable"
          ) {
            return;
          }

          try {
            await pc.setRemoteDescription(
              new RTCSessionDescription(
                answer,
              ),
            );

            for (const candidate of
              pendingCandidates.current) {
              try {
                await pc.addIceCandidate(
                  new RTCIceCandidate(
                    candidate,
                  ),
                );
              } catch (error) {
                debugLog(
                  "Failed to add buffered ICE candidate after answer:",
                  error,
                );
              }
            }

            pendingCandidates.current = [];
          } catch (error) {
            console.error(
              "Answer processing error:",
              error,
            );
          }
        },
      );

      // ------------------------------------
      // WEBRTC ICE CANDIDATE
      // ------------------------------------

      newSocket.on(
        "webrtc_ice_candidate",
        async ({ candidate }) => {
          const pc =
            peerConnectionRef.current;

          if (
            !pc ||
            pc.signalingState === "closed"
          ) {
            return;
          }

          if (pc.remoteDescription) {
            try {
              await pc.addIceCandidate(
                new RTCIceCandidate(
                  candidate,
                ),
              );
            } catch (error) {
              debugLog(
                "Failed to add ICE candidate:",
                error,
              );
            }
          } else {
            pendingCandidates.current.push(
              candidate,
            );
          }
        },
      );

      // ------------------------------------
      // STRANGER DISCONNECTED
      // ------------------------------------

      newSocket.on(
        "stranger_disconnected",
        (data?: { reason?: string }) => {
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }

          const msg = data?.reason || "Stranger disconnected. Click Next for someone new.";
          setStatus(msg);

          setMessages((prev) => [
            ...prev,
            {
              sender: "system",
              text:
                data?.reason || "The stranger has disconnected.",
            },
          ]);

          clearPeerConnection();

          setRemoteStream(null);
          remoteStreamRef.current = null;

          setRoomId(null);
          roomIdRef.current = null;
        },
      );
    },
    [
      attemptIceRecovery,
      cleanupConnection,
      clearPeerConnection,
      createPeerConnection,
      handleCallLost,
      restartIceOffer,
      setupDataChannel,
      teardownCall,
    ],
  );

  // Best-effort instant room teardown on a deliberate tab close: at the
  // transport level a real close looks exactly like a network blip, so
  // without this the partner would wait out the whole away grace period.
  useEffect(() => {
    const onPageHide = () => {
      const activeSocket = socketRef.current;
      const activeRoomId = roomIdRef.current;
      if (activeSocket?.connected && activeRoomId) {
        activeSocket.emit("leave_room", { roomId: activeRoomId });
      }
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  // ----------------------------------------
  // CAMERA ACQUISITION (shared)
  // ----------------------------------------
  // Single path for turning the camera on, used by the entry preview and by
  // Start. Concurrent callers share one getUserMedia request; a teardown
  // while the prompt is open cancels the handoff so the camera can't come
  // back on after the session was torn down.
  const acquireCamera = useCallback(async (): Promise<MediaStream> => {
    if (localStreamRef.current) return localStreamRef.current;
    if (cameraPromiseRef.current) return cameraPromiseRef.current;

    const attemptAtAsk = searchAttemptRef.current;
    // Share the POST-CHECK promise, not the raw getUserMedia promise: every
    // awaiter must get the same outcome. Sharing the raw promise let a
    // deduped caller keep a stream whose tracks the creator then stopped as
    // stale, leaving calls with a dead outbound video (found by E2E probe).
    const promise = (async () => {
      const stream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS);
      if (
        attemptAtAsk !== searchAttemptRef.current ||
        localStreamRef.current
      ) {
        stream.getTracks().forEach((track) => track.stop());
        if (localStreamRef.current) return localStreamRef.current;
        throw new Error("Camera request was cancelled.");
      }
      localStreamRef.current = stream;
      setLocalStream(stream);
      intentionalStopRef.current = false;
      // Camera unplugged / device lost mid-call: the local preview freezes
      // silently without this, and the stranger just sees a stuck frame.
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          if (intentionalStopRef.current) return;
          if (localStreamRef.current !== stream) return;
          // Release every track and the socket too. Keeping the ended stream
          // cached would make the next Start reuse a dead camera forever.
          cleanupConnection();
          setIsError(true);
          setStatus("Your camera disconnected. Fix it and press Start again.");
        };
      });
      return stream;
    })();
    cameraPromiseRef.current = promise;

    try {
      return await promise;
    } finally {
      cameraPromiseRef.current = null;
    }
  }, [cleanupConnection]);

  // ----------------------------------------
  // START SEARCH
  // ----------------------------------------

  const startSearch = useCallback(
    async () => {
      // Firebase is still determining
      // authentication state.
      if (authLoading) {
        setStatus("Signing you in...");
        return;
      }

      // No Firebase user.
      if (!user) {
        setStatus(
          "Please sign in before starting KMegle.",
        );
        return;
      }

      // Check moderation cooldown
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("kmegle_nsfw_cooldown_until");
        if (stored) {
          const expiry = parseInt(stored, 10);
          const remaining = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
          if (remaining > 0) {
            const mins = Math.floor(remaining / 60);
            const secs = remaining % 60;
            setStatus(
              `🚨 Moderation cooldown active (${mins}:${secs.toString().padStart(2, "0")}). Please wait.`
            );
            return;
          } else {
            localStorage.removeItem("kmegle_nsfw_cooldown_until");
          }
        }
      }

      const attempt = ++searchAttemptRef.current;
      setIsError(false);
      setStatus("Turning on your camera...");

      setIsConnecting(true);

      // Clear the chat log for this fresh attempt — the video panel's status
      // overlay already shows live progress ("Turning on your camera...",
      // "Getting ready...", etc.), so we don't need a system message here too.
      setMessages([]);

      try {
        // ----------------------------------
        // CAMERA + MICROPHONE
        // ----------------------------------
        // The entry flow already turns the camera on for the preview, so
        // this usually just reuses that stream; it only asks again when the
        // preview isn't running (e.g. permission was denied earlier).
        // If Start raced the entry preview's in-flight request, that request
        // is cancelled by the attempt bump; retry once to get a live stream.
        let stream: MediaStream;
        try {
          stream = await acquireCamera();
        } catch (firstError) {
          if (
            firstError instanceof Error &&
            firstError.message === "Camera request was cancelled."
          ) {
            stream = await acquireCamera();
          } else {
            throw firstError;
          }
        }
        if (attempt !== searchAttemptRef.current) return;

        // ----------------------------------
        // TURN
        // ----------------------------------

        setStatus("Getting ready...");

        await prefetchIceConfig();
        if (attempt !== searchAttemptRef.current) return;

        // ----------------------------------
        // FIREBASE TOKEN
        // ----------------------------------

        // Fail early with a clear error if the account can't get a token.
        await user.getIdToken();
        if (attempt !== searchAttemptRef.current) return;

        // ----------------------------------
        // SOCKET.IO
        // ----------------------------------

        sessionIdRef.current ??= crypto.randomUUID();
        const sessionId = sessionIdRef.current;
        const newSocket = io(
          getSocketUrl(),
          {
            transports: ["polling", "websocket"],

            // A function is re-evaluated on every (re)connect, so automatic
            // reconnects after an hour don't reuse an expired ID token.
            auth: (cb) => {
              user
                .getIdToken()
                .then((token) => cb({ token, sessionId }))
                .catch(() => cb({ token: "" }));
            },
          },
        );

        setSocket(newSocket);
        socketRef.current = newSocket;

        registerSocketHandlers(
          newSocket,
          stream,
        );
      } catch (error) {
        if (attempt !== searchAttemptRef.current) return;
        console.error(
          "Media / connection error:",
          error,
        );

        setIsConnecting(false);
        setIsError(true);
        setStatus(mediaErrorStatus(error));

        // A camera stream that was already running for the preview stays
        // alive so the preview doesn't black out on a failed attempt.
        // (A stream acquired inside this failed attempt was never stored.)
        teardownCall();
      }
    },
    [
      authLoading,
      acquireCamera,
      prefetchIceConfig,
      registerSocketHandlers,
      teardownCall,
      user,
    ],
  );

  // ----------------------------------------
  // PREPARE CAMERA (entry preview)
  // ----------------------------------------
  // Turns the camera on as soon as someone lands on the chat page, before
  // any matching starts, so they can see themselves first. Failure leaves a
  // readable status; pressing Start retries the request.
  // Turns the camera on as soon as someone lands on the chat page, before
  // any matching starts, so they see themselves first. On failure a readable
  // status explains the problem; pressing Start retries the request.
  const prepareCamera = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setIsError(true);
      setStatus("This browser doesn't support camera access.");
      return;
    }
    if (localStreamRef.current || cameraPromiseRef.current) return;

    try {
      await acquireCamera();
    } catch (error) {
      // A teardown racing the entry request (strict-mode remount in dev, or
      // any stray cleanup) cancels the pending ask; retry once so the
      // preview still comes up. prepareCamera only runs on entry, so this
      // can't restart the camera after a deliberate Stop.
      if (
        error instanceof Error &&
        error.message === "Camera request was cancelled."
      ) {
        try {
          await acquireCamera();
          return;
        } catch (retryError) {
          setIsError(true);
          setStatus(mediaErrorStatus(retryError));
          return;
        }
      }
      setIsError(true);
      setStatus(mediaErrorStatus(error));
    }
  }, [acquireCamera]);

  // ----------------------------------------
  // STOP SEARCH
  // ----------------------------------------

  const stopSearch = useCallback(() => {
    socketRef.current?.emit(
      "stop_search",
    );

    cleanupConnection();
    setIsError(false);

    setStatus(
      "Stopped. Camera off — press Start when you're ready.",
    );
  }, [cleanupConnection]);

  // ----------------------------------------
  // TOGGLE SEARCH
  // ----------------------------------------

  const toggleSearch = useCallback(
    async () => {
      if (socketRef.current || isConnecting) {
        stopSearch();
      } else {
        await startSearch();
      }
    },
    [startSearch, stopSearch, isConnecting],
  );

  // ----------------------------------------
  // NEXT
  // ----------------------------------------

  const next = useCallback(() => {
    const activeSocket =
      socketRef.current;

    if (!activeSocket) return;

    resetForNextMatch();
    setIsError(false);

    setStatus(
      "Finding someone new...",
    );

    // Identity is already attached
    // to the authenticated socket.
    activeSocket.emit("find_match");
  }, [resetForNextMatch]);

  // ----------------------------------------
  // BLOCK
  // ----------------------------------------

  const block = useCallback(() => {
    const activeSocket = socketRef.current;

    if (
      !activeSocket ||
      !roomIdRef.current
    ) {
      return;
    }

    // Optimistically reset connection state NOW so the UI immediately
    // reflects that we are no longer connected (no "Connected! Video active").
    const blockedRoomId = roomIdRef.current;
    clearPeerConnection();
    setRemoteStream(null);
    remoteStreamRef.current = null;
    setRoomId(null);
    roomIdRef.current = null;
    setMessages([
      { sender: "system", text: "User blocked. Looking for someone new..." },
    ]);
    setIsError(false);
    setStatus("User blocked. Looking for someone new...");

    // Let the server know — the ack (user_blocked) will then emit find_match
    activeSocket.emit("block_user", {
      roomId: blockedRoomId,
    });
  }, [clearPeerConnection]);

  const reportUser = useCallback((reason: string = "Inappropriate content / behavior") => {
    const activeSocket = socketRef.current;
    const reportedRoomId = roomIdRef.current;
    if (!activeSocket || !reportedRoomId || reportTimerRef.current) return;

    let settled = false;
    const finishReport = (message: string, failed: boolean) => {
      if (settled) return;
      settled = true;
      activeSocket.off("user_reported", onReported);
      activeSocket.off("report_failed", onFailed);
      // A stop or newer search must not have its state overwritten by this reply.
      if (socketRef.current !== activeSocket || !reportTimerRef.current) return;
      cleanupConnection();
      setIsError(failed);
      setStatus(message);
    };
    const onReported = () => finishReport("Report received. Chat ended.", false);
    const onFailed = () => finishReport("Report could not be confirmed. Chat ended. Contact support if needed.", true);
    activeSocket.once("user_reported", onReported);
    activeSocket.once("report_failed", onFailed);
    reportTimerRef.current = setTimeout(() => finishReport("Report receipt was not confirmed. Chat ended. Contact support if needed.", true), 8000);

    setStatus("Sending report. Ending chat...");
    // Stop media immediately, but keep room membership until the server handles
    // the report. Leaving first can delete the room before it saves the report.
    roomIdRef.current = null;
    setRoomId(null);
    clearPeerConnection();
    intentionalStopRef.current = true;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    remoteStreamRef.current = null;
    setRemoteStream(null);
    activeSocket.emit("report_user", { roomId: reportedRoomId, reason });
  }, [cleanupConnection, clearPeerConnection]);

  // ----------------------------------------
  // SEND MESSAGE
  // ----------------------------------------

  const sendMessage = useCallback(
    (event: FormEvent) => {
      event.preventDefault();

      const message =
        chatInput.trim().slice(0, MAX_MESSAGE_LENGTH);

      const channel =
        dataChannelRef.current;

      if (
        !message ||
        !channel ||
        channel.readyState !== "open"
      ) {
        return;
      }

      channel.send(message);

      setMessages((prev) => [
        ...prev,
        {
          sender: "me",
          text: message,
        },
      ]);

      setChatInput("");
    },
    [chatInput],
  );

  // ----------------------------------------
  // RETURN API
  // ----------------------------------------

  return {
    socket,
    status,
    isConnecting,
    isError,
    connectionPhase,
    roomId,
    localStream,
    remoteStream,
    partnerAway,
    selfReconnecting,
    messages,
    chatInput,
    setChatInput,
    toggleSearch,
    next,
    block,
    reportUser,
    sendMessage,
    prepareCamera,
    cleanupConnection,
  };
}
