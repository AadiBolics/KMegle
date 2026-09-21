"use client";

import { FormEvent, RefObject } from "react";
import { ChatMessage } from "../../types/chat";

interface ChatSidebarProps {
  messages: ChatMessage[];
  chatInput: string;
  setChatInput: (value: string) => void;
  onSendMessage: (event: FormEvent) => void;
  remoteStream: MediaStream | null;
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
  isFullscreen,
  isDarkMode,
  chatEndRef,
}: ChatSidebarProps) {
  return (
    <div
      className={`${
        isFullscreen
          ? "absolute bottom-20 right-4 w-80 h-96 z-50 bg-black/80 backdrop-blur-xl rounded-2xl border border-white/10"
          : `flex-1 lg:w-[30%] lg:h-full flex flex-col transition-colors duration-300 ${
              isDarkMode
                ? "bg-[#13141a] border-t lg:border-t-0 lg:border-l border-white/5"
                : "bg-white border-t lg:border-t-0 lg:border-l border-gray-200"
            }`
      }`}
    >
      {!isFullscreen && (
        <div
          className={`p-3 lg:p-4 border-b flex justify-between items-center shadow-sm z-10 ${
            isDarkMode
              ? "bg-[#13141a] border-white/5"
              : "bg-white border-gray-100"
          }`}
        >
          <h2
            className={`text-xs lg:text-sm font-bold tracking-wide uppercase ${
              isDarkMode ? "text-gray-300" : "text-gray-700"
            }`}
          >
            Live Chat
          </h2>

          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        </div>
      )}

      <div className="flex-grow p-3 lg:p-4 overflow-y-auto flex flex-col gap-3 lg:gap-4 scrollbar-hide">
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
              className={`px-3 lg:px-4 py-2 lg:py-2.5 max-w-[85%] text-xs lg:text-sm shadow-sm leading-relaxed ${
                message.sender === "me"
                  ? "bg-indigo-600 text-white rounded-2xl rounded-br-sm"
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
              ? "bg-[#13141a] border-t border-white/5"
              : "bg-white border-t border-gray-100"
        }`}
      >
        <div className="relative flex items-center shadow-sm rounded-full">
          <input
            type="text"
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder={remoteStream ? "Type a message..." : "Waiting..."}
            disabled={!remoteStream}
            className={`w-full rounded-full pl-4 lg:pl-5 pr-11 lg:pr-12 py-3 lg:py-3.5 text-xs lg:text-sm focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/70 disabled:opacity-50 transition-all ${
              isFullscreen
                ? "bg-black/40 backdrop-blur-xl border border-white/20 text-white placeholder-gray-300"
                : isDarkMode
                  ? "bg-[#1e2028] border-transparent text-white placeholder-gray-500"
                  : "bg-gray-100 border-gray-200 text-gray-900 placeholder-gray-500"
            }`}
          />

          <button
            type="submit"
            disabled={!remoteStream || !chatInput.trim()}
            className="absolute right-1 w-8 h-8 lg:w-10 lg:h-10 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 rounded-full disabled:opacity-50 transition-all"
          >
            <svg
              className="w-3 h-3 lg:w-4 lg:h-4 text-white ml-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
