"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "../../lib/firebase";

export default function AdminDashboard() {
  const [users, setUsers] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Only allow your specific email to view this page!
    const checkAdmin = auth.onAuthStateChanged((user) => {
      // Replace this with your actual personal Gmail for testing!
      if (user && user.email === "aadinadhan17@gmail.com") {
        setIsAdmin(true);
        fetchUsers();
      } else {
        router.push("/"); // Kick intruders out
      }
    });
    return () => checkAdmin();
  }, [router]);

  const fetchUsers = async () => {
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
    const res = await fetch(`${backendUrl}/api/admin/users`);
    const data = await res.json();
    setUsers(data);
  };

  const toggleBan = async (userId: string, currentStatus: boolean) => {
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
    await fetch(`${backendUrl}/api/admin/ban`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, banStatus: !currentStatus }),
    });
    fetchUsers();
  };

  if (!isAdmin)
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col justify-center items-center font-sans">
        <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin shadow-[0_0_30px_rgba(99,102,241,0.5)]"></div>
        <p className="text-indigo-200 mt-6 font-medium tracking-widest uppercase text-sm animate-pulse">
          Verifying Clearance
        </p>
      </div>
    );

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6 md:p-12 font-sans overflow-y-auto selection:bg-indigo-500/30">
      {/* Background Ambience (Subtle glowing orbs) */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-900/20 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-red-900/10 blur-[120px] rounded-full"></div>
      </div>

      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-white drop-shadow-sm mb-1">
              K-MEGLE <span className="text-indigo-500">ADMIN</span>
            </h1>
            <p className="text-gray-400 text-sm tracking-wide">
              Command Center & Trust/Safety
            </p>
          </div>
          <button
            onClick={() => router.push("/chat")}
            className="bg-white/5 hover:bg-white/10 border border-white/10 px-5 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 shadow-lg"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Application
          </button>
        </div>

        {/* Live Metrics Row (Calculated dynamically from the users array!) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-[#13141a]/80 backdrop-blur-md border border-white/5 p-6 rounded-3xl shadow-lg relative overflow-hidden group">
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">Total Users</p>
            <p className="text-4xl font-black text-white">{users.length}</p>
            <svg className="absolute top-6 right-6 w-12 h-12 text-white/5 group-hover:scale-110 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          </div>
          <div className="bg-[#13141a]/80 backdrop-blur-md border border-white/5 p-6 rounded-3xl shadow-lg relative overflow-hidden group">
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">Active Accounts</p>
            <p className="text-4xl font-black text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.2)]">
              {users.filter(u => !u.is_banned).length}
            </p>
            <svg className="absolute top-6 right-6 w-12 h-12 text-white/5 group-hover:scale-110 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div className="bg-[#13141a]/80 backdrop-blur-md border border-white/5 p-6 rounded-3xl shadow-lg relative overflow-hidden group">
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">Suspended</p>
            <p className="text-4xl font-black text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.2)]">
              {users.filter(u => u.is_banned).length}
            </p>
            <svg className="absolute top-6 right-6 w-12 h-12 text-white/5 group-hover:scale-110 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
        </div>

        {/* The Data Table */}
        <div className="bg-[#13141a]/80 backdrop-blur-xl border border-white/5 rounded-3xl shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-black/40 border-b border-white/5 text-xs uppercase tracking-widest text-gray-500 font-bold">
                  <th className="p-6">User ID (Firebase)</th>
                  <th className="p-6">Joined Date</th>
                  <th className="p-6">Status</th>
                  <th className="p-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-gray-500 text-sm font-mono">
                      Database is currently empty.
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
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </td>
                      <td className="p-6">
                        {user.is_banned ? (
                          <span className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider font-bold shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.8)]"></span>
                            Suspended
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider font-bold shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(74,222,128,0.8)]"></span>
                            Active
                          </span>
                        )}
                      </td>
                      <td className="p-6 text-right">
                        <button
                          onClick={() => toggleBan(user.id, user.is_banned)}
                          className={`px-5 py-2.5 rounded-full font-bold text-xs transition-all shadow-md active:scale-95 ${
                            user.is_banned
                              ? "bg-white/10 hover:bg-white/20 text-white border border-white/10"
                              : "bg-red-600/90 hover:bg-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.3)]"
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
