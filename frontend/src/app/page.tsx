"use client";

import { useState } from "react";
import { signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    const provider = new GoogleAuthProvider();

    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // The Gatekeeper Check
      if (user.email && (user.email.endsWith("@iiitkottayam.ac.in") || user.email.endsWith("@gmail.com"))) {
        // Success! Send them to the chat arena
        router.push("/chat");
      } else {
        // Intruder detected. Kick them out immediately.
        await signOut(auth);
        setError("Access Denied: You must use a valid @iiitkottayam.ac.in email.");
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      setError("An error occurred during login. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background Ambience (Matches the Chat/Admin screens) */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-900/20 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-900/10 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="bg-[#13141a]/80 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl max-w-md w-full p-10 text-center z-10 transform transition-all hover:scale-[1.01] duration-500">
        <h1 className="text-5xl font-black text-white tracking-tighter mb-3 drop-shadow-md">
          K-MEGLE<span className="text-indigo-500">.</span>
        </h1>
        <p className="text-gray-400 text-xs tracking-widest mb-10 uppercase font-bold">
          IIIT Kottayam Student Network
        </p>

        {/* Enhanced Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl mb-8 text-sm font-medium flex items-center justify-center gap-2 text-left leading-tight">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Premium Google Button */}
        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-black border border-transparent rounded-xl px-6 py-4 font-bold text-sm transition-all disabled:opacity-50 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
        >
          {isLoading ? (
            <div className="flex items-center gap-3 text-gray-700">
              <div className="w-5 h-5 border-2 border-gray-400 border-t-gray-800 rounded-full animate-spin"></div>
              Verifying Credential...
            </div>
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with College Email
            </>
          )}
        </button>
        
        <div className="mt-8 text-[10px] text-gray-500 tracking-widest uppercase font-semibold">
          Secured via Google Workspace Auth
        </div>
      </div>
    </div>
  );
}