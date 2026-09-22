"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "../../context/authContext";
import { useTheme } from "../../context/themeContext";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const { isDarkMode } = useTheme();

  const handleLogout = async () => {
    try {
      await logout();
      router.replace("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (loading) {
    return (
      <main
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode
            ? "bg-[#0a0a0f] text-white"
            : "bg-gray-50 text-gray-900"
        }`}
      >
        <p className={isDarkMode ? "text-gray-400" : "text-gray-500"}>
          Loading...
        </p>
      </main>
    );
  }

  if (!user) {
    router.replace("/");
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
            onClick={() => router.push("/chat")}
            className={`w-10 h-10 rounded-full border flex items-center justify-center transition ${
              isDarkMode
                ? "bg-white/5 border-white/10 hover:bg-white/10"
                : "bg-white border-gray-200 hover:bg-gray-100"
            }`}
            aria-label="Back to chat"
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
              Settings
            </h1>

            <p
              className={`text-sm ${
                isDarkMode ? "text-gray-500" : "text-gray-600"
              }`}
            >
              Manage your account and privacy
            </p>
          </div>
        </div>

        {/* Account */}
        <section className="mb-8">
          <h2
            className={`text-xs font-bold uppercase tracking-widest mb-3 ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            Account
          </h2>

          <div
            className={`border rounded-2xl p-5 transition-colors ${
              isDarkMode
                ? "bg-[#13141a] border-white/10"
                : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            <div className="flex items-center gap-4">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt=""
                  className="w-12 h-12 rounded-full"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-lg font-bold text-white">
                  {user.email?.charAt(0).toUpperCase() || "U"}
                </div>
              )}

              <div className="min-w-0">
                <p className="font-semibold">
                  {user.displayName || "KMegle User"}
                </p>

                <p
                  className={`text-sm truncate ${
                    isDarkMode ? "text-gray-500" : "text-gray-600"
                  }`}
                >
                  {user.email}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Privacy & Safety */}
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
            Privacy & Safety
          </h2>

          <div
            className={`border rounded-2xl overflow-hidden ${
              isDarkMode
                ? "bg-[#13141a] border-white/10"
                : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            <button
              onClick={() => router.push("/settings/blocked")}
              className={`w-full flex items-center justify-between p-5 transition text-left ${
                isDarkMode
                  ? "hover:bg-white/5"
                  : "hover:bg-gray-50"
              }`}
            >
              <div>
                <p className="font-semibold">
                  Blocked Users
                </p>

                <p
                  className={`text-sm mt-1 ${
                    isDarkMode ? "text-gray-500" : "text-gray-600"
                  }`}
                >
                  Manage users you have blocked
                </p>
              </div>

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
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </section>

        {/* Terms & Policies */}
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
            Terms & Policies
          </h2>

          <div
            className={`border rounded-2xl overflow-hidden ${
              isDarkMode
                ? "bg-[#13141a] border-white/10"
                : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            <button
              disabled
              className="w-full flex items-center justify-between p-5 text-left opacity-70 cursor-default"
            >
              <div>
                <p className="font-semibold">
                  Terms of Service
                </p>

                <p
                  className={`text-sm mt-1 ${
                    isDarkMode ? "text-gray-500" : "text-gray-600"
                  }`}
                >
                  Rules for using KMegle
                </p>
              </div>

              <span className="text-gray-500 text-sm">
                Soon
              </span>
            </button>

            <div
              className={
                isDarkMode
                  ? "border-t border-white/5"
                  : "border-t border-gray-100"
              }
            />

            <button
              disabled
              className="w-full flex items-center justify-between p-5 text-left opacity-70 cursor-default"
            >
              <div>
                <p className="font-semibold">
                  Community Guidelines
                </p>

                <p
                  className={`text-sm mt-1 ${
                    isDarkMode ? "text-gray-500" : "text-gray-600"
                  }`}
                >
                  Safety and behavior guidelines
                </p>
              </div>

              <span className="text-gray-500 text-sm">
                Soon
              </span>
            </button>
          </div>
        </section>

        {/* Logout */}
        <section>
          <button
            onClick={handleLogout}
            className={`w-full rounded-2xl p-4 font-semibold transition ${
              isDarkMode
                ? "bg-red-500/10 border border-red-500/20 hover:bg-red-500/15 text-red-400"
                : "bg-red-50 border border-red-200 hover:bg-red-100 text-red-600"
            }`}
          >
            Log out
          </button>
        </section>

        <p
          className={`text-center text-xs mt-8 ${
            isDarkMode ? "text-gray-600" : "text-gray-400"
          }`}
        >
          KMegle
        </p>
      </div>
    </main>
  );
}