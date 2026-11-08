"use client";
import { ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../context/authContext";
import "../app/chat/components/chat/call.css";
const VERSION = "2026-11-08";
type Issue = { message: string; retryable: boolean };
class AccessFailure extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}
async function responseBody(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const accountError = response.status === 401 || response.status === 403;
    throw new AccessFailure(
      accountError
        ? typeof data?.error === "string"
          ? data.error.slice(0, 240)
          : "This account cannot access chat. Choose another account or sign out."
        : "The account service is unavailable. Please retry shortly.",
      !accountError,
    );
  }
  if (
    !data ||
    typeof data.accepted !== "boolean" ||
    typeof data.version !== "string"
  )
    throw new AccessFailure(
      "The account service returned an invalid response. Please retry.",
      true,
    );
  return data as { accepted: boolean; version: string };
}
async function tokenFor(
  user: { getIdToken: () => Promise<string> },
  signal: AbortSignal,
) {
  let cancel = () => {};
  const aborted = new Promise<never>((_, reject) => {
    cancel = () => reject(new DOMException("Request cancelled", "AbortError"));
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
  });
  try {
    return await Promise.race([user.getIdToken(), aborted]);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
function issueFor(error: unknown, fallback: string): Issue {
  return error instanceof AccessFailure
    ? { message: error.message, retryable: error.retryable }
    : { message: fallback, retryable: true };
}
export default function ConsentGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <Agreement key={user?.uid || "signed-out"}>{children}</Agreement>;
}
function Agreement({ children }: { children: ReactNode }) {
  const { user, loading, login, logout } = useAuth();
  const [acceptedFor, setAcceptedFor] = useState<string | null>(null);
  const [checked, setChecked] = useState(false),
    [adult, setAdult] = useState(false);
  const [pending, setPending] = useState(false),
    [error, setError] = useState<Issue | null>(null);
  const [attempt, setAttempt] = useState(0),
    [loaded, setLoaded] = useState(false);
  const [accountAction, setAccountAction] = useState<"login" | "logout" | null>(
    null,
  );
  const [accountError, setAccountError] = useState("");
  const accountBusy = useRef(false);
  useEffect(() => {
    if (!user) return;
    let live = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    void (async () => {
      try {
        const token = await tokenFor(user, controller.signal);
        const response = await fetch("/api/backend/acceptance", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
          cache: "no-store",
        });
        const data = await responseBody(response);
        if (live) {
          setLoaded(true);
          setError(null);
          if (data.accepted && data.version === VERSION)
            setAcceptedFor(user.uid);
        }
      } catch (error) {
        if (live)
          setError(
            issueFor(
              error,
              "Unable to check your agreement. Check your connection and retry.",
            ),
          );
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
  const retry = () => {
    setError(null);
    setLoaded(false);
    setAttempt((n) => n + 1);
  };
  const account = async (action: "login" | "logout") => {
    if (accountBusy.current || pending) return;
    accountBusy.current = true;
    setAccountAction(action);
    setAccountError("");
    try {
      // Call the popup directly from this click, including for an existing Firebase user.
      if (action === "login") {
        await login();
        retry();
      } else await logout();
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error ? error.code : "";
      setAccountError(
        action === "logout"
          ? "Sign out failed. Please try again."
          : code === "auth/popup-closed-by-user"
            ? "Account selection was cancelled. You can choose an account again."
            : code === "auth/popup-blocked"
              ? "Allow popups for this site, then choose an account again."
              : "Account selection failed. Please try again.",
      );
    } finally {
      accountBusy.current = false;
      setAccountAction(null);
    }
  };
  const accept = async () => {
    if (!user || !adult || !checked || pending || accountBusy.current) return;
    setPending(true);
    setError(null);
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 8000);
    try {
      const token = await tokenFor(user, controller.signal);
      const response = await fetch("/api/backend/acceptance", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ version: VERSION, adult, accepted: checked }),
        signal: controller.signal,
      });
      const data = await responseBody(response);
      if (!data.accepted || data.version !== VERSION)
        throw new AccessFailure(
          "Your agreement was not acknowledged. Please retry.",
          true,
        );
      setAcceptedFor(user.uid);
    } catch (error) {
      setError(issueFor(error, "Unable to save your agreement. Please retry."));
    } finally {
      clearTimeout(timer);
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
          Adult-only video chat for the campus community. Sign in with the
          verified Google account you want to use.
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
        {user && (
          <p>
            Signed in as <strong>{user.email || "your Google account"}</strong>
          </p>
        )}
        {!loading && (
          <div className="account-toolbar">
            <button
              className="control-button"
              disabled={!!accountAction || pending}
              onClick={() => void account("login")}
            >
              {accountAction === "login"
                ? "Opening Google…"
                : user
                  ? "Choose another account"
                  : "Sign in with Google"}
            </button>
            {user && (
              <button
                className="quiet-button"
                disabled={!!accountAction || pending}
                onClick={() => void account("logout")}
              >
                {accountAction === "logout" ? "Signing out…" : "Sign out"}
              </button>
            )}
          </div>
        )}
        {accountError && <p role="alert">{accountError}</p>}
        {error && (
          <>
            <p role="alert">{error.message}</p>
            {error.retryable && (
              <button
                className="control-button"
                disabled={!!accountAction || pending}
                onClick={retry}
              >
                Retry checking
              </button>
            )}
          </>
        )}
        {user && loaded && !error && (
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
              disabled={!adult || !checked || pending || !!accountAction}
              onClick={() => void accept()}
            >
              {pending ? "Saving…" : "Continue to camera check →"}
            </button>
          </>
        )}
        {!error && !loaded && (
          <p role="status">
            {user
              ? "Checking your account and agreement…"
              : loading
                ? "Checking sign-in…"
                : "Choose a Google account to continue."}
          </p>
        )}
      </section>
    </main>
  );
}
