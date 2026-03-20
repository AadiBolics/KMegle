"use client";

interface PremiumModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PremiumModal({ isOpen, onClose }: PremiumModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 transition-opacity">
      <div className="bg-[#13141a] border border-white/10 rounded-3xl w-full max-w-md p-8 shadow-[0_0_50px_rgba(99,102,241,0.15)] relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-indigo-600/30 blur-[60px] rounded-full pointer-events-none"></div>

        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center mt-4">
          {/* Custom SVG Crown */}
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border border-yellow-500/30 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(234,179,8,0.15)]">
            <svg className="w-8 h-8 text-yellow-500 drop-shadow-md" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2 19h20v2H2v-2zm2.14-2h15.72l-1.41-9.87L15 11l-3-6-3 6-3.45-3.87L4.14 17z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-white mb-2 tracking-tight">Unlock God-Mode.</h2>
          <p className="text-gray-400 text-sm mb-8 leading-relaxed">
            Skip the free queues. Pick your matches. Reconnect with lost connections. Experience K-Megle with zero limits.
          </p>

          <div className="space-y-3 text-left mb-8">
            {["Priority Fast-Pass Matching", "Filter by Gender & College", "Incognito Mode", "Rewind & Reconnect"].map((feature, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-gray-200">
                <svg className="w-5 h-5 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                {feature}
              </div>
            ))}
          </div>

          {/* Shimmering Gold CTA Button */}
          <button className="relative overflow-hidden group w-full bg-gradient-to-r from-yellow-600 to-yellow-500 text-black font-extrabold py-4 rounded-xl transition-all hover:scale-[1.02] shadow-[0_0_20px_rgba(234,179,8,0.2)]">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,transparent,rgba(255,255,255,0.7),transparent)] -translate-x-[150%] skew-x-[-30deg] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out pointer-events-none"></div>
            <span className="relative z-10 flex items-center justify-center gap-2">
              Upgrade to Pro — ₹199/mo
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}