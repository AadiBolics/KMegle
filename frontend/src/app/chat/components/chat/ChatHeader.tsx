"use client";


interface ChatHeaderProps {
  isFullscreen: boolean;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenSettings: () => void;
}

export default function ChatHeader({
  isFullscreen,
  isDarkMode,
  onToggleDarkMode,
  onOpenSettings,
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
          onClick={onOpenSettings}
          className="group bg-black/30 hover:bg-black/50 backdrop-blur-md border border-white/20 p-2 rounded-full text-white transition-all shadow-lg"
          title="Settings"
          aria-label="Open settings"
        >
          <svg
            className="w-5 h-5 transition-transform duration-300 group-hover:rotate-45"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
