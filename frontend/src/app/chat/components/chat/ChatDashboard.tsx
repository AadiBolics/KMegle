"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChatHeader from "./ChatHeader";
import ChatSidebar from "./ChatSidebar";
import VideoPanel from "./VideoPanel";
import { useChatSession } from "../../hooks/useChatSession";
import { useNsfwModeration } from "../../hooks/useNsfwModeration";
import { useAuth } from "../../../../context/authContext";
import { useTheme } from "../../../../context/themeContext";

export default function ChatDashboard() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const {
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
  } = useChatSession();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const {
    isWarning,
    isCooldownActive,
    cooldownRemaining,
    isRemoteWarning,
  } = useNsfwModeration({
    localVideoRef,
    remoteVideoRef,
    isActive: !!localStream,
    socket,
    roomId,
    onCriticalViolation: () => {
      cleanupConnection();
    },
  });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wantsSelfExpanded, setWantsSelfExpanded] = useState(false);
  const { isDarkMode, toggleDarkMode } = useTheme();

  // Full-screen self view only makes sense during a call; it ends the
  // moment the remote stream drops, and Escape leaves it too.
  const isSelfExpanded = wantsSelfExpanded && !!remoteStream;

  useEffect(() => {
    if (!isSelfExpanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWantsSelfExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isSelfExpanded]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (!remoteVideoRef.current) return;

    remoteVideoRef.current.srcObject = remoteStream;

    if (remoteStream) {
      remoteVideoRef.current
        .play()
        .catch((error) =>
          console.warn("Remote video play prevented by browser policy:", error),
        );
    }
  }, [remoteStream]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Redirect unauthenticated visitors instead of letting them sit on the
  // full chat UI with camera controls that silently refuse to do anything.
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/");
    }
  }, [authLoading, user, router]);

  const handleOpenSettings = () => {
    cleanupConnection();
    router.push("/settings");
  };

  if (authLoading || !user) {
    return (
      <div
        className={`h-[100dvh] w-full flex items-center justify-center font-sans transition-colors duration-300 ${
          isDarkMode ? "bg-[#221C16] text-[#F7F2EA]" : "bg-[#F7F2EA] text-[#211B14]"
        }`}
      >
        <div
          className={`w-8 h-8 border-4 rounded-full animate-spin ${
            isDarkMode
              ? "border-[#C24A17]/30 border-t-[#C24A17]"
              : "border-[#C24A17]/30 border-t-[#C24A17]"
          }`}
        />
      </div>
    );
  }

  return (
    <div
      className={`h-[100dvh] w-full flex flex-col lg:flex-row overflow-hidden font-sans transition-colors duration-300 ${
        isDarkMode ? "bg-[#221C16] text-[#F7F2EA]" : "bg-[#F7F2EA] text-[#211B14]"
      }`}
    >
      <ChatHeader
        isFullscreen={isFullscreen || isSelfExpanded}
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
        onOpenSettings={handleOpenSettings}
      />

      <VideoPanel
        remoteVideoRef={remoteVideoRef}
        localVideoRef={localVideoRef}
        remoteStream={remoteStream}
        socketConnected={!!socket}
        isConnecting={isConnecting}
        connectionPhase={connectionPhase}
        isError={isError}
        status={status}
        isFullscreen={isFullscreen}
        isSelfExpanded={isSelfExpanded}
        isWarning={isWarning}
        isRemoteWarning={isRemoteWarning}
        isCooldownActive={isCooldownActive}
        cooldownRemaining={cooldownRemaining}
        isDarkMode={isDarkMode}
        onToggleSearch={toggleSearch}
        onNext={next}
        onBlock={block}
        onReport={reportUser}
        onToggleFullscreen={() => setIsFullscreen((value) => !value)}
        onToggleSelfExpand={() => setWantsSelfExpanded((value) => !value)}
      />

      <ChatSidebar
        messages={messages}
        chatInput={chatInput}
        setChatInput={setChatInput}
        onSendMessage={sendMessage}
        remoteStream={remoteStream}
        connectionPhase={connectionPhase}
        isFullscreen={isFullscreen}
        isDarkMode={isDarkMode}
        chatEndRef={chatEndRef}
      />
    </div>
  );
}
