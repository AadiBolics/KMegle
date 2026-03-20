"use client";

interface PremiumDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string | null;
  onLogout: () => void;
  onTriggerModal: () => void;
  isPremium?: boolean;
  isIncognito?: boolean; // NEW: Track their ghost state
  onToggleIncognito?: () => void; // NEW: Function to flip the switch
}

export default function PremiumDrawer({
  isOpen,
  onClose,
  userEmail,
  onLogout,
  onTriggerModal,
  isPremium = false,
  isIncognito = true,
  onToggleIncognito,
}: PremiumDrawerProps) {
  
  const handlePremiumClick = () => {
    if (!isPremium) {
      onTriggerModal();
    }
  };

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-full max-w-sm bg-[#13141a]/95 backdrop-blur-2xl border-l border-white/10 z-50 transform transition-transform duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isOpen ? "translate-x-0" : "translate-x-full"
        } flex flex-col shadow-2xl`}
      >
        {/* HEADER */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-black/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white shadow-md">
              {userEmail ? userEmail[0].toUpperCase() : "U"}
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-tight">
                {userEmail ? userEmail.split("@")[0] : "Student"}
              </p>
              <p className="text-[10px] text-indigo-400 font-mono mt-0.5 uppercase tracking-wider bg-indigo-500/10 inline-block px-2 py-0.5 rounded-full">
                {isIncognito ? "Ghost Mode" : "Verified User"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/10">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* CONTENT */}
        <div className="flex-grow overflow-y-auto p-6 space-y-8 scrollbar-hide">
          
          {/* 👻 ZONE A: Privacy & Profile (NEW) */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Privacy</h3>
            
            <div className="p-4 rounded-2xl bg-[#1a1b23] border border-white/5 flex justify-between items-center transition-all hover:bg-white/5">
              <div>
                <p className="text-sm font-medium text-white flex items-center gap-2">
                  Incognito Mode
                </p>
                <p className="text-[10px] text-gray-400 mt-1 leading-relaxed max-w-[200px]">
                  Hide your specific college badge. Others will just see "Verified Student".
                </p>
              </div>
              
              {/* iOS-Style Toggle Switch */}
              <button 
                onClick={() => {
                   // If it's a premium feature to unmask, check here. 
                   // If free for everyone, just fire the toggle.
                   if (!isPremium) {
                     onTriggerModal();
                   } else if (onToggleIncognito) {
                     onToggleIncognito();
                   }
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 focus:outline-none ${
                  isIncognito ? 'bg-indigo-600' : 'bg-gray-700'
                }`}
              >
                <span 
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${
                    isIncognito ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* ZONE B: Filters */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Match Filters</h3>
            
            {/* Location Toggle */}
            <div 
              onClick={handlePremiumClick}
              className={`p-4 rounded-2xl border border-white/5 flex justify-between items-center cursor-pointer transition-all ${!isPremium ? 'opacity-70 hover:opacity-100 bg-[#1a1b23]' : 'bg-indigo-600/10 border-indigo-500/30'}`}
            >
              <div>
                <p className="text-sm font-medium text-white flex items-center gap-2">
                  Match Radius 
                  {!isPremium && (
                    <span className="flex items-center gap-1 text-[9px] bg-gradient-to-r from-yellow-500/20 to-yellow-600/10 border border-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded uppercase tracking-wider font-bold">
                      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M2 19h20v2H2v-2zm2.14-2h15.72l-1.41-9.87L15 11l-3-6-3 6-3.45-3.87L4.14 17z" /></svg>
                      Pro
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-1">Global</p>
              </div>
              <div className="w-12 h-6 bg-black rounded-full relative border border-white/10">
                 <div className="absolute left-1 top-1 w-4 h-4 rounded-full bg-gray-500"></div>
              </div>
            </div>

            {/* Gender Toggle */}
            <div 
              onClick={handlePremiumClick}
              className={`p-4 rounded-2xl border border-white/5 flex justify-between items-center cursor-pointer transition-all ${!isPremium ? 'opacity-70 hover:opacity-100 bg-[#1a1b23]' : 'bg-indigo-600/10 border-indigo-500/30'}`}
            >
              <div>
                <p className="text-sm font-medium text-white flex items-center gap-2">
                  Preferred Gender 
                  {!isPremium && (
                    <span className="flex items-center gap-1 text-[9px] bg-gradient-to-r from-yellow-500/20 to-yellow-600/10 border border-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded uppercase tracking-wider font-bold">
                      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M2 19h20v2H2v-2zm2.14-2h15.72l-1.41-9.87L15 11l-3-6-3 6-3.45-3.87L4.14 17z" /></svg>
                      Pro
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-1">Anyone</p>
              </div>
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
          </div>

          {/* ZONE C: Recent Connections */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
              Recent Connections
              <span className="flex h-1.5 w-1.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
              </span>
            </h3>
            <div className="space-y-2">
              {[1, 2, 3].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-800 border border-white/10 flex items-center justify-center">
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </div>
                    <div>
                      <p className="text-sm text-gray-300 font-medium">Stranger</p>
                      <p className="text-[10px] text-gray-500">2 mins ago</p>
                    </div>
                  </div>
                  <button onClick={handlePremiumClick} className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded-full hover:bg-indigo-500/20 transition-colors flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    {!isPremium && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>}
                    Ping
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-6 border-t border-white/5 bg-black/20 space-y-4">
          {!isPremium && (
            <div 
              onClick={onTriggerModal} 
              className="relative overflow-hidden w-full bg-[#1a1b23] border border-white/5 p-4 rounded-2xl cursor-pointer transition-all hover:scale-[1.02] hover:border-yellow-500/30 shadow-[0_4px_20px_rgba(0,0,0,0.5)] group"
            >
              <div className="absolute inset-0 bg-[linear-gradient(to_right,transparent,rgba(234,179,8,0.1),transparent)] -translate-x-[150%] skew-x-[-30deg] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out pointer-events-none"></div>
              <div className="relative z-10 flex justify-between items-center mb-1">
                <p className="font-bold text-white text-sm group-hover:text-yellow-400 transition-colors">K-Megle Pro</p>
                <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2 19h20v2H2v-2zm2.14-2h15.72l-1.41-9.87L15 11l-3-6-3 6-3.45-3.87L4.14 17z" />
                </svg>
              </div>
              <p className="relative z-10 text-[10px] text-gray-400">Unlock God-Mode features.</p>
            </div>
          )}
          
          <button 
            onClick={onLogout}
            className="w-full py-3 text-sm font-bold text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
          >
            Log Out
          </button>
        </div>
      </div>
    </>
  );
}