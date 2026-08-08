"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Generates a random anonymous user ID for this session
function generateAnonymousId(): string {
  return "anon_" + crypto.randomUUID();
}

export default function LandingPage() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleStart = () => {
    setIsLoading(true);

    // Get or create a persistent anonymous ID for this browser session
    let userId = sessionStorage.getItem("kmegle_user_id");
    if (!userId) {
      userId = generateAnonymousId();
      sessionStorage.setItem("kmegle_user_id", userId);
    }

    router.push("/chat");
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background Ambience */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-900/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-900/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Animated floating orbs */}
      <div
        className="absolute w-96 h-96 rounded-full pointer-events-none opacity-30"
        style={{
          background:
            "radial-gradient(circle, rgba(99,102,241,0.3) 0%, transparent 70%)",
          top: "10%",
          right: "15%",
          animation: "float 8s ease-in-out infinite",
        }}
      />

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-20px) scale(1.05); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.6s ease forwards; }
        .fade-up-delay { animation: fadeUp 0.6s ease 0.15s forwards; opacity: 0; }
        .fade-up-delay-2 { animation: fadeUp 0.6s ease 0.3s forwards; opacity: 0; }
        .fade-up-delay-3 { animation: fadeUp 0.6s ease 0.45s forwards; opacity: 0; }
      `}</style>

      <div className="bg-[#13141a]/80 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl max-w-md w-full p-10 text-center z-10 transform transition-all hover:scale-[1.01] duration-500">
        {/* Logo */}
        <div className="fade-up">
          <h1 className="text-6xl font-black text-white tracking-tighter mb-2 drop-shadow-md">
            KMegle<span className="text-indigo-500">.</span>
          </h1>
          <p className="text-gray-400 text-xs tracking-widest mb-2 uppercase font-bold">
            Free Random Video Chat
          </p>
          <p className="text-gray-500 text-sm mb-8">
            Meet strangers from around the world, instantly & anonymously
          </p>
        </div>

        {/* Feature pills */}
        <div className="fade-up-delay flex flex-wrap justify-center gap-2 mb-8">
          {["100% Anonymous", "No Sign-up", "Free Forever", "HD Video"].map(
            (feat) => (
              <span
                key={feat}
                className="text-xs bg-white/5 border border-white/10 text-gray-300 px-3 py-1 rounded-full font-medium"
              >
                ✓ {feat}
              </span>
            )
          )}
        </div>

        {/* CTA Button */}
        <div className="fade-up-delay-2">
          <button
            id="start-chat-btn"
            onClick={handleStart}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-6 py-4 font-bold text-base transition-all disabled:opacity-70 active:scale-95 shadow-[0_0_30px_rgba(99,102,241,0.4)] hover:shadow-[0_0_40px_rgba(99,102,241,0.6)]"
          >
            {isLoading ? (
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-indigo-300 border-t-white rounded-full animate-spin" />
                Connecting...
              </div>
            ) : (
              <>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Start Chatting — It&apos;s Free
              </>
            )}
          </button>
        </div>

        {/* Trust line */}
        <div className="fade-up-delay-3 mt-6 text-[11px] text-gray-500 tracking-wide">
          By clicking, you agree to our{" "}
          <span className="text-gray-400 underline cursor-pointer hover:text-gray-200 transition-colors">
            Terms of Service
          </span>
          . No personal data is collected.
        </div>

        {/* What is KMegle — SEO-friendly hidden text block */}
        <div className="mt-10 pt-8 border-t border-white/5 text-left">
          <h2 className="text-sm font-bold text-gray-400 mb-3">
            The Best Omegle Alternative
          </h2>
          <p className="text-xs text-gray-600 leading-relaxed">
            KMegle connects you with random strangers worldwide for free, anonymous
            video chat. No account, no email, no sign-up — just click and chat.
            Whether you&apos;re looking for an Omegle alternative, random video
            chat, or just want to meet new people, KMegle is the fastest and
            safest way to talk to strangers online.
          </p>
        </div>
      </div>
    </div>
  );
}