"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { io, Socket } from "socket.io-client";

import { ChatMessage } from "../types/chat";
import { useAuth } from "../../../context/authContext";

const DEFAULT_BACKEND_URL = "http://localhost:5000";

function getBackendUrl() {
  return process.env.NEXT_PUBLIC_BACKEND_URL || DEFAULT_BACKEND_URL;
}

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

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");

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
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;

    dataChannelRef.current = null;
    pendingCandidates.current = [];
  }, []);

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

  // Cleanup when component unmounts
  useEffect(() => {
    return cleanupConnection;
  }, [cleanupConnection]);

  // ----------------------------------------
  // TURN CONFIGURATION
  // ----------------------------------------

  const prefetchIceConfig = useCallback(async () => {
    try {
      const response = await fetch(
        `${getBackendUrl()}/api/turn-credentials`,
      );

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
      console.warn(
        "Could not fetch TURN credentials, falling back to STUN only.",
        error,
      );
    }
  }, []);

  // ----------------------------------------
  // DATA CHANNEL
  // ----------------------------------------

  const setupDataChannel = useCallback(
    (channel: RTCDataChannel) => {
      dataChannelRef.current = channel;

      channel.onopen = () => {
        console.log("Data channel opened successfully.");
      };

      channel.onmessage = (event) => {
        setMessages((prev) => [
          ...prev,
          {
            sender: "stranger",
            text: event.data,
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

      return pc;
    },
    [clearPeerConnection],
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
        console.log(
          "🔌 Socket connected:",
          newSocket.id,
        );

        setStatus(
          "Connected! Entering waiting pool...",
        );

        // Identity now comes from the
        // authenticated Firebase socket.
        newSocket.emit("find_match");
      });
      const handleUserBlocked = () => {
        console.log("🛑 User blocked successfully");

        resetForNextMatch();

        setStatus(
          "User blocked. Finding someone new..."
        );

        newSocket.emit("find_match");
      };

      newSocket.on(
        "user_blocked",
        handleUserBlocked
      );

      // ------------------------------------
      // SOCKET CONNECT ERROR
      // ------------------------------------

      newSocket.on("connect_error", (error) => {
        console.error("❌ SOCKET CONNECTION FAILED");
        console.error("message:", error.message);
        console.error("description:", error.description);
        console.error("context:", error.context);
        console.error("error:", error);

        setStatus(`Connection failed: ${error.message}`);
      });

      // ------------------------------------
      // BANNED USER
      // ------------------------------------

      newSocket.on("banned_alert", (data) => {
        setStatus(
          `🚨 ${data.message}`,
        );

        cleanupConnection();
      });

      // ------------------------------------
      // MATCH FOUND
      // ------------------------------------

      newSocket.on(
  "match_found",
  async (data) => {
    console.log(
      "🔥 MATCH_FOUND RECEIVED:",
      data
    );

    try {
      setStatus(
        "Match found! Connecting video..."
      );

      setRoomId(data.roomId);
      roomIdRef.current = data.roomId;

      pendingCandidates.current = [];

      setMessages([
        {
          sender: "system",
          text:
            "You are now chatting with a random stranger.",
        },
      ]);

      const currentStream =
        localStreamRef.current || stream;

      console.log(
        "🔥 Local stream:",
        currentStream
      );

      console.log(
        "🔥 Creating peer connection..."
      );

      const pc = createPeerConnection(
        newSocket,
        data.roomId,
        currentStream,
      );

      console.log(
        "🔥 Peer connection created:",
        pc
      );

      if (data.role === "initiator") {
        console.log(
          "🔥 I am the initiator"
        );

        const channel =
          pc.createDataChannel("chat");

        console.log(
          "🔥 Data channel created"
        );

        setupDataChannel(channel);

        console.log(
          "🔥 Creating WebRTC offer..."
        );

        const offer =
          await pc.createOffer();

        console.log(
          "🔥 Setting local description..."
        );

        await pc.setLocalDescription(
          offer
        );

        console.log(
          "🔥 Local description set, sending offer..."
        );

        newSocket.emit(
          "webrtc_offer",
          {
            offer,
            roomId: data.roomId,
          }
        );

        console.log(
          "🔥 WebRTC offer emitted"
        );

      } else {
        console.log(
          "🔥 I am the responder"
        );

        pc.ondatachannel = (event) => {
          console.log(
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
                console.warn(
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
                console.warn(
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
              console.warn(
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
        () => {
          setStatus(
            "Stranger disconnected. Click Next for someone new.",
          );

          setMessages((prev) => [
            ...prev,
            {
              sender: "system",
              text:
                "The stranger has disconnected.",
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
      setupDataChannel,
      resetForNextMatch,
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

      setStatus("Requesting camera...");

      setMessages([
        {
          sender: "system",
          text: "Connecting to server...",
        },
      ]);

      try {
        // ----------------------------------
        // CAMERA + MICROPHONE
        // ----------------------------------

        const stream =
          await navigator.mediaDevices.getUserMedia(
            {
              video: true,
              audio: true,
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

        const token =
          await user.getIdToken();

        // ----------------------------------
        // SOCKET.IO
        // ----------------------------------

        const newSocket = io(
          getBackendUrl(),
          {
            transports: ["websocket"],

            auth: {
              token,
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

        setStatus(
          "Error: Camera and Microphone permissions are required.",
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

    setStatus("Blocking user...");

    activeSocket.emit("block_user", {
      roomId: roomIdRef.current,
    });
  }, []);

  // ----------------------------------------
  // SEND MESSAGE
  // ----------------------------------------

  const sendMessage = useCallback(
    (event: FormEvent) => {
      event.preventDefault();

      const message =
        chatInput.trim();

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
    roomId,
    localStream,
    remoteStream,
    messages,
    chatInput,
    setChatInput,
    toggleSearch,
    next,
    block,
    sendMessage,
    cleanupConnection,
  };
}