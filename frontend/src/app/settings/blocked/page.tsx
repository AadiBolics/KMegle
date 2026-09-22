"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../context/authContext";
import { useTheme } from "../../../context/themeContext";

interface BlockedUser {
  blockRef: string;
  createdAt: string;
}

export default function BlockedUsersPage() {
  const router = useRouter();

  const { user, loading: authLoading } = useAuth();
  const { isDarkMode } = useTheme();

  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.replace("/");
      return;
    }

    const loadBlockedUsers = async () => {
      try {
        setLoading(true);
        setError("");

        const token = await user.getIdToken();

        const backendUrl =
          process.env.NEXT_PUBLIC_BACKEND_URL ||
          "http://localhost:5000";

        const response = await fetch(
          `${backendUrl}/api/blocks`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("Failed to load blocked users");
        }

        const data = await response.json();

        setBlockedUsers(data);
      } catch (err) {
        console.error("❌ Failed to load blocked users:", err);
        setError("Unable to load blocked users.");
      } finally {
        setLoading(false);
      }
    };

    loadBlockedUsers();
  }, [user, authLoading, router]);

  const handleUnblock = async (blockRef: string) => {
    if (!user || unblocking) return;

    try {
      setUnblocking(blockRef);
      setError("");

      const token = await user.getIdToken();

      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        "http://localhost:5000";

      const response = await fetch(
        `${backendUrl}/api/blocks/${blockRef}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to unblock user");
      }

      setBlockedUsers((current) =>
        current.filter(
          (blockedUser) =>
            blockedUser.blockRef !== blockRef
        )
      );
    } catch (err) {
      console.error("❌ Failed to unblock user:", err);
      setError("Unable to unblock user.");
    } finally {
      setUnblocking(null);
    }
  };

  if (authLoading || loading) {
    return (
      <main
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode
            ? "bg-[#0a0a0f] text-white"
            : "bg-gray-50 text-gray-900"
        }`}
      >
        <p
          className={
            isDarkMode
              ? "text-gray-400"
              : "text-gray-500"
          }
        >
          Loading blocked users...
        </p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main
      className={`min-h-screen px-4 py-8 transition-colors duration-300 ${
        isDarkMode
          ? "bg-[#0a0a0f] text-white"
          : "bg-gray-50 text-gray-900"
      }`}
    >
      <div className="mx-auto w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push("/settings")}
            className={`w-10 h-10 rounded-full border flex items-center justify-center transition ${
              isDarkMode
                ? "bg-white/5 border-white/10 hover:bg-white/10"
                : "bg-white border-gray-200 hover:bg-gray-100"
            }`}
            aria-label="Back to settings"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>

          <div>
            <h1 className="text-2xl font-bold">
              Blocked Users
            </h1>

            <p
              className={`text-sm ${
                isDarkMode
                  ? "text-gray-500"
                  : "text-gray-600"
              }`}
            >
              Manage users you have blocked
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
              isDarkMode
                ? "bg-red-500/10 border-red-500/20 text-red-400"
                : "bg-red-50 border-red-200 text-red-600"
            }`}
          >
            {error}
          </div>
        )}

        {/* Empty state */}
        {blockedUsers.length === 0 && !error ? (
          <div
            className={`rounded-2xl border p-8 text-center ${
              isDarkMode
                ? "bg-[#13141a] border-white/10"
                : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            {/*<div className="text-4xl mb-4">
              ✓
            </div>*/}

            <h2 className="font-semibold text-lg">
              No blocked users
            </h2>

            <p
              className={`text-sm mt-2 ${
                isDarkMode
                  ? "text-gray-500"
                  : "text-gray-600"
              }`}
            >
              Users you block will appear here.
            </p>
          </div>
        ) : (
          <div
            className={`border rounded-2xl overflow-hidden ${
              isDarkMode
                ? "bg-[#13141a] border-white/10"
                : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            {blockedUsers.map((blockedUser, index) => (
              <div
                key={blockedUser.blockRef}
                className={`flex items-center justify-between gap-4 p-5 ${
                  index !== blockedUsers.length - 1
                    ? isDarkMode
                      ? "border-b border-white/5"
                      : "border-b border-gray-100"
                    : ""
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
                      isDarkMode
                        ? "bg-white/10"
                        : "bg-gray-100"
                    }`}
                  >
                    <svg
                      className="w-5 h-5 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M18 20a6 6 0 00-12 0m9-10a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  </div>

                  <div className="min-w-0">
                    <p className="font-semibold">
                      Anonymous user
                    </p>

                    <p
                      className={`text-sm mt-1 ${
                        isDarkMode
                          ? "text-gray-500"
                          : "text-gray-600"
                      }`}
                    >
                      Blocked{" "}
                      {new Date(
                        blockedUser.createdAt
                      ).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() =>
                    handleUnblock(
                      blockedUser.blockRef
                    )
                  }
                  disabled={
                    unblocking ===
                    blockedUser.blockRef
                  }
                  className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition ${
                    isDarkMode
                      ? "bg-white/5 hover:bg-white/10 border border-white/10"
                      : "bg-gray-50 hover:bg-gray-100 border border-gray-200"
                  } ${
                    unblocking ===
                    blockedUser.blockRef
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }`}
                >
                  {unblocking === blockedUser.blockRef
                    ? "Unblocking..."
                    : "Unblock"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}