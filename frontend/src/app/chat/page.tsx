"use client";

import { useEffect, useState, useRef } from "react";
import { auth } from "../../lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";

import PremiumDrawer from "../../components/premiumDrawer";
import PremiumModal from "../../components/premiumModal";
import ProfileCaptureModal from "@/src/components/profileCaptureModal";

interface ChatMessage {
  sender: "me" | "stranger" | "system";
  text: string;
}

export default function ChatDashboard() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<string>("Ready to connect.");
  const [roomId, setRoomId] = useState<string | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const roomIdRef = useRef<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isIncognito, setIsIncognito] = useState(true);
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(true);
  

  const router = useRouter();

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (
        user &&
        (user.email?.endsWith("@iiitkottayam.ac.in") ||
          user.email?.endsWith("@gmail.com"))
      ) {
        setUserEmail(user.email);
        setIsLoading(false);
      } else {
        router.push("/");
      }
    });

    return () => {
      unsubscribe();
      cleanupConnection();
    };
  }, [router]);


  const handleProfileSubmit = async (gender: string, college: string) => {
    // 1. Double check we actually have the Firebase user data
    if (!auth.currentUser || !userEmail) return;

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
      
      // 2. Fire the payload to your Node.js server
      const response = await fetch(`${backendUrl}/api/users/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: auth.currentUser.uid,
          email: userEmail,
          gender: gender,
          college: college
        }),
      });

      if (!response.ok) throw new Error("Backend rejected the profile initialization.");

      // 3. Success! Unlock the gate and let them into the app.
      console.log("Profile locked in. Welcome to K-Megle.");
      setIsCaptureModalOpen(false);
      
    } catch (error) {
      console.error("Network error:", error);
      // Optional: You could add a small error state here to show on the UI
    }
  };

  const cleanupConnection = () => {
    if (socket && roomId) socket.emit("leave_room", { roomId });
    if (peerConnectionRef.current) peerConnectionRef.current.close();
    if (localStream) localStream.getTracks().forEach((track) => track.stop());

    setSocket(null);
    setLocalStream(null);
    setRemoteStream(null);
    setRoomId(null);
    dataChannelRef.current = null;
    setMessages([]);
    pendingCandidates.current = [];    
  };

  const resetForNextMatch = () => {
    if (peerConnectionRef.current) peerConnectionRef.current.close();
    if (socket && roomId) socket.emit("leave_room", { roomId });

    setRemoteStream(null);
    setRoomId(null);
    dataChannelRef.current = null;
    setMessages([{ sender: "system", text: "Looking for a new stranger..." }]);
  };

  const handleLogout = async () => {
    cleanupConnection();
    await signOut(auth);
    router.push("/");
  };

  const setupDataChannel = (channel: RTCDataChannel) => {
    dataChannelRef.current = channel;
    channel.onopen = () => console.log("Data channel open!");
    channel.onmessage = (event) => {
      setMessages((prev) => [
        ...prev,
        { sender: "stranger", text: event.data },
      ]);
    };
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !chatInput.trim() ||
      !dataChannelRef.current ||
      dataChannelRef.current.readyState !== "open"
    )
      return;

    dataChannelRef.current.send(chatInput);
    setMessages((prev) => [...prev, { sender: "me", text: chatInput }]);
    setChatInput("");
  };

  // UPDATED: Now sends the Firebase UID to the server
  const handleNext = () => {
    if (!socket) return;
    resetForNextMatch();
    setStatus("Skipped. Entering the waiting pool...");
    socket.emit("find_match", { userId: auth.currentUser?.uid });
  };

  // NEW: The Block Logic
  const handleBlock = () => {
    if (!socket || !roomId) return;

    // 1. Tell the backend to blacklist this room pair
    socket.emit("block_user", { roomId });

    // 2. Disconnect and find someone new instantly
    resetForNextMatch();
    setStatus("User blocked. Finding someone new...");
    socket.emit("find_match", { userId: auth.currentUser?.uid });
  };

  const handleToggleSearch = async () => {
    if (socket) {
      socket.emit("stop_search");
      cleanupConnection();
      setStatus("Disconnected. Ready to search.");
    } else {
      setStatus("Requesting camera...");
      setMessages([{ sender: "system", text: "Connecting to server..." }]);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        setStatus("Camera active. Connecting to server...");
        // Automatically detects your laptop's Wi-Fi IP address
        const backendUrl =
          process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
        const newSocket = io(backendUrl, {
          transports: ["websocket"], // Keep this to prevent Cloudflare 502 errors!
        });
        setSocket(newSocket);

        newSocket.on("connect", () => {
          setStatus("Connected! Entering the waiting pool...");
          // UPDATED: Sends identity to the database when entering the queue
          newSocket.emit("find_match", { userId: auth.currentUser?.uid });
        });

        // --- NEW: Listen for Banned Alerts ---
        newSocket.on("banned_alert", (data) => {
          setStatus(`🚨 ${data.message}`);
          cleanupConnection(); // Immediately rip them out of the socket
        });

        newSocket.on("match_found", async (data) => {
          setStatus(`Match found! Connecting secure video...`);
          setRoomId(data.roomId);
          roomIdRef.current = data.roomId;
          setMessages([
            {
              sender: "system",
              text: "You are now chatting with a random student.",
            },
          ]);

          // 1. Fetch the secure TURN credentials from your own backend
          let dynamicIceServers: RTCConfiguration = {
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
          };
          try {
            // Use the env variable, with a fallback just in case
            const backendUrl =
              process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
            const turnRes = await fetch(`${backendUrl}/api/turn-credentials`);
            const turnData = await turnRes.json();

            dynamicIceServers = {
              iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
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
              ],
            };
          } catch (err) {
            console.error(
              "Could not fetch TURN servers, falling back to STUN only.",
            );
          }

          // 2. Pass the dynamic servers into the Peer Connection!
          const pc = new RTCPeerConnection(dynamicIceServers);
          peerConnectionRef.current = pc;

          stream.getTracks().forEach((track) => pc.addTrack(track, stream));

          pc.ontrack = (event) => {
            setRemoteStream(event.streams[0]);
            if (remoteVideoRef.current)
              remoteVideoRef.current.srcObject = event.streams[0];
          };

          pc.onicecandidate = (event) => {
            if (event.candidate)
              newSocket.emit("webrtc_ice_candidate", {
                candidate: event.candidate,
                roomId: data.roomId,
              });
          };

          if (data.role === "initiator") {
            const dc = pc.createDataChannel("chat");
            setupDataChannel(dc);

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            newSocket.emit("webrtc_offer", { offer, roomId: data.roomId });
          } else {
            pc.ondatachannel = (event) => setupDataChannel(event.channel);
          }
        });

        newSocket.on("webrtc_offer", async ({ offer }) => {
          const pc = peerConnectionRef.current;
          if (!pc || pc.signalingState === "closed") return;

          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          // Send the answer back
          newSocket.emit("webrtc_answer", { answer, roomId:roomIdRef.current });

          // NEW: Flush the waiting room! Add any ICE candidates that arrived early
          pendingCandidates.current.forEach(async (candidate) => {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {}
          });
          pendingCandidates.current = []; // Clear the queue
        });

        newSocket.on("webrtc_answer", async ({ answer }) => {
          const pc = peerConnectionRef.current;
          
          // NEW: If the connection is dead, OR if it is already finished (stable), ignore the packet!
          if (!pc || pc.signalingState === "closed" || pc.signalingState === "stable") return;

          try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));

            // Flush the waiting room! Add any ICE candidates that arrived early
            pendingCandidates.current.forEach(async (candidate) => {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
              } catch (e) {}
            });
            pendingCandidates.current = []; // Clear the queue
          } catch (err) {
            console.error("Error setting remote description:", err);
          }
        });

        newSocket.on("webrtc_ice_candidate", async ({ candidate }) => {
          const pc = peerConnectionRef.current;
          if (!pc || pc.signalingState === "closed") return;

          // NEW: If the handshake is done, add it. If not, put it in the waiting room!
          if (pc.remoteDescription) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {}
          } else {
            pendingCandidates.current.push(candidate);
          }
        });
        newSocket.on("stranger_disconnected", () => {
          setStatus("Stranger disconnected.");
          setMessages((prev) => [
            ...prev,
            { sender: "system", text: "The stranger has disconnected." },
          ]);
          if (peerConnectionRef.current) peerConnectionRef.current.close();
          setRemoteStream(null);
          setRoomId(null);
          dataChannelRef.current = null;
        });
      } catch (error) {
        setStatus("Error: Camera and Microphone permissions are required.");
      }
    }
  };

  if (isLoading)
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex justify-center items-center">
        <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );

  return (
    <div className="h-screen w-full bg-[#0a0a0f] text-white flex flex-col md:flex-row overflow-hidden font-sans relative">
      
      {/* 🚨 INJECT THE NEW CAPTURE MODAL HERE */}
      <ProfileCaptureModal
        isOpen={isCaptureModalOpen}
        userEmail={userEmail}
        onSubmit={handleProfileSubmit}
      />

      {/* Inject our Modular Components */}
      <PremiumDrawer 
        isOpen={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)}
        userEmail={userEmail}
        onLogout={handleLogout}
        onTriggerModal={() => {
          setIsModalOpen(true);
        }}
        isIncognito={isIncognito}
        onToggleIncognito={() => setIsIncognito(!isIncognito)}
      />

      <PremiumModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      {/* HEADER: Updated with dynamic Burger Icon */}
      {!isFullscreen && (
        <header className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-40 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
          <h1 className="text-2xl font-black text-white tracking-tighter drop-shadow-md pointer-events-auto">
            K-MEGLE<span className="text-indigo-500">.</span>
          </h1>
          
          {/* THE LOCK LOGIC: Only show the burger menu if NOT in an active chat */}
          {!remoteStream && (
             <button
               onClick={() => setIsDrawerOpen(true)}
               className="p-2 bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/10 rounded-xl transition-all pointer-events-auto shadow-lg group"
             >
               <svg className="w-6 h-6 text-gray-300 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
               </svg>
             </button>
          )}
        </header>
      )}

      {/* LEFT SIDE: The Video Engine */}
      <div className={`relative group flex-grow ${isFullscreen ? 'absolute inset-0 z-50' : 'w-full md:w-[70%] h-[60vh] md:h-full'} bg-black overflow-hidden transition-all duration-500`}>
        
        {/* STRANGER VIDEO: Always in the DOM to prevent WebRTC crashes, but hidden when waiting */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`absolute inset-0 w-full h-full object-cover transform scale-x-[-1] transition-opacity duration-700 ease-in-out ${
            remoteStream ? "opacity-100 z-10" : "opacity-0 z-0"
          }`}
        />

        {/* LOCAL VIDEO: Fullscreen/Blurred when waiting, shrinks to Picture-in-Picture when matched */}
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className={`object-cover transform scale-x-[-1] transition-all duration-700 ease-in-out ${
            remoteStream
              ? "absolute top-6 right-6 w-28 md:w-40 aspect-[3/4] rounded-2xl shadow-2xl border border-white/20 z-30 bg-black"
              : `absolute inset-0 w-full h-full ${
                  socket ? "blur-2xl brightness-50 scale-110 z-0" : "brightness-75 z-0"
                }`
          }`}
        />

        {/* WAITING OVERLAYS: The spinning ring and status text */}
        {!remoteStream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20">
            {socket ? (
              <>
                <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-6 shadow-[0_0_30px_rgba(99,102,241,0.5)]"></div>
                <p className="text-indigo-200 font-medium tracking-wide animate-pulse">{status}</p>
              </>
            ) : (
              <p className="text-gray-400 font-medium tracking-wide">Camera Ready.</p>
            )}
          </div>
        )}

        {/* GLASS CONTROLS: Floating pill that fades in on hover/tap */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 p-2 rounded-full bg-black/50 backdrop-blur-xl border border-white/10 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 z-40 shadow-2xl">
          <button
            onClick={handleToggleSearch}
            className={`px-8 py-3 rounded-full font-bold text-sm transition-all ${
              socket
                ? "bg-white/10 hover:bg-white/20 text-white"
                : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)]"
            }`}
          >
            {socket ? "Stop" : "Start"}
          </button>

          {socket && (
            <button
              onClick={handleNext}
              className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-full font-bold text-sm transition-all flex items-center gap-2 group"
            >
              Next
              <svg className="w-4 h-4 text-indigo-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {remoteStream && (
            /* Professional FULLSCREEN Button */
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="bg-white/10 hover:bg-white/20 text-white px-4 py-3 rounded-full font-bold transition-all ml-2"
            >
              {isFullscreen ? (
                <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 14h6m0 0v6m0-6l-7 7m17-11h-6m0 0V4m0 6l7-7m-7 17v-6m0 0h6m-6 0l7 7M4 10h6m0 0V4m0 6l-7-7" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* RIGHT SIDE: Chat Sidebar */}
      <div 
        className={`${
          isFullscreen
            ? "absolute bottom-20 right-4 w-80 h-96 z-50 bg-transparent"
            : "w-full md:w-[30%] h-[40vh] md:h-full bg-[#13141a] border-l border-white/5"
        } flex flex-col transition-all duration-500`}
      >
        {!isFullscreen && (
          <div className="p-4 border-b border-white/5 bg-[#13141a] flex justify-between items-center shadow-sm z-10">
            <h2 className="text-sm font-bold text-gray-300 tracking-wide uppercase">Live Chat</h2>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
          </div>
        )}

        <div 
          className="flex-grow p-4 overflow-y-auto flex flex-col gap-4 scrollbar-hide"
          style={{
            maskImage: isFullscreen ? 'linear-gradient(to top, black 80%, transparent)' : 'none',
            WebkitMaskImage: isFullscreen ? 'linear-gradient(to top, black 80%, transparent)' : 'none'
          }}
        >
          {messages.length === 0 && !isFullscreen && (
            <div className="text-center text-gray-500 mt-auto mb-auto font-mono text-xs">
              Waiting for connection...
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex flex-col ${
                msg.sender === "me"
                  ? "items-end"
                  : msg.sender === "system"
                  ? "items-center"
                  : "items-start"
              }`}
            >
              {msg.sender === "stranger" && !isFullscreen && (
                <span className="text-[10px] text-gray-500 ml-2 mb-1 uppercase tracking-wider font-bold">
                  Stranger
                </span>
              )}
              <span
                className={`px-4 py-2.5 max-w-[85%] text-sm shadow-sm backdrop-blur-md leading-relaxed ${
                  msg.sender === "me"
                    ? "bg-indigo-600 text-white rounded-2xl rounded-br-sm"
                    : msg.sender === "system"
                    ? "bg-white/5 text-gray-400 text-xs font-mono rounded-full px-4 border border-white/5"
                    : "bg-white/10 text-white rounded-2xl rounded-bl-sm border border-white/5"
                }`}
              >
                {msg.text}
              </span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <form
          onSubmit={handleSendMessage}
          className={`p-4 ${isFullscreen ? "bg-transparent" : "bg-[#13141a] border-t border-white/5"}`}
        >
          <div className="relative flex items-center shadow-lg rounded-full">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={remoteStream ? "Message..." : "Waiting..."}
              disabled={!remoteStream}
              className={`w-full ${
                isFullscreen
                  ? "bg-black/40 backdrop-blur-xl border border-white/20 placeholder-gray-300"
                  : "bg-[#1e2028] border border-transparent placeholder-gray-500"
              } rounded-full pl-5 pr-12 py-3.5 text-sm text-white focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/70 disabled:opacity-50 transition-all`}
            />
            <button
              type="submit"
              disabled={!remoteStream || !chatInput.trim()}
              className="absolute right-1.5 w-10 h-10 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 rounded-full disabled:opacity-50 transition-all"
            >
              <svg className="w-4 h-4 text-white ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
