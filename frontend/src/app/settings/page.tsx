"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/authContext";
import { useTheme } from "../../context/themeContext";
import "../chat/components/chat/call.css";
export default function SettingsPage() {
  const { user, loading, logout } = useAuth();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const router = useRouter();
  const [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);
  const signout = async () => {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await logout();
      router.replace("/");
    } catch {
      setError("Sign out failed. Please try again.");
    } finally {
      setPending(false);
    }
  };
  return (
    <main className="call-app consent-page">
      <section className="account-card">
        <Link href="/chat">← Back to camera check</Link>
        <h1>Your corner of campus.</h1>
        {loading ? (
          <p>Loading your account…</p>
        ) : (
          user && (
            <>
              <h2>Account</h2>
              <p>{user.email}</p>
              <p>
                Leaving chat turns off your devices. Camera and microphone
                controls are available inside chat.
              </p>
              <div className="account-toolbar">
                <button className="control-button" onClick={toggleDarkMode}>
                  Use {isDarkMode ? "light" : "dark"} theme
                </button>
                <button
                  className="control-button"
                  disabled={pending}
                  onClick={() => void signout()}
                >
                  {pending ? "Signing out…" : "Sign out"}
                </button>
              </div>
              <h2>Privacy & safety</h2>
              <p>
                <Link href="/settings/blocked">Manage blocked students →</Link>
              </p>
              <p>
                <Link href="/policies">
                  Community rules, privacy and support →
                </Link>
              </p>
              <p role="status" className="account-notice">
                {error}
              </p>
            </>
          )
        )}
      </section>
    </main>
  );
}
