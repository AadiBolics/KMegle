"use client";

interface ChatHeaderProps {
  isFullscreen: boolean;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onExit: () => void;
}

export default function ChatHeader({
  isFullscreen,
  isDarkMode,
  onToggleDarkMode,
  onExit,
}: ChatHeaderProps) {
  if (isFullscreen) return null;

  return (
    <header className="absolute top-0 left-0 w-full p-4 lg:p-6 flex justify-between items-center z-40 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
      <h1 className="text-2xl font-black text-white tracking-tighter drop-shadow-md pointer-events-auto">
        KMegle<span className="text-indigo-500">.</span>
      </h1>

      <div className="flex items-center gap-3 pointer-events-auto">
        <button
          onClick={onToggleDarkMode}
          className="bg-black/30 hover:bg-black/50 backdrop-blur-md border border-white/20 p-2 rounded-full text-white transition-all shadow-lg"
          title="Toggle Theme"
        >
          {isDarkMode ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        <button
          onClick={onExit}
          className="bg-black/30 hover:bg-black/50 backdrop-blur-md border border-white/20 px-5 py-2 rounded-full text-sm font-semibold text-white transition-all shadow-lg"
        >
          Exit
        </button>
      </div>
    </header>
  );
}
