"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/authContext";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
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
  } catch (err: any) {
    console.error("Login error:", err);

    if (err?.code === "auth/popup-closed-by-user") {
      return;
    }

    setError("Google sign-in failed. Please try again.");
  } finally {
    setLoggingIn(false);
  }
};

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border p-8 shadow-lg">
        <h1 className="text-3xl font-bold">
          Welcome to KMegle
        </h1>

        <p className="mt-2 text-gray-500">
          Random video chat exclusively for IIIT Kottayam.
        </p>

        <button
  onClick={handleLogin}
  disabled={loggingIn}
  className="mt-8 w-full rounded-xl bg-black px-4 py-3 text-white transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
>
  {loggingIn ? "Opening Google..." : "Continue with Google"}
</button>

        {error && (
          <p className="mt-4 text-center text-sm text-red-500">
            {error}
          </p>
        )}

        <p className="mt-6 text-center text-xs text-gray-500">
          Only @iiitkottayam.ac.in accounts are allowed.
        </p>
      </div>
    </main>
  );
}