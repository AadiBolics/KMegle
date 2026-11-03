"use client";

import { RefObject } from "react";
import { ConnectionPhase } from "../../types/chat";

interface VideoPanelProps {
  remoteVideoRef: RefObject<HTMLVideoElement | null>;
  localVideoRef: RefObject<HTMLVideoElement | null>;
  remoteStream: MediaStream | null;
  socketConnected: boolean;
  isConnecting: boolean;
  connectionPhase: ConnectionPhase;
  isError: boolean;
  status: string;
  isFullscreen: boolean;
  isSelfExpanded: boolean;
  isWarning?: boolean;
  isRemoteWarning?: boolean;
  isCooldownActive?: boolean;
  cooldownRemaining?: number;
  isDarkMode?: boolean;
  onToggleSearch: () => void;
  onNext: () => void;
  onBlock: () => void;
  onReport?: () => void;
  onToggleFullscreen: () => void;
  onToggleSelfExpand: () => void;
}

export default function VideoPanel({
  remoteVideoRef,
  localVideoRef,
  remoteStream,
  socketConnected,
  isConnecting,
  connectionPhase,
  isError,
  status,
  isFullscreen,
  isSelfExpanded,
  isWarning = false,
  isRemoteWarning = false,
  isCooldownActive = false,
  cooldownRemaining = 0,
  isDarkMode = true,
  onToggleSearch,
  onNext,
  onBlock,
  onReport,
  onToggleFullscreen,
  onToggleSelfExpand,
}: VideoPanelProps) {
  const handleBlock = () => {
    if (window.confirm("Block this user? You won't be matched with them again.")) {
      onBlock();
    }
  };

  const handleReport = () => {
    if (window.confirm("Report this user and end the chat?")) {
      onReport?.();
    }
  };

  const formatCooldown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`relative group flex-shrink-0 ${
        isFullscreen
          ? "fixed inset-0 z-[100] w-screen h-[100dvh]"
          : "w-full lg:w-[70%] h-[55dvh] lg:h-full"
      } overflow-hidden transition-all duration-500 ${
        isDarkMode ? "bg-[#221C16]" : "bg-gray-900"
      }`}
    >
      {/* Remote Video */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className={`object-cover transition-all duration-300 ease-in-out ${
          isSelfExpanded && remoteStream
            ? "absolute top-4 right-4 lg:top-6 lg:right-6 w-24 lg:w-40 aspect-[3/4] rounded-2xl shadow-2xl border border-white/20 z-[120] bg-black opacity-100"
            : `absolute inset-0 w-full h-full ${
                remoteStream ? "opacity-100 z-10" : "opacity-0 z-0"
              }`
        } ${isRemoteWarning ? "blur-[32px] brightness-50 ring-4 ring-red-500/70" : ""}`}
      />

      {/* Local Video Preview */}
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className={`object-cover transform scale-x-[-1] transition-all duration-500 ease-in-out ${
          isSelfExpanded && remoteStream
            ? "fixed inset-0 z-[110] w-screen h-screen supports-[height:100dvh]:h-[100dvh] bg-black"
            : remoteStream
              ? "absolute top-16 right-4 lg:top-20 lg:right-6 w-24 lg:w-40 aspect-[3/4] rounded-2xl shadow-2xl border border-white/20 z-30 bg-black"
              : `absolute inset-0 w-full h-full ${
                  socketConnected
                    ? "blur-2xl brightness-50 scale-110 z-0"
                    : "brightness-75 z-0"
                }`
        } ${isWarning ? "blur-[24px] brightness-75 ring-4 ring-amber-500/80" : ""}`}
      />

      {/* Expand own video to full screen (sits over the self-view corner tile) */}
      {remoteStream && !isSelfExpanded && (
        <div className="absolute top-16 right-4 lg:top-20 lg:right-6 w-24 lg:w-40 aspect-[3/4] z-40 pointer-events-none">
          <button
            onClick={onToggleSelfExpand}
            className="absolute left-1.5 bottom-1.5 pointer-events-auto bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/25 p-1.5 rounded-lg text-white transition-all"
            title="Make your video full screen"
            aria-label="Make your video full screen"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        </div>
      )}

      {/* Back to the call layout when own video is full screen */}
      {isSelfExpanded && remoteStream && (
        <button
          onClick={onToggleSelfExpand}
          className="fixed top-4 left-4 lg:top-6 lg:left-6 z-[130] bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/25 px-3.5 py-2 rounded-full text-white text-xs font-bold transition-all flex items-center gap-1.5"
          title="Back to the call layout"
          aria-label="Exit full-screen self view"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 14h6m0 0v6m0-6l-7 7m17-11h-6m0 0V4m0 6l7-7m-7 17v-6m0 0h6m-6 0l7 7M4 10h6m0 0V4m0 6l-7-7" />
          </svg>
          Back to call
        </button>
      )}

      {/* Warning Phase Banner — local sender */}
      {isWarning && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-md">
          <div
            className="flex items-start gap-3 px-4 py-3.5 rounded-xl shadow-xl"
            style={{
              background: "rgba(180,120,0,0.18)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(234,179,8,0.35)",
            }}
          >
            {/* Icon */}
            <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-lg bg-yellow-400/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-yellow-300" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </div>
            {/* Text */}
            <div>
              <p className="text-yellow-200 text-xs font-bold uppercase tracking-widest mb-0.5">Content Warning</p>
              <p className="text-yellow-100/80 text-xs leading-relaxed">
                Your camera may be showing content that violates our guidelines. Please adjust your position.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Remote Warning Banner — stranger's feed is blurred */}
      {isRemoteWarning && !isWarning && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-md">
          <div
            className="flex items-start gap-3 px-4 py-3.5 rounded-xl shadow-xl"
            style={{
              background: "rgba(140,0,0,0.22)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(239,68,68,0.35)",
            }}
          >
            {/* Icon */}
            <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-lg bg-red-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-red-300" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 1a9 9 0 100 18A9 9 0 0010 1zm3.536 5.464a.75.75 0 010 1.06L11.06 10l2.476 2.476a.75.75 0 11-1.06 1.06L10 11.06l-2.476 2.476a.75.75 0 11-1.06-1.06L8.94 10 6.464 7.524a.75.75 0 011.06-1.06L10 8.94l2.476-2.476a.75.75 0 011.06 0z" clipRule="evenodd" />
              </svg>
            </div>
            {/* Text */}
            <div>
              <p className="text-red-300 text-xs font-bold uppercase tracking-widest mb-0.5">Feed Hidden</p>
              <p className="text-red-100/75 text-xs leading-relaxed">
                The other person&apos;s video has been blurred. We&apos;re keeping an eye on it.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Moderation Cooldown Overlay */}
      {isCooldownActive && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-lg p-6">
          <div className="w-full max-w-xs text-center">
            {/* Icon ring */}
            <div className="mx-auto w-14 h-14 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mb-5">
              <svg className="w-6 h-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l2.5 2.5" />
              </svg>
            </div>

            <h3 className="text-white text-base font-semibold mb-1">You&apos;re on a break</h3>
            <p className="text-gray-400 text-xs leading-relaxed mb-5 max-w-[240px] mx-auto">
              We noticed repeated content violations. Matching is paused for a short while.
            </p>

            {/* Countdown pill */}
            <div
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}
            >
              <svg className="w-3.5 h-3.5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
              </svg>
              <span className="text-red-300 font-mono font-semibold text-sm tabular-nums">{formatCooldown(cooldownRemaining)}</span>
            </div>
          </div>
        </div>
      )}

      {!remoteStream && !isCooldownActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20 px-4 text-center">
          {!isError &&
          (connectionPhase === "connecting" ||
            connectionPhase === "waiting" ||
            connectionPhase === "negotiating") ? (
            <>
              <div className="w-12 h-12 lg:w-16 lg:h-16 border-4 border-[#C24A17]/30 border-t-[#C24A17] rounded-full animate-spin mb-4 lg:mb-6" />
              <p
                aria-live="polite"
                className="text-[#EDE4D6] font-medium tracking-wide animate-pulse text-xs lg:text-base"
              >
                {status}
              </p>
            </>
          ) : (
            <p
              aria-live="polite"
              className={`font-medium tracking-wide text-sm lg:text-base drop-shadow-md ${
                isError ? "text-red-300" : "text-gray-300"
              }`}
            >
              {status || "Click Start to begin matching."}
            </p>
          )}
        </div>
      )}

      {/* Action Controls */}
      <div className={`absolute bottom-4 lg:bottom-6 left-1/2 -translate-x-1/2 flex flex-wrap justify-center items-center gap-2 lg:gap-3 p-2 rounded-2xl bg-black/70 backdrop-blur-xl border border-white/15 opacity-100 shadow-2xl w-max max-w-[calc(100%-1rem)] ${isSelfExpanded ? "z-[120]" : "z-40"}`}>
        <button
          onClick={onToggleSearch}
          disabled={isCooldownActive}
          className={`min-h-11 px-5 lg:px-8 py-2.5 lg:py-3 rounded-full font-bold text-xs lg:text-sm transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${
            isCooldownActive
              ? "bg-red-500/30 text-red-300 border border-red-500/30"
              : socketConnected
              ? "bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30"
              : isConnecting
              ? "bg-[#C24A17] text-white"
              : "bg-[#C24A17] hover:bg-[#A93E13] text-white"
          }`}
        >
          {isCooldownActive
            ? `Cooldown (${formatCooldown(cooldownRemaining)})`
            : socketConnected
            ? "Stop"
            : isConnecting
            ? "Cancel"
            : "Start"}
        </button>

        {socketConnected && !isCooldownActive && (
          <button
            onClick={onNext}
            className="min-h-11 bg-white/15 hover:bg-white/25 text-white px-4 lg:px-6 py-2.5 lg:py-3 rounded-full font-bold text-xs lg:text-sm transition-all flex items-center gap-1.5 whitespace-nowrap"
          >
            Next
            <svg className="w-4 h-4 text-[#E9A583]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {remoteStream && (
          <>
            <button
              onClick={handleBlock}
              className="min-h-11 bg-red-500/20 hover:bg-red-500/40 text-red-300 px-3.5 lg:px-4 py-2.5 lg:py-3 rounded-full font-bold text-xs lg:text-sm transition-all border border-red-500/30 whitespace-nowrap"
              title="Block User"
              aria-label="Block this user"
            >
              Block
            </button>

            {onReport && (
              <button
                onClick={handleReport}
                className="min-h-11 bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 px-3.5 lg:px-4 py-2.5 lg:py-3 rounded-full font-bold text-xs lg:text-sm transition-all border border-rose-500/30 whitespace-nowrap"
                title="Report User"
                aria-label="Report this user"
              >
                Report
              </button>
            )}

            <button
              onClick={onToggleFullscreen}
              className="bg-white/15 hover:bg-white/25 text-white px-3.5 py-2.5 lg:py-3 rounded-full font-bold transition-all hidden md:block"
              title="Toggle Fullscreen"
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? (
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 14h6m0 0v6m0-6l-7 7m17-11h-6m0 0V4m0 6l7-7m-7 17v-6m0 0h6m-6 0l7 7M4 10h6m0 0V4m0 6l-7-7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
