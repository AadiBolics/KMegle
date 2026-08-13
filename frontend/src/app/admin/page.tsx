"use client";

import { useEffect, useState, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  created_at: string;
  is_banned: boolean;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [adminKey, setAdminKey] = useState<string>("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState("");
  const router = useRouter();

  const fetchUsers = useCallback(async (key: string) => {
    setIsLoading(true);
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
    
    try {
      const res = await fetch(`${backendUrl}/api/admin/users`, {
        headers: { "x-admin-key": key },
      });
      
      if (res.status === 401) {
        setIsAuthenticated(false);
        setError("Invalid Admin Key. Access Denied.");
        setAdminKey(""); 
        localStorage.removeItem("kmegle_admin_key");
        setIsLoading(false);
        return;
      }
      
      // Prevent JSON parsing crashes on 500/502 HTML error pages from Render
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
  }, []);

  useEffect(() => {
    const savedKey = localStorage.getItem("kmegle_admin_key");
    if (savedKey) {
      setAdminKey(savedKey);
      fetchUsers(savedKey);
    } else {
      setIsLoading(false);
    }
  }, [fetchUsers]);

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    if (!inputKey.trim()) return;
    
    const key = inputKey.trim();
    localStorage.setItem("kmegle_admin_key", key);
    setAdminKey(key);
    fetchUsers(key);
  };

  const toggleBan = async (userId: string, currentStatus: boolean) => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
    
    try {
      const res = await fetch(`${backendUrl}/api/admin/ban`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({ userId, banStatus: !currentStatus }),
      });
      
      // If the key expired or was rotated, kick them out to the login screen
      if (res.status === 401) {
        alert("Session expired. Please log in again.");
        setIsAuthenticated(false);
        setAdminKey("");
        localStorage.removeItem("kmegle_admin_key");
        return;
      }

      if (res.ok) {
        // Refresh the user list to show updated status
        fetchUsers(adminKey);
      } else {
        alert("Failed to update user status. Please try again.");
      }
    } catch (err) {
      console.error("Ban toggle error:", err);
      alert("Network error while trying to update user status.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("kmegle_admin_key");
    setAdminKey("");
    setIsAuthenticated(false);
    setInputKey("");
  };

  if (isLoading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex justify-center items-center">
        <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
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

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              placeholder="Enter Admin Secret Key..."
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              className="w-full bg-[#1e2028] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500 transition-all"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-bold py-3 rounded-xl text-sm transition-all shadow-lg active:scale-95 flex justify-center items-center gap-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                "Authenticate Access"
              )}
            </button>
          </form>
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
              Command Center & Trust/Safety
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleLogout}
              className="bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2.5 rounded-full text-xs font-bold transition-all text-gray-400 hover:text-white"
            >
              Lock Dashboard
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
                  users.map((user) => (
                    <tr key={user.id} className="group hover:bg-white/[0.03] transition-colors duration-300">
                      <td className="p-6 font-mono text-sm text-gray-400 group-hover:text-gray-200 transition-colors">
                        {user.id}
                      </td>
                      <td className="p-6 text-sm text-gray-400">
                        {new Date(user.created_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="p-6">
                        {user.is_banned ? (
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
                          onClick={() => toggleBan(user.id, user.is_banned)}
                          className={`px-5 py-2.5 rounded-full font-bold text-xs transition-all ${
                            user.is_banned
                              ? "bg-white/10 hover:bg-white/20 text-white border border-white/10"
                              : "bg-red-600/90 hover:bg-red-500 text-white"
                          }`}
                        >
                          {user.is_banned ? "RESTORE ACCESS" : "SUSPEND USER"}
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