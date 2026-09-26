"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/authContext";
import { useTheme } from "../../context/themeContext";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const { isDarkMode } = useTheme();
  const [openPolicy, setOpenPolicy] = useState<"terms" | "guidelines" | "privacy" | null>(null);

  const togglePolicy = (policy: "terms" | "guidelines" | "privacy") => {
    setOpenPolicy((prev) => (prev === policy ? null : policy));
  };

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
            {/* Terms of Service */}
            <div>
              <button
                onClick={() => togglePolicy("terms")}
                className={`w-full flex items-center justify-between p-5 text-left transition ${
                  isDarkMode ? "hover:bg-white/5" : "hover:bg-gray-50"
                }`}
              >
                <div>
                  <p className="font-semibold">Terms of Service</p>
                  <p
                    className={`text-sm mt-1 ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    Rules, age requirements, and user agreements for using KMegle
                  </p>
                </div>
                <svg
                  className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
                    openPolicy === "terms" ? "rotate-90" : ""
                  }`}
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

              {openPolicy === "terms" && (
                <div
                  className={`px-5 pb-5 pt-2 text-sm border-t leading-relaxed ${
                    isDarkMode
                      ? "border-white/5 text-gray-300 bg-white/[0.02]"
                      : "border-gray-100 text-gray-700 bg-gray-50/50"
                  }`}
                >
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-base mb-1">1. Age Requirement</h4>
                      <p>
                        You must be at least 18 years old (or the legal age of majority in your jurisdiction) to use KMegle video chat. Minors under 18 are strictly prohibited from using the platform.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-base mb-1">2. Peer-to-Peer (P2P) WebRTC Architecture</h4>
                      <p>
                        KMegle connects users directly via WebRTC Peer-to-Peer protocols for real-time video and audio communication. By using KMegle, you understand and acknowledge that P2P technology inherently exchanges network connection details (including public IP addresses) directly between video chat peers.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-base mb-1">3. User Conduct & Moderation</h4>
                      <p>
                        You agree to follow all local, state, and international laws. KMegle reserves the right to terminate access, suspend accounts, or permanently block Firebase UIDs and IP addresses without prior notice for any violation of these terms.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-base mb-1">4. Recording Disclaimer</h4>
                      <p>
                        While KMegle does not record or store any video or audio streams, we cannot prevent third-party peers from using external screen recording software. Never share personally identifiable information (PII), financial details, or passwords during video chats.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div
              className={
                isDarkMode
                  ? "border-t border-white/5"
                  : "border-t border-gray-100"
              }
            />

            {/* Community Guidelines */}
            <div>
              <button
                onClick={() => togglePolicy("guidelines")}
                className={`w-full flex items-center justify-between p-5 text-left transition ${
                  isDarkMode ? "hover:bg-white/5" : "hover:bg-gray-50"
                }`}
              >
                <div>
                  <p className="font-semibold">Community Guidelines</p>
                  <p
                    className={`text-sm mt-1 ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    Safety, behavior, and zero-tolerance policies
                  </p>
                </div>
                <svg
                  className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
                    openPolicy === "guidelines" ? "rotate-90" : ""
                  }`}
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

              {openPolicy === "guidelines" && (
                <div
                  className={`px-5 pb-5 pt-2 text-sm border-t leading-relaxed ${
                    isDarkMode
                      ? "border-white/5 text-gray-300 bg-white/[0.02]"
                      : "border-gray-100 text-gray-700 bg-gray-50/50"
                  }`}
                >
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-base mb-1"> Zero-Tolerance Nudity & Sexual Content</h4>
                      <p>
                        Sexually explicit behavior, nudity, pornography, or suggestive content is strictly prohibited. Accounts engaging in such acts will face immediate permanent IP and UID bans.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-base mb-1"> Harassment, Hate Speech & Bullying</h4>
                      <p>
                        We do not tolerate racial slurs, hate speech, harassment, intimidation, discrimination, or abusive behavior of any kind. Respect all users regardless of background.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-base mb-1"> Illegal Acts & Threats</h4>
                      <p>
                        Promoting illegal activities, weapons, violence, self-harm, or making threats against others will result in immediate bans and potential referral to law enforcement agencies.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-base mb-1"> Reporting & Blocking</h4>
                      <p>
                        If you encounter anyone violating these rules, use the Block feature immediately. Blocking severs the connection and prevents future matchmaking with that user.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div
              className={
                isDarkMode
                  ? "border-t border-white/5"
                  : "border-t border-gray-100"
              }
            />

            {/* Privacy Policy */}
            <div>
              <button
                onClick={() => togglePolicy("privacy")}
                className={`w-full flex items-center justify-between p-5 text-left transition ${
                  isDarkMode ? "hover:bg-white/5" : "hover:bg-gray-50"
                }`}
              >
                <div>
                  <p className="font-semibold">Privacy Policy</p>
                  <p
                    className={`text-sm mt-1 ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    How we handle video streams, data, and user logs
                  </p>
                </div>
                <svg
                  className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
                    openPolicy === "privacy" ? "rotate-90" : ""
                  }`}
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

              {openPolicy === "privacy" && (
                <div
                  className={`px-5 pb-5 pt-2 text-sm border-t leading-relaxed ${
                    isDarkMode
                      ? "border-white/5 text-gray-300 bg-white/[0.02]"
                      : "border-gray-100 text-gray-700 bg-gray-50/50"
                  }`}
                >
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-base mb-1"> Zero Video/Audio Data Retention</h4>
                      <p>
                        Video and audio streams are transmitted directly peer-to-peer using WebRTC. They are never recorded, captured, processed, or stored on KMegle servers.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-base mb-1"> Account & Security Data</h4>
                      <p>
                        We collect minimal identifiers (Firebase Auth UID, email if authenticated, and hashed IP addresses) solely for managing account state, authentication, and enforcing user safety bans.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-base mb-1"> Third-Party Services</h4>
                      <p>
                        KMegle uses Firebase Authentication for account management and TURN servers for NAT traversal where direct P2P connections cannot be established. No user data is sold or shared with advertisers.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
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