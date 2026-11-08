"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../context/authContext";
import Dialog from "../chat/components/chat/Dialog";
import "../chat/components/chat/call.css";
type Account = { id: string; created_at: string; is_banned: boolean };
type Report = {
  id: string;
  reported_id: string;
  reporter_id: string;
  reason: string;
  status: string;
  created_at: string;
};
export default function AdminDashboard() {
  const { user } = useAuth();
  return <AdminContent key={user?.uid || "signed-out"} />;
}
function AdminContent() {
  const { user, loading: authLoading, login } = useAuth();
  const [tab, setTab] = useState<"users" | "reports">("reports"),
    [accounts, setAccounts] = useState<Account[]>([]),
    [reports, setReports] = useState<Report[]>([]),
    [status, setStatus] = useState("pending"),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [pending, setPending] = useState<string | null>(null),
    [confirm, setConfirm] = useState<Account | null>(null);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 8000);
    void (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch(
          `/api/backend/admin/${tab}?offset=${page * 25}&status=${status}&search=${encodeURIComponent(query)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
            cache: "no-store",
          },
        );
        if (!response.ok)
          throw new Error(
            response.status === 401 || response.status === 403
              ? "Administrator access required."
              : "Unable to load this page.",
          );
        const data = await response.json();
        if (alive) {
          if (tab === "users") setAccounts(data);
          else setReports(data);
          setError("");
        }
      } catch (error) {
        if (alive)
          setError(error instanceof Error ? error.message : "Request failed.");
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
  }, [user, tab, page, status, query, refresh]);
  const update = async (path: string, body: object, id: string) => {
    if (!user || pending) return;
    setPending(id);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/backend/admin/${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error();
      setLoading(true);
      setRefresh((n) => n + 1);
    } catch {
      setError(
        "Update was not acknowledged. Refresh to check its outcome before retrying.",
      );
    } finally {
      setPending(null);
      setConfirm(null);
    }
  };
  const changeTab = (value: "users" | "reports") => {
    setTab(value);
    setPage(0);
    setLoading(true);
  };
  return (
    <main className="call-app consent-page">
      <section className="account-card admin-card">
        <Link href="/settings">← Account settings</Link>
        <h1>Campus moderation</h1>
        <p>
          Reports are allegations. Review context before taking account action.
          Changes are recorded in the admin action log.
        </p>
        {authLoading ? (
          <p>Checking sign-in…</p>
        ) : !user ? (
          <button
            className="primary-button"
            onClick={() =>
              void login().catch(() => setError("Sign-in did not complete."))
            }
          >
            Sign in as administrator
          </button>
        ) : (
          <>
            <div className="admin-tabs">
              <button
                className="control-button"
                aria-pressed={tab === "reports"}
                disabled={tab === "reports"}
                onClick={() => changeTab("reports")}
              >
                Reports
              </button>
              <button
                className="control-button"
                aria-pressed={tab === "users"}
                disabled={tab === "users"}
                onClick={() => changeTab("users")}
              >
                Accounts
              </button>
            </div>
            {tab === "reports" ? (
              <label className="device-field">
                Report status
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(0);
                    setLoading(true);
                  }}
                >
                  <option value="pending">Pending review</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="dismissed">Dismissed</option>
                </select>
              </label>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setQuery(search);
                  setRefresh((n) => n + 1);
                  setPage(0);
                  setLoading(true);
                }}
              >
                <label htmlFor="account-search">Search account ID</label>
                <input
                  id="account-search"
                  type="search"
                  value={search}
                  maxLength={100}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button className="control-button" type="submit">
                  Search
                </button>
              </form>
            )}
            {error && (
              <p className="account-notice" role="alert">
                {error}
              </p>
            )}
            <button
              className="quiet-button"
              disabled={!!pending}
              onClick={() => {
                setLoading(true);
                setRefresh((n) => n + 1);
              }}
            >
              Refresh
            </button>
            {loading ? (
              <p role="status">Loading…</p>
            ) : error ? null : (
              <div className="admin-scroll">
                {tab === "users" ? (
                  <table className="admin-table">
                    <caption>Accounts with access or suspended access</caption>
                    <thead>
                      <tr>
                        <th>Account ID</th>
                        <th>Joined</th>
                        <th>Access</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map((a) => (
                        <tr key={a.id}>
                          <td>{a.id}</td>
                          <td>{new Date(a.created_at).toLocaleDateString()}</td>
                          <td>{a.is_banned ? "Suspended" : "Allowed"}</td>
                          <td>
                            <button
                              className="control-button"
                              disabled={!!pending}
                              onClick={() => setConfirm(a)}
                            >
                              {pending === a.id
                                ? "Saving…"
                                : a.is_banned
                                  ? "Restore"
                                  : "Suspend"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="admin-table">
                    <caption>Reports · {status}</caption>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Reported account / reporter</th>
                        <th>Concern</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((r) => (
                        <tr key={r.id}>
                          <td>{new Date(r.created_at).toLocaleString()}</td>
                          <td>
                            {r.reported_id}
                            <br />
                            From {r.reporter_id}
                          </td>
                          <td>{r.reason}</td>
                          <td>
                            {["pending", "reviewed", "dismissed"]
                              .filter((s) => s !== r.status)
                              .map((s) => (
                                <button
                                  key={s}
                                  className="quiet-button"
                                  disabled={!!pending}
                                  onClick={() =>
                                    void update(
                                      `reports/${r.id}`,
                                      { status: s },
                                      r.id,
                                    )
                                  }
                                >
                                  {s === "pending"
                                    ? "Reopen"
                                    : s === "reviewed"
                                      ? "Mark reviewed"
                                      : "Dismiss"}
                                </button>
                              ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            <div className="account-toolbar">
              <button
                className="quiet-button"
                disabled={page === 0 || loading}
                onClick={() => {
                  setPage((n) => n - 1);
                  setLoading(true);
                }}
              >
                Previous
              </button>
              <button
                className="quiet-button"
                disabled={
                  loading || (tab === "users" ? accounts : reports).length < 25
                }
                onClick={() => {
                  setPage((n) => n + 1);
                  setLoading(true);
                }}
              >
                Next page
              </button>
            </div>
          </>
        )}
        {error && !user && <p role="alert">{error}</p>}
      </section>
      {confirm && (
        <Dialog
          title={confirm.is_banned ? "Restore access?" : "Suspend access?"}
          onClose={() => setConfirm(null)}
        >
          <p className="dialog-copy">
            Account {confirm.id}. Suspending ends all current calls and prevents
            new matches.
          </p>
          <div className="dialog-actions">
            <button
              className="quiet-button"
              disabled={!!pending}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              disabled={!!pending}
              onClick={() =>
                void update(
                  "ban",
                  { userId: confirm.id, banStatus: !confirm.is_banned },
                  confirm.id,
                )
              }
            >
              {pending ? "Saving…" : "Confirm"}
            </button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
