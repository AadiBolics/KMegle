"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChatHeader from "./ChatHeader";
import ChatSidebar from "./ChatSidebar";
import VideoPanel from "./VideoPanel";
import { useChatSession } from "../../hooks/useChatSession";
import { useNsfwModeration } from "../../hooks/useNsfwModeration";
import { useTheme } from "../../../../context/themeContext";

export default function ChatDashboard() {
  const router = useRouter();

  const {
    socket,
    status,
    isConnecting,
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
    onCriticalViolation: () => {
      cleanupConnection();
    },
  });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const { isDarkMode, toggleDarkMode } = useTheme();
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

  const handleExit = () => {
    cleanupConnection();
    router.push("/");
  };
  const handleOpenSettings = () => {
    cleanupConnection();
  router.push("/settings");
};

  return (
    <div
      className={`h-[100dvh] w-full flex flex-col lg:flex-row overflow-hidden font-sans transition-colors duration-300 ${
        isDarkMode ? "bg-[#0a0a0f] text-white" : "bg-gray-50 text-gray-900"
      }`}
    >
      <ChatHeader
        isFullscreen={isFullscreen}
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
        status={status}
        isFullscreen={isFullscreen}
        isWarning={isWarning}
        isRemoteWarning={isRemoteWarning}
        isCooldownActive={isCooldownActive}
        cooldownRemaining={cooldownRemaining}
        onToggleSearch={toggleSearch}
        onNext={next}
        onBlock={block}
        onToggleFullscreen={() => setIsFullscreen((value) => !value)}
      />

      <ChatSidebar
        messages={messages}
        chatInput={chatInput}
        setChatInput={setChatInput}
        onSendMessage={sendMessage}
        remoteStream={remoteStream}
        isFullscreen={isFullscreen}
        isDarkMode={isDarkMode}
        chatEndRef={chatEndRef}
      />
    </div>
  );
}
