"use client";

import { FormEvent, RefObject } from "react";
import { ChatMessage, ConnectionPhase } from "../../types/chat";

interface ChatSidebarProps {
  messages: ChatMessage[];
  chatInput: string;
  setChatInput: (value: string) => void;
  onSendMessage: (event: FormEvent) => void;
  remoteStream: MediaStream | null;
  connectionPhase: ConnectionPhase;
  isFullscreen: boolean;
  isDarkMode: boolean;
  chatEndRef: RefObject<HTMLDivElement | null>;
}

export default function ChatSidebar({
  messages,
  chatInput,
  setChatInput,
  onSendMessage,
  remoteStream,
  connectionPhase,
  isFullscreen,
  isDarkMode,
  chatEndRef,
}: ChatSidebarProps) {
  const dotColor =
    connectionPhase === "live"
      ? "bg-green-500"
      : connectionPhase === "idle"
        ? "bg-gray-500"
        : "bg-amber-400";
  const dotPinging = connectionPhase !== "idle";
  const dotLabel =
    connectionPhase === "live"
      ? "Connected to a stranger"
      : connectionPhase === "idle"
        ? "Not connected"
        : "Searching for a stranger";
  return (
    <div
      className={`${
        isFullscreen
          ? "absolute bottom-20 right-4 w-80 h-96 z-50 bg-black/80 backdrop-blur-xl rounded-2xl border border-white/10"
          : `flex-1 lg:w-[30%] lg:h-full flex flex-col transition-colors duration-300 ${
              isDarkMode
                ? "bg-[#1B1611] border-t lg:border-t-0 lg:border-l border-white/5"
                : "bg-white border-t lg:border-t-0 lg:border-l border-gray-200"
            }`
      }`}
    >
      {!isFullscreen && (
        <div
          className={`p-3 lg:p-4 border-b flex justify-between items-center shadow-sm z-10 ${
            isDarkMode
              ? "bg-[#1B1611] border-white/5"
              : "bg-[#FFFDF9] border-[#E5DCD0]"
          }`}
        >
          <h2
            className={`font-display text-base lg:text-lg font-bold ${
              isDarkMode ? "text-[#EDE4D6]" : "text-[#211B14]"
            }`}
          >
            Live chat
          </h2>

          <span
            className="flex h-2 w-2 relative"
            role="status"
            aria-label={dotLabel}
            title={dotLabel}
          >
            {dotPinging && (
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColor}`}
              />
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 transition-colors duration-300 ${dotColor}`}
            />
          </span>
        </div>
      )}

      <div
        aria-live="polite"
        className="flex-grow p-3 lg:p-4 overflow-y-auto flex flex-col gap-3 lg:gap-4 scrollbar-hide"
      >
        {messages.length === 0 && !isFullscreen && (
          <div
            className={`text-center mt-auto mb-auto font-mono text-xs ${
              isDarkMode ? "text-gray-500" : "text-gray-400"
            }`}
          >
            Press Start to connect with strangers.
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={`${message.sender}-${index}`}
            className={`flex flex-col ${
              message.sender === "me"
                ? "items-end"
                : message.sender === "system"
                  ? "items-center"
                  : "items-start"
            }`}
          >
            {message.sender === "stranger" && !isFullscreen && (
              <span
                className={`text-[9px] lg:text-[10px] ml-2 mb-1 uppercase tracking-wider font-bold ${
                  isDarkMode ? "text-gray-500" : "text-gray-400"
                }`}
              >
                Stranger
              </span>
            )}

            <span
              className={`px-3 lg:px-4 py-2 lg:py-2.5 max-w-[85%] break-words whitespace-pre-wrap text-xs lg:text-sm shadow-sm leading-relaxed ${
                message.sender === "me"
                  ? "bg-[#C24A17] text-white rounded-2xl rounded-br-sm"
                  : message.sender === "system"
                    ? `text-[10px] lg:text-xs font-mono rounded-full px-3 lg:px-4 border text-center ${
                        isDarkMode
                          ? "bg-white/5 text-gray-400 border-white/5"
                          : "bg-gray-100 text-gray-500 border-gray-200"
                      }`
                    : `rounded-2xl rounded-bl-sm border ${
                        isDarkMode
                          ? "bg-white/10 text-white border-white/5"
                          : "bg-gray-100 text-gray-800 border-gray-200"
                      }`
              }`}
            >
              {message.text}
            </span>
          </div>
        ))}

        <div ref={chatEndRef} />
      </div>

      <form
        onSubmit={onSendMessage}
        className={`p-3 lg:p-4 ${
          isFullscreen
            ? "bg-transparent"
            : isDarkMode
              ? "bg-[#1B1611] border-t border-white/5"
              : "bg-[#FFFDF9] border-t border-[#E5DCD0]"
        }`}
      >
        <div className="relative flex items-center shadow-sm rounded-full">
          <input
            type="text"
            maxLength={1000}
            aria-label="Chat message"
            autoComplete="off"
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder={remoteStream ? "Type a message..." : "Waiting..."}
            disabled={!remoteStream}
            className={`w-full rounded-full pl-4 lg:pl-5 pr-11 lg:pr-12 py-3 lg:py-3.5 text-base lg:text-sm focus:outline-none focus:border-[#C24A17]/70 focus:ring-1 focus:ring-[#C24A17]/70 disabled:opacity-50 transition-all ${
              isFullscreen
                ? "bg-black/40 backdrop-blur-xl border border-white/20 text-white placeholder-gray-300"
                : isDarkMode
                  ? "bg-[#2A231C] border-transparent text-white placeholder-gray-500"
                  : "bg-[#F7F2EA] border-[#E5DCD0] text-[#211B14] placeholder-[#6B6156]"
            }`}
          />

          <button
            type="submit"
            aria-label="Send message"
            disabled={!remoteStream || !chatInput.trim()}
            className="absolute right-1 w-8 h-8 lg:w-10 lg:h-10 flex items-center justify-center bg-[#C24A17] hover:bg-[#A93E13] rounded-full disabled:opacity-50 transition-all"
          >
            <svg
              className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M3.4 20.4l17.45-7.48c.81-.35.81-1.49 0-1.84L3.4 3.6c-.66-.29-1.39.2-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .72.73 1.2 1.39.91z" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
