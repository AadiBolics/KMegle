"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/authContext";

interface User {
  id: string;
  created_at: string;
  is_banned: boolean;
}

export default function AdminDashboard() {
  const { user, loading: authLoading, login, logout } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchUsers = useCallback(async () => {
    if (!user) {
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/backend/admin/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 401 || res.status === 403) {
        setIsAuthenticated(false);
        setError("Access Denied: Your account is not in the authorized administrator list.");
        setIsLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error(`Server responded with status: ${res.status}`);
      }

      const data = await res.json();
      setUsers(data);
      setIsAuthenticated(true);
      setError(null);
    } catch (err) {
      console.error("Fetch users error:", err);
      setError("Failed to connect to backend server. It may be asleep or unreachable.");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      if (user) {
        fetchUsers();
      } else {
        setIsLoading(false);
        setIsAuthenticated(false);
      }
    }
  }, [authLoading, user, fetchUsers]);

  const toggleBan = async (userId: string, currentStatus: boolean) => {
    if (!user) return;

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/backend/admin/ban", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, banStatus: !currentStatus }),
      });

      if (res.status === 401 || res.status === 403) {
        alert("Session expired or unauthorized. Please re-authenticate.");
        setIsAuthenticated(false);
        return;
      }

      if (res.ok) {
        fetchUsers();
      } else {
        alert("Failed to update user status. Please try again.");
      }
    } catch (err) {
      console.error("Ban toggle error:", err);
      alert("Network error while trying to update user status.");
    }
  };

  const handleAdminLogin = async () => {
    setError(null);
    try {
      await login();
    } catch (err: any) {
      console.error("Login failed:", err);
      setError("Google authentication was cancelled or failed.");
    }
  };

  const handleLogout = async () => {
    await logout();
    setIsAuthenticated(false);
    setError(null);
  };

  if (authLoading || (isLoading && !isAuthenticated && !error)) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex justify-center items-center">
        <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col justify-center items-center p-4 font-sans relative overflow-hidden">
        <div className="bg-[#13141a]/90 backdrop-blur-2xl border border-white/10 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl z-10">
          <h1 className="text-3xl font-black text-white tracking-tighter mb-2">
            KMegle <span className="text-indigo-500">ADMIN</span>
          </h1>
          <p className="text-gray-400 text-xs tracking-widest uppercase mb-6 font-semibold">
            Restricted System Access
          </p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl mb-4 text-xs font-medium">
              {error}
            </div>
          )}

          {!user ? (
            <button
              onClick={handleAdminLogin}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl text-sm transition-all shadow-lg active:scale-95 flex justify-center items-center gap-2"
            >
              Sign In with Google Admin Account
            </button>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Signed in as <span className="text-white font-mono">{user.email}</span>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={fetchUsers}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-xl text-xs transition-all"
                >
                  Retry Verification
                </button>
                <button
                  onClick={handleLogout}
                  className="bg-white/10 hover:bg-white/20 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-all"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6 md:p-12 font-sans overflow-y-auto selection:bg-indigo-500/30">
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-900/20 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-red-900/10 blur-[120px] rounded-full"></div>
      </div>

      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-white drop-shadow-sm mb-1">
              KMegle <span className="text-indigo-500">ADMIN</span>
            </h1>
            <p className="text-gray-400 text-sm tracking-wide">
              Logged in as <span className="text-indigo-400 font-mono">{user.email}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleLogout}
              className="bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2.5 rounded-full text-xs font-bold transition-all text-gray-400 hover:text-white"
            >
              Sign Out
            </button>
            <button
              onClick={() => router.push("/chat")}
              className="bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 shadow-lg"
            >
              Back to App
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-[#13141a]/80 backdrop-blur-md border border-white/5 p-6 rounded-3xl shadow-lg relative overflow-hidden group">
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">Total Tracked Users</p>
            <p className="text-4xl font-black text-white">{users.length}</p>
          </div>
          <div className="bg-[#13141a]/80 backdrop-blur-md border border-white/5 p-6 rounded-3xl shadow-lg relative overflow-hidden group">
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">Active Users</p>
            <p className="text-4xl font-black text-green-400">
              {users.filter((u) => !u.is_banned).length}
            </p>
          </div>
          <div className="bg-[#13141a]/80 backdrop-blur-md border border-white/5 p-6 rounded-3xl shadow-lg relative overflow-hidden group">
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">Suspended Users</p>
            <p className="text-4xl font-black text-red-500">
              {users.filter((u) => u.is_banned).length}
            </p>
          </div>
        </div>

        <div className="bg-[#13141a]/80 backdrop-blur-xl border border-white/5 rounded-3xl shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-black/40 border-b border-white/5 text-xs uppercase tracking-widest text-gray-500 font-bold">
                  <th className="p-6">User ID</th>
                  <th className="p-6">Joined Date</th>
                  <th className="p-6">Status</th>
                  <th className="p-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-gray-500 text-sm font-mono">
                      Refreshing users...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-gray-500 text-sm font-mono">
                      No tracked users yet.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="group hover:bg-white/[0.03] transition-colors duration-300">
                      <td className="p-6 font-mono text-sm text-gray-400 group-hover:text-gray-200 transition-colors">
                        {u.id}
                      </td>
                      <td className="p-6 text-sm text-gray-400">
                        {new Date(u.created_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="p-6">
                        {u.is_banned ? (
                          <span className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider font-bold">
                            Suspended
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider font-bold">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="p-6 text-right">
                        <button
                          onClick={() => toggleBan(u.id, u.is_banned)}
                          className={`px-5 py-2.5 rounded-full font-bold text-xs transition-all ${
                            u.is_banned
                              ? "bg-white/10 hover:bg-white/20 text-white border border-white/10"
                              : "bg-red-600/90 hover:bg-red-500 text-white"
                          }`}
                        >
                          {u.is_banned ? "RESTORE ACCESS" : "SUSPEND USER"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}