"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/authContext";

// Generates a random anonymous user ID for this session
function generateAnonymousId(): string {
  return "anon_" + crypto.randomUUID();
}

export default function LandingPage() {
  const { user, loading: authLoading, login } = useAuth();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [error, setError] = useState("");

  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!showTermsModal) return;
    openerRef.current = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    dialog?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setShowTermsModal(false); }
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], summary, [tabindex="0"]'));
      const first = controls[0]; const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      openerRef.current?.focus();
    };
  }, [showTermsModal]);

  // Step 1: returning, already-signed-in users have agreed to the terms
  // before — skip straight to chat instead of making them click through
  // the modal again. First-time visitors still see it via handleAgreeAndStart.
  const handleInitialStart = () => {
    setError("");

    if (user) {
      router.push("/chat");
      return;
    }

    setShowTermsModal(true);
  };

  // Step 2: User agreed to terms
  const handleAgreeAndStart = async () => {
    if (isLoading) return;

    setError("");
    setIsLoading(true);
    setShowTermsModal(false);

    try {
      // If the user isn't logged in, authenticate first.
      if (!user) {
        await login();
      }

      // Get or create a session ID.
      let userId = sessionStorage.getItem("kmegle_user_id");

      if (!userId) {
        userId = generateAnonymousId();
        sessionStorage.setItem("kmegle_user_id", userId);
      }

      router.push("/chat");
    } catch (err) {
      console.error("Login error:", err);

      const code =
        err instanceof Object && "code" in err
          ? (err as { code?: string }).code
          : undefined;

      if (code === "auth/popup-closed-by-user") {
        setIsLoading(false);
        return;
      }

      setError("Google sign-in failed. Please try again.");
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <main className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background Ambience */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-900/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-900/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Animated floating orb */}
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
          0%, 100% {
            transform: translateY(0px) scale(1);
          }

          50% {
            transform: translateY(-20px) scale(1.05);
          }
        }

        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .fade-up {
          animation: fadeUp 0.6s ease forwards;
        }

        .fade-up-delay {
          animation: fadeUp 0.6s ease 0.15s forwards;
          opacity: 0;
        }

        .fade-up-delay-2 {
          animation: fadeUp 0.6s ease 0.3s forwards;
          opacity: 0;
        }

        .fade-up-delay-3 {
          animation: fadeUp 0.6s ease 0.45s forwards;
          opacity: 0;
        }
      `}</style>

      <div className="bg-[#13141a]/80 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-10 text-center z-10">

        {/* Logo */}
        <div className="fade-up">
          <h1 className="text-6xl font-black text-white tracking-tighter mb-2 drop-shadow-md">
            KMegle<span className="text-indigo-500">.</span>
          </h1>

          <p className="text-gray-400 text-xs tracking-widest mb-2 uppercase font-bold">
            Random Video Chat
          </p>

          <p className="text-gray-300 text-sm mb-6">
            Random video chat for students. Google sign-in required; camera and microphone access comes next.
          </p>
        </div>

        {/* Feature pills */}
        <div className="fade-up-delay grid grid-cols-2 gap-2 mb-6">
          {["Video chat", "No public profiles", "Google sign-in", "18+ only"].map(
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

        {/* CTA */}
        <div className="fade-up-delay-2">
          <button
            id="start-chat-btn"
            onClick={handleInitialStart}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-6 py-4 font-bold text-base transition-all disabled:opacity-70 active:scale-95 shadow-[0_0_30px_rgba(99,102,241,0.4)] hover:shadow-[0_0_40px_rgba(99,102,241,0.6)]"
          >
            {isLoading ? (
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-indigo-300 border-t-white rounded-full animate-spin" />
                Signing in...
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

                {user ? "Start Chatting" : "Continue with Google"}
              </>
            )}
          </button>
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="fade-up-delay-3 mt-5 text-sm text-gray-300 leading-relaxed">
          Review the <button type="button" onClick={() => setShowTermsModal(true)} className="underline underline-offset-4 min-h-11 px-1 text-indigo-300 hover:text-indigo-200 focus-visible:outline-2 focus-visible:outline-offset-2">Safety &amp; Terms</button> before continuing.
        </div>
        <p className="mt-2 text-sm"><a href="/policies" className="inline-flex min-h-11 items-center px-2 underline underline-offset-4 text-indigo-300">Terms &amp; Privacy</a></p>
        <p className="mt-3 text-sm text-gray-300">Need help? <a href="mailto:aadinadhan17@gmail.com" className="inline-flex min-h-11 items-center underline underline-offset-4 text-indigo-300 break-all">Contact support</a></p>
        <div className="mt-6 pt-6 border-t border-white/10 text-left">
          <h2 className="text-base font-semibold text-white mb-3">Before you connect</h2>
          <ol className="space-y-2 text-sm text-gray-300 leading-relaxed list-decimal pl-5">
            <li>Review the safety rules and sign in with Google.</li>
            <li>Allow camera and microphone access when you start a session.</li>
            <li>Use Stop to leave, or Block and Report for unsafe behavior.</li>
          </ol>
          <p className="mt-4 text-sm text-gray-300 leading-relaxed">Video quality depends on your device and connection. Another participant can record their screen. Do not share private information.</p>
        </div>
      </div>

      {/* TERMS MODAL */}
      {showTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm">
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="safety-title" aria-describedby="safety-description" tabIndex={-1} className="bg-[#13141a] border border-white/10 rounded-2xl max-w-lg w-full max-h-[calc(100dvh-1.5rem)] flex flex-col overflow-hidden shadow-2xl focus:outline-none">
            <div className="overflow-y-auto min-h-0 p-5 sm:p-8 pb-2 sm:pb-3">

            <h2 id="safety-title" className="text-2xl font-bold text-white mb-2">
              Safety & Terms
            </h2>

            <p id="safety-description" className="text-gray-300 text-sm mb-5">
              You must agree to these rules before using KMegle.
            </p>

            <details className="mb-5 text-left"><summary className="cursor-pointer min-h-11 py-3 text-sm font-semibold text-indigo-300">Before you connect: data notice</summary><div className="space-y-4 text-sm leading-relaxed text-gray-300">
<p>KMegle uses Google sign-in through Firebase Authentication. The service receives your account ID and email. Its database stores your account ID and a keyed hash of your email; service logs may include your email and account ID.</p>
<p>Video and audio use WebRTC. Connections may be direct or use a TURN relay when needed. A direct connection can reveal your public IP address to the other participant. KMegle&apos;s reviewed application code does not record video or audio, but another participant can record their screen.</p>
<p>For safety, KMegle stores reports, report reasons, blocks and violation records linked to account IDs. Automated content checks run in the browser during a session.</p>
<p>Retention periods and the policies of hosting, authentication and relay providers still need to be confirmed. Do not share passwords, financial details or other private information in a chat.</p>
</div><a href="/policies" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline text-indigo-300">Read Terms &amp; Privacy</a></details>
            <div className="space-y-4 text-sm text-gray-300 mb-4 bg-black/30 p-4 rounded-xl border border-white/5">

              <div className="flex gap-3">
                <span className="text-indigo-500 font-bold">1.</span>
                <p>
                  <strong>
                    You must be at least 18 years old (or the legal
                    age of majority in your jurisdiction)
                  </strong>{" "}
                  to use KMegle video chat.
                </p>
              </div>

              <div className="flex gap-3">
                <span className="text-indigo-500 font-bold">2.</span>
                <p>
                  <strong>
                    No nudity, sexual content, or harassment.
                  </strong>{" "}
                  Violations may result in account suspension.
                </p>
              </div>

              <div className="flex gap-3">
                <span className="text-indigo-500 font-bold">3.</span>
                <p>
                  <strong>Report bad behavior.</strong> Use the
                  Block & Report functionality when necessary.
                </p>
              </div>

              <div className="flex gap-3">
                <span className="text-indigo-500 font-bold">4.</span>
                <p>
                  Video streams are peer-to-peer. We do not record
                  or store your video, but connection metadata may
                  be logged for moderation and abuse prevention.
                </p>
              </div>
            </div>

            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 p-4 sm:px-8 border-t border-white/10 shrink-0 bg-[#13141a]">

              <button
                onClick={() => setShowTermsModal(false)}
                className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={handleAgreeAndStart}
                disabled={isLoading}
                className="w-full flex-1 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50"
              >
                {isLoading
                  ? "Signing in..."
                  : user
                    ? "I Agree & Continue"
                    : "I Agree & Continue with Google"}
              </button>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
