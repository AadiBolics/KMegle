"use client";

import { useState } from "react";

interface ProfileCaptureModalProps {
  isOpen: boolean;
  userEmail: string | null;
  onSubmit: (gender: string, college: string) => void;
}

export default function ProfileCaptureModal({
  isOpen,
  userEmail,
  onSubmit,
}: ProfileCaptureModalProps) {
  const [selectedGender, setSelectedGender] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !userEmail) return null;

  // Extract the domain to show off the "Walled Garden" feature
  const collegeDomain = userEmail.split("@")[1] || "Unknown College";

  const handleSubmit = () => {
    if (!selectedGender) return;
    setIsSubmitting(true);
    // Simulate a tiny network delay for a premium feel before calling the parent function
    setTimeout(() => {
      onSubmit(selectedGender, collegeDomain);
      setIsSubmitting(false);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-lg p-4 transition-opacity">
      <div className="bg-[#13141a] border border-white/10 rounded-3xl w-full max-w-md p-8 shadow-[0_0_50px_rgba(99,102,241,0.1)] relative overflow-hidden animate-in fade-in zoom-in duration-300">
        
        {/* Subtle top glow */}
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-full h-24 bg-indigo-600/20 blur-[50px] rounded-full pointer-events-none"></div>

        <div className="text-center mb-8 relative z-10">
          <h2 className="text-2xl font-black text-white mb-2 tracking-tight">Complete Your Profile</h2>
          <p className="text-gray-400 text-sm">
            Welcome to K-Megle. Let's get you set up for the best matchmaking experience.
          </p>
        </div>

        <div className="space-y-6 relative z-10">
          
          {/* Verified Network Display (Read-Only) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Verified Network</label>
            <div className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-sm font-medium text-gray-300">{collegeDomain}</span>
            </div>
          </div>

          {/* Gender Selection */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Your Gender</label>
            <div className="grid grid-cols-2 gap-3">
              
              {/* Male Button */}
              <button
                onClick={() => setSelectedGender("male")}
                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all ${
                  selectedGender === "male"
                    ? "bg-indigo-600/20 border-indigo-500 text-white"
                    : "bg-[#1a1b23] border-white/5 text-gray-400 hover:bg-white/5 hover:text-gray-200"
                }`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                <span className="text-sm font-semibold">Male</span>
              </button>

              {/* Female Button */}
              <button
                onClick={() => setSelectedGender("female")}
                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all ${
                  selectedGender === "female"
                    ? "bg-indigo-600/20 border-indigo-500 text-white"
                    : "bg-[#1a1b23] border-white/5 text-gray-400 hover:bg-white/5 hover:text-gray-200"
                }`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                <span className="text-sm font-semibold">Female</span>
              </button>

            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={!selectedGender || isSubmitting}
            className={`w-full py-4 mt-4 rounded-xl font-bold text-sm transition-all flex justify-center items-center gap-2 ${
              selectedGender && !isSubmitting
                ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)]"
                : "bg-gray-800 text-gray-500 cursor-not-allowed"
            }`}
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              "Enter K-Megle"
            )}
          </button>
          
        </div>
      </div>
    </div>
  );
}