"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/authContext";
import { useTheme } from "../../context/themeContext";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const { isDarkMode } = useTheme();
  const router = useRouter();

  const [error, setError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/chat");
    }
  }, [user, loading, router]);

  const handleLogin = async () => {
    if (loggingIn) return;

    setError("");
    setLoggingIn(true);

    try {
      await login();
    } catch (err) {
      console.error("Login error:", err);

      const code =
        err instanceof Object && "code" in err
          ? (err as { code?: string }).code
          : undefined;

      if (code === "auth/popup-closed-by-user") {
        return;
      }

      setError("Google sign-in failed. Please try again.");
    } finally {
      setLoggingIn(false);
    }
  };

  if (loading) {
    return (
      <main
        className={`flex min-h-screen items-center justify-center transition-colors duration-300 ${
          isDarkMode ? "bg-[#221C16]" : "bg-[#F7F2EA]"
        }`}
      >
        <div
          className={`w-8 h-8 border-4 rounded-full animate-spin ${
            isDarkMode
              ? "border-[#C24A17]/30 border-t-[#C24A17]"
              : "border-[#C24A17]/30 border-t-[#C24A17]"
          }`}
        />
      </main>
    );
  }

  return (
    <main
      className={`flex min-h-screen items-center justify-center p-4 transition-colors duration-300 ${
        isDarkMode ? "bg-[#221C16] text-[#F7F2EA]" : "bg-[#F7F2EA] text-[#211B14]"
      }`}
    >
      <div
        className={`w-full max-w-md rounded-3xl border p-8 shadow-2xl transition-colors duration-300 ${
          isDarkMode
            ? "bg-[#1B1611] border-[#3A3128]"
            : "bg-[#FFFDF9] border-[#E5DCD0]"
        }`}
      >
        <h1 className="font-display text-3xl font-bold tracking-tight">
          kmegle<span className="text-[#C24A17]">.</span>
        </h1>

        <p
          className={`mt-2 text-sm ${
            isDarkMode ? "text-gray-400" : "text-gray-600"
          }`}
        >
          Random video chat exclusively for IIIT Kottayam.
        </p>

        <button
          onClick={handleLogin}
          disabled={loggingIn}
          className="mt-8 w-full flex items-center justify-center gap-3 rounded-xl bg-[#C24A17] hover:bg-[#A93E13] px-4 py-3.5 font-bold text-[#FFFDF9] transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loggingIn ? (
            <>
              <div className="w-4 h-4 border-2 border-[#E9A583] border-t-white rounded-full animate-spin" />
              Opening Google...
            </>
          ) : (
            "Continue with Google"
          )}
        </button>

        {error && (
          <p className="mt-4 text-center text-sm text-red-500">{error}</p>
        )}

        <p
          className={`mt-6 text-center text-xs ${
            isDarkMode ? "text-gray-500" : "text-gray-500"
          }`}
        >
          Only @iiitkottayam.ac.in accounts are allowed.
        </p>
      </div>
    </main>
  );
}
