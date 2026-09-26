"use client";

import { RefObject } from "react";

interface VideoPanelProps {
  remoteVideoRef: RefObject<HTMLVideoElement | null>;
  localVideoRef: RefObject<HTMLVideoElement | null>;
  remoteStream: MediaStream | null;
  socketConnected: boolean;
  isConnecting: boolean;
  status: string;
  isFullscreen: boolean;
  isWarning?: boolean;
  isCooldownActive?: boolean;
  cooldownRemaining?: number;
  onToggleSearch: () => void;
  onNext: () => void;
  onBlock: () => void;
  onToggleFullscreen: () => void;
}

export default function VideoPanel({
  remoteVideoRef,
  localVideoRef,
  remoteStream,
  socketConnected,
  isConnecting,
  status,
  isFullscreen,
  isWarning = false,
  isCooldownActive = false,
  cooldownRemaining = 0,
  onToggleSearch,
  onNext,
  onBlock,
  onToggleFullscreen,
}: VideoPanelProps) {
  const isBusy = isConnecting || socketConnected;

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
      } bg-black overflow-hidden transition-all duration-500`}
    >
      {/* Remote Video */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className={`absolute inset-0 w-full h-full object-cover transform scale-x-[-1] transition-opacity duration-700 ease-in-out ${
          remoteStream ? "opacity-100 z-10" : "opacity-0 z-0"
        }`}
      />

      {/* Local Video Preview */}
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className={`object-cover transform scale-x-[-1] transition-all duration-500 ease-in-out ${
          remoteStream
            ? "absolute top-4 right-4 lg:top-6 lg:right-6 w-24 lg:w-40 aspect-[3/4] rounded-2xl shadow-2xl border border-white/20 z-30 bg-black"
            : `absolute inset-0 w-full h-full ${
                socketConnected
                  ? "blur-2xl brightness-50 scale-110 z-0"
                  : "brightness-75 z-0"
              }`
        } ${isWarning ? "blur-[24px] brightness-75 ring-4 ring-amber-500/80" : ""}`}
      />

      {/* Warning Phase Banner */}
      {isWarning && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-lg animate-bounce">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-500/20 backdrop-blur-xl border border-amber-500/40 shadow-2xl text-amber-200">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/30 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="text-xs lg:text-sm font-semibold leading-snug">
              Inappropriate content detected. Please adjust your camera immediately.
            </div>
          </div>
        </div>
      )}

      {/* Moderation Cooldown Modal / Overlay */}
      {isCooldownActive && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h3 className="text-lg lg:text-xl font-bold text-white mb-1">
            Temporary Moderation Cooldown
          </h3>
          <p className="text-gray-300 text-xs lg:text-sm max-w-sm mb-4">
            Multiple violations of community guidelines were detected on your camera. Your matching privileges are temporarily suspended.
          </p>
          <div className="px-5 py-2.5 rounded-full bg-red-500/20 border border-red-500/30 text-red-300 font-mono font-bold text-lg">
            {formatCooldown(cooldownRemaining)}
          </div>
        </div>
      )}

      {!remoteStream && !isCooldownActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20 px-4 text-center">
          {(socketConnected || isConnecting) ? (
            <>
              <div className="w-12 h-12 lg:w-16 lg:h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4 lg:mb-6 shadow-[0_0_30px_rgba(99,102,241,0.5)]" />
              <p className="text-indigo-200 font-medium tracking-wide animate-pulse text-xs lg:text-base">
                {status}
              </p>
            </>
          ) : (
            <>
              <p className="text-gray-300 font-medium tracking-wide text-sm lg:text-base drop-shadow-md">
                Click Start to begin matching.
              </p>
              {/* Show error/info status even when disconnected */}
              {status && status !== "Ready to connect." && (
                <p className="mt-2 text-red-400 font-medium text-xs lg:text-sm drop-shadow-md max-w-xs">
                  {status}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Action Controls */}
      <div className="absolute bottom-4 lg:bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 lg:gap-3 p-2 rounded-full bg-black/70 backdrop-blur-xl border border-white/15 opacity-100 z-40 shadow-2xl max-w-[95vw] overflow-x-auto">
        <button
          onClick={onToggleSearch}
          disabled={isConnecting || isCooldownActive}
          className={`px-5 lg:px-8 py-2.5 lg:py-3 rounded-full font-bold text-xs lg:text-sm transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${
            isCooldownActive
              ? "bg-red-500/30 text-red-300 border border-red-500/30"
              : socketConnected
              ? "bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30"
              : isConnecting
              ? "bg-indigo-600/50 text-white/70 cursor-wait"
              : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)]"
          }`}
        >
          {isCooldownActive
            ? `Cooldown (${formatCooldown(cooldownRemaining)})`
            : socketConnected
            ? "Stop"
            : isConnecting
            ? "Connecting..."
            : "Start"}
        </button>

        {socketConnected && !isCooldownActive && (
          <button
            onClick={onNext}
            className="bg-white/15 hover:bg-white/25 text-white px-4 lg:px-6 py-2.5 lg:py-3 rounded-full font-bold text-xs lg:text-sm transition-all flex items-center gap-1.5 whitespace-nowrap"
          >
            Next
            <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {remoteStream && (
          <>
            <button
              onClick={onBlock}
              className="bg-red-500/20 hover:bg-red-500/40 text-red-300 px-3.5 lg:px-4 py-2.5 lg:py-3 rounded-full font-bold text-xs lg:text-sm transition-all border border-red-500/30 whitespace-nowrap"
              title="Block User"
            >
              Block
            </button>

            <button
              onClick={onToggleFullscreen}
              className="bg-white/15 hover:bg-white/25 text-white px-3.5 py-2.5 lg:py-3 rounded-full font-bold transition-all hidden md:block"
              title="Toggle Fullscreen"
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
