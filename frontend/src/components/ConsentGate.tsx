"use client";
import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../context/authContext";
import "../app/chat/components/chat/call.css";
const VERSION = "2026-11-08";
export default function ConsentGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <Agreement key={user?.uid || "signed-out"}>{children}</Agreement>;
}
function Agreement({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [acceptedFor, setAcceptedFor] = useState<string | null>(null),
    [checked, setChecked] = useState(false),
    [adult, setAdult] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!user) return;
    let live = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    void (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/backend/acceptance", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (live) {
          setLoaded(true);
          setError("");
          if (data.accepted && data.version === VERSION)
            setAcceptedFor(user.uid);
        }
      } catch {
        if (live) setError("Unable to check your agreement. Please retry.");
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      live = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [user, attempt]);
  const accept = async () => {
    if (!user || !adult || !checked || pending) return;
    setPending(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/backend/acceptance", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ version: VERSION, adult, accepted: checked }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error();
      setAcceptedFor(user.uid);
    } catch {
      setError("Unable to save your agreement. Please retry.");
    } finally {
      setPending(false);
    }
  };
  if (!loading && user && acceptedFor === user.uid) return children;
  return (
    <main className="call-app consent-page">
      <section className="account-card">
        <Link href="/" className="campus-brand">
          kmegle.
        </Link>
        <h1>Before your first hello.</h1>
        <p>
          For adults studying at IIIT Kottayam. Sign in with your verified
          college account.
        </p>
        <p>
          Your camera check stays on your device until matching. Other students
          may record their screen; automated checks can miss content. Leave or
          report any time.
        </p>
        <p>
          <Link href="/policies">
            Read community rules, privacy and support ↗
          </Link>
        </p>
        {user && loaded && (
          <>
            <label className="consent-check">
              <input
                type="checkbox"
                checked={adult}
                onChange={(e) => setAdult(e.target.checked)}
              />
              I am at least 18 years old.
            </label>
            <label className="consent-check">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              I have read and agree to the community rules and privacy notice
              (version {VERSION}).
            </label>
            <button
              className="primary-button"
              disabled={!adult || !checked || pending}
              onClick={() => void accept()}
            >
              {pending ? "Saving…" : "Continue to camera check →"}
            </button>
          </>
        )}
        {error && (
          <>
            <p role="alert">{error}</p>
            <button
              className="control-button"
              onClick={() => setAttempt((n) => n + 1)}
            >
              Retry checking
            </button>
          </>
        )}
        {!error && !loaded && (
          <p role="status">
            {user
              ? "Checking your agreement…"
              : loading
                ? "Checking sign-in…"
                : "Sign in from the home page to continue."}
          </p>
        )}
      </section>
    </main>
  );
}
