"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../context/authContext";
import Dialog from "../../chat/components/chat/Dialog";
import "../../chat/components/chat/call.css";
type Block = { blockRef: string; createdAt: string };
export default function BlockedUsersPage() {
  const { user } = useAuth();
  return <BlockedUsersContent key={user?.uid || "signed-out"} />;
}
function BlockedUsersContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<Block[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [pending, setPending] = useState<string | null>(null),
    [confirm, setConfirm] = useState<Block | null>(null),
    [page, setPage] = useState(0);
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    let alive = true;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 8000);
    void (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch(
          `/api/backend/blocks?offset=${page * 20}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
            cache: "no-store",
          },
        );
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (alive) {
          setEntries(data);
          setError("");
        }
      } catch {
        if (alive) setError("Unable to load blocked students.");
      } finally {
        clearTimeout(deadline);
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(deadline);
    };
  }, [user, authLoading, router, retry, page]);
  const unblock = async (entry: Block) => {
    if (!user || pending) return;
    setConfirm(null);
    setPending(entry.blockRef);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/backend/blocks/${entry.blockRef}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error();
      setEntries((list) => list.filter((e) => e.blockRef !== entry.blockRef));
    } catch {
      setError(
        "Unblock was not acknowledged. Reload the list to check before retrying.",
      );
    } finally {
      setPending(null);
    }
  };
  return (
    <main className="call-app consent-page">
      <section className="account-card">
        <Link href="/settings">← Account settings</Link>
        <h1>Blocked students</h1>
        <p>
          These private labels distinguish your blocks without revealing
          students’ identities. Unblocking allows future matches unless they
          have also blocked you.
        </p>
        {error && (
          <>
            <p role="alert" className="account-notice">
              {error}
            </p>
            <button
              className="control-button"
              onClick={() => {
                setLoading(true);
                setRetry((n) => n + 1);
              }}
            >
              Retry loading
            </button>
          </>
        )}
        {loading ? (
          <p>Loading…</p>
        ) : !entries.length ? (
          <p>No blocked students on this page.</p>
        ) : (
          entries.map((entry) => (
            <div className="account-row" key={entry.blockRef}>
              <div>
                <strong>Student {entry.blockRef.slice(0, 8)}</strong>
                <p>Blocked {new Date(entry.createdAt).toLocaleString()}</p>
              </div>
              <button
                className="control-button"
                disabled={!!pending}
                onClick={() => setConfirm(entry)}
              >
                {pending === entry.blockRef ? "Unblocking…" : "Unblock"}
              </button>
            </div>
          ))
        )}
        <div className="account-toolbar">
          <button
            className="quiet-button"
            disabled={page === 0 || loading}
            onClick={() => {
              setLoading(true);
              setPage((n) => n - 1);
            }}
          >
            Previous
          </button>
          <button
            className="quiet-button"
            disabled={entries.length < 20 || loading}
            onClick={() => {
              setLoading(true);
              setPage((n) => n + 1);
            }}
          >
            Next page
          </button>
        </div>
      </section>
      {confirm && (
        <Dialog title="Allow future matches?" onClose={() => setConfirm(null)}>
          <p className="dialog-copy">
            Student {confirm.blockRef.slice(0, 8)} will be removed from your
            block list.
          </p>
          <div className="dialog-actions">
            <button className="quiet-button" onClick={() => setConfirm(null)}>
              Keep blocked
            </button>
            <button
              className="primary-button"
              onClick={() => void unblock(confirm)}
            >
              Unblock
            </button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
