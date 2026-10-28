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
// "disconnected" is often a brief network blip that recovers by itself, so
// give the connection a moment before treating it as a lost partner.
const DISCONNECT_GRACE_MS = 6000;

export function useChatSession() {
  const { user, loading: authLoading } = useAuth();

  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);

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
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const disconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
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

  const cleanupConnection = useCallback(() => {
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

    localStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    setSocket(null);
    socketRef.current = null;

    setLocalStream(null);
    localStreamRef.current = null;

    setRemoteStream(null);
    remoteStreamRef.current = null;

    setRoomId(null);
    roomIdRef.current = null;

    setMessages([]);
  }, [clearPeerConnection]);

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
        } else if (pc.connectionState === "disconnected") {
          setStatus("Connection unstable... trying to recover.");
          if (!disconnectTimerRef.current) {
            disconnectTimerRef.current = setTimeout(() => {
              disconnectTimerRef.current = null;
              if (
                peerConnectionRef.current === pc &&
                pc.connectionState !== "connected"
              ) {
                handleCallLost("Connection lost. Click Next for someone new.");
              }
            }, DISCONNECT_GRACE_MS);
          }
        } else if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          handleCallLost("Stranger disconnected. Click Next for someone new.");
        }
      };

      pc.oniceconnectionstatechange = () => {
        debugLog("🧊 WebRTC ICE State:", pc.iceConnectionState);
        if (!roomIdRef.current) return;

        // Only a hard ICE failure is final. Transient "disconnected" is
        // handled with a grace period in onconnectionstatechange above.
        if (pc.iceConnectionState === "failed") {
          handleCallLost("Connection lost. Click Next for someone new.");
        }
      };

      return pc;
    },
    [clearPeerConnection, handleCallLost],
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
        setIsError(false);

        // On an automatic reconnect the server has already dropped our old
        // room, so discard the stale peer connection before searching again.
        clearPeerConnection();
        setRemoteStream(null);
        remoteStreamRef.current = null;
        setRoomId(null);
        roomIdRef.current = null;

        setStatus(
          "Connected! Entering waiting pool...",
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
        cleanupConnection();
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
        clearPeerConnection();
        setRemoteStream(null);
        remoteStreamRef.current = null;
        setRoomId(null);
        roomIdRef.current = null;
        setIsError(true);
        setStatus("Connection to the server was lost. Reconnecting...");
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
        setStatus(`Connection failed: ${error.message}`);

        // The socket never actually connected — tear it down so the UI
        // doesn't get stuck believing it's still "waiting" on a dead socket.
        cleanupConnection();
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
        cleanupConnection();
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
      cleanupConnection,
      clearPeerConnection,
      createPeerConnection,
      handleCallLost,
      setupDataChannel,
    ],
  );

  // ----------------------------------------
  // START SEARCH
  // ----------------------------------------

  const startSearch = useCallback(
    async () => {
      // Firebase is still determining
      // authentication state.
      if (authLoading) {
        setStatus(
          "Checking authentication...",
        );
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

      setIsError(false);
      setStatus("Requesting camera...");

      setIsConnecting(true);

      // Clear the chat log for this fresh attempt — the video panel's status
      // overlay already shows live progress ("Requesting camera...", "Fetching
      // relay config...", etc.), so we don't need a system message here too.
      setMessages([]);

      try {
        // ----------------------------------
        // CAMERA + MICROPHONE
        // ----------------------------------

        const stream =
          await navigator.mediaDevices.getUserMedia(
            {
              // Modest resolution keeps bandwidth, TURN usage and NSFW
              // sampling cost reasonable on phones and campus Wi-Fi.
              video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 24, max: 30 },
              },
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
              },
            },
          );

        setLocalStream(stream);
        localStreamRef.current = stream;

        // ----------------------------------
        // TURN
        // ----------------------------------

        setStatus(
          "Camera active. Fetching relay config...",
        );

        await prefetchIceConfig();

        // ----------------------------------
        // FIREBASE TOKEN
        // ----------------------------------

        // Fail early with a clear error if the account can't get a token.
        await user.getIdToken();

        // ----------------------------------
        // SOCKET.IO
        // ----------------------------------

        const newSocket = io(
          getSocketUrl(),
          {
            transports: ["polling", "websocket"],

            // A function is re-evaluated on every (re)connect, so automatic
            // reconnects after an hour don't reuse an expired ID token.
            auth: (cb) => {
              user
                .getIdToken()
                .then((token) => cb({ token }))
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
        console.error(
          "Media / connection error:",
          error,
        );

        setIsConnecting(false);
        setIsError(true);
        const errorName = error instanceof Error ? error.name : undefined;
        const errorMessage = error instanceof Error ? error.message : undefined;
        const isPermissionError =
          errorName === "NotAllowedError" ||
          errorName === "PermissionDeniedError";

        const isNoDevice =
          errorName === "NotFoundError" ||
          errorName === "DevicesNotFoundError";
        const isBusyDevice =
          errorName === "NotReadableError" ||
          errorName === "TrackStartError";

        setStatus(
          isPermissionError
            ? "Camera and microphone access is blocked. Allow it in your browser's site settings, then try again."
            : isNoDevice
              ? "No camera or microphone found. Connect one and try again."
              : isBusyDevice
                ? "Your camera or microphone is being used by another app. Close it and try again."
                : errorMessage || "Failed to start session. Please try again.",
        );

        // If camera was opened but the socket
        // couldn't be created, clean up tracks.
        if (localStreamRef.current) {
          localStreamRef.current
            .getTracks()
            .forEach((track) => {
              track.stop();
            });

          setLocalStream(null);
          localStreamRef.current = null;
        }
      }
    },
    [
      authLoading,
      prefetchIceConfig,
      registerSocketHandlers,
      user,
    ],
  );

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
      "Disconnected. Ready to search.",
    );
  }, [cleanupConnection]);

  // ----------------------------------------
  // TOGGLE SEARCH
  // ----------------------------------------

  const toggleSearch = useCallback(
    async () => {
      if (socketRef.current) {
        stopSearch();
      } else {
        await startSearch();
      }
    },
    [startSearch, stopSearch],
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
      "Skipped. Entering the waiting pool...",
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
    if (!activeSocket || !roomIdRef.current) return;

    setStatus("Reporting user...");
    activeSocket.emit("report_user", {
      roomId: roomIdRef.current,
      reason,
    });
    cleanupConnection();
  }, [cleanupConnection]);

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
    messages,
    chatInput,
    setChatInput,
    toggleSearch,
    next,
    block,
    reportUser,
    sendMessage,
    cleanupConnection,
  };
}