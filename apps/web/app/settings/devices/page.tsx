"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  LogOut,
  Shield,
  RefreshCw,
  Laptop,
} from "lucide-react";

interface SessionEntry {
  id: string;
  deviceType: "mobile" | "desktop" | "tablet" | "web";
  platform: string;
  browser: string;
  os: string;
  ipAddress: string;
  lastActive: string;
  createdAt: string;
  isCurrent: boolean;
}

function formatRelativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function DeviceIcon({ deviceType, platform, className }: { deviceType: string; platform: string; className?: string }) {
  if (platform === "Mobile App") return <Smartphone size={22} className={className} />;
  if (platform === "Desktop App") return <Laptop size={22} className={className} />;
  if (deviceType === "tablet") return <Tablet size={22} className={className} />;
  if (deviceType === "mobile") return <Smartphone size={22} className={className} />;
  if (deviceType === "desktop") return <Monitor size={22} className={className} />;
  return <Globe size={22} className={className} />;
}

function getPlatformLabel(platform: string, browser: string, os: string): string {
  if (platform === "Desktop App") return `LifeOS Desktop · ${os}`;
  if (platform === "Mobile App") return `LifeOS Mobile · ${os}`;
  return `${browser} · ${os}`;
}

export default function DevicesPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const fetchSessions = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/sessions");
      const data = await res.json();
      if (data.sessions) setSessions(data.sessions);
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions(); // initial load
    
    // Auto-poll every 5 seconds for real-time updates
    const interval = setInterval(() => {
      fetchSessions(true);
    }, 5000);
    
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const revokeSession = async (id: string) => {
    setRevoking(id);
    try {
      await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      console.error(e);
    } finally {
      setRevoking(null);
    }
  };

  const revokeAllOthers = async () => {
    if (!confirm("Sign out all other devices? You'll stay signed in on this device.")) return;
    setRevokingAll(true);
    try {
      await fetch("/api/sessions/all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revokeAll: true }),
      });
      await fetchSessions();
    } catch (e) {
      console.error(e);
    } finally {
      setRevokingAll(false);
    }
  };

  const otherSessions = sessions.filter((s) => !s.isCurrent);
  const currentSession = sessions.find((s) => s.isCurrent);

  return (
    <div className="min-h-screen bg-[#161618] text-gray-100 flex flex-col">
      {/* Header */}
      <div className="flex items-center px-6 md:px-12 pt-8 pb-6 border-b border-[#2A2B2F]">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-[#1F2023] border border-[#2A2B2F] hover:bg-[#2A2B2F] transition-colors shadow-sm mr-4"
        >
          <ArrowLeft size={18} className="text-gray-300" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Devices</h1>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1.5">
            Active Sessions
          </p>
        </div>

        <button
          onClick={() => fetchSessions(false)}
          disabled={loading}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-[#1F2023] border border-[#2A2B2F] hover:bg-[#2A2B2F] transition-colors shadow-sm"
        >
          <RefreshCw size={16} className={`text-gray-300 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8">
        <div className="max-w-3xl mx-auto space-y-8 pb-20">

          {loading ? (
            <div className="animate-pulse space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 bg-[#1F2023] rounded-3xl" />
              ))}
            </div>
          ) : (
            <>
              {/* Current Device */}
              {currentSession && (
                <div>
                  <div className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-3 ml-2">
                    This Device
                  </div>
                  <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-5 shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-[#E8414A]/15 flex items-center justify-center shrink-0">
                        <DeviceIcon
                          deviceType={currentSession.deviceType}
                          platform={currentSession.platform}
                          className="text-[#E8414A]"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-base font-bold text-gray-100">
                            {getPlatformLabel(currentSession.platform, currentSession.browser, currentSession.os)}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[#E8414A]/15 border border-[#E8414A]/30 text-[10px] font-bold text-[#E8414A] uppercase tracking-wider">
                            Current
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#E8414A] animate-pulse" />
                          <span className="text-xs font-semibold text-gray-400">
                            Active now · {currentSession.platform}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Other Sessions */}
              {otherSessions.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3 ml-2 mr-1">
                    <div className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">
                      Other Devices ({otherSessions.length})
                    </div>
                    {otherSessions.length > 1 && (
                      <button
                        onClick={revokeAllOthers}
                        disabled={revokingAll}
                        className="text-[10px] font-bold tracking-wider text-[#E8414A] uppercase hover:text-red-400 transition-colors disabled:opacity-50"
                      >
                        {revokingAll ? "Signing Out..." : "Sign Out All"}
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {otherSessions.map((s) => (
                      <div
                        key={s.id}
                        className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-5 shadow-sm"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-[#2A2B2F] flex items-center justify-center shrink-0">
                            <DeviceIcon
                              deviceType={s.deviceType}
                              platform={s.platform}
                              className="text-gray-300"
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="text-base font-bold text-gray-100 truncate mb-1">
                              {getPlatformLabel(s.platform, s.browser, s.os)}
                            </div>
                            <div className="text-xs font-semibold text-gray-400">
                              Last active {formatRelativeTime(s.lastActive)}
                              {s.ipAddress && ` · ${s.ipAddress}`}
                            </div>
                          </div>

                          <button
                            onClick={() => revokeSession(s.id)}
                            disabled={revoking === s.id}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#E8414A]/10 border border-[#E8414A]/20 text-[#E8414A] text-xs font-bold uppercase tracking-wider hover:bg-[#E8414A]/20 transition-colors disabled:opacity-50 shrink-0"
                          >
                            {revoking === s.id ? (
                              <RefreshCw size={12} className="animate-spin" />
                            ) : (
                              <LogOut size={12} />
                            )}
                            {revoking === s.id ? "..." : "Logout"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No other sessions */}
              {otherSessions.length === 0 && !loading && (
                <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-3xl p-8 shadow-sm text-center">
                  <div className="w-14 h-14 rounded-2xl bg-[#E8414A]/10 border border-[#E8414A]/20 flex items-center justify-center mx-auto mb-4">
                    <Shield size={26} className="text-[#E8414A]" />
                  </div>
                  <h3 className="text-base font-bold text-gray-100 mb-2">Only You</h3>
                  <p className="text-sm font-semibold text-gray-400">
                    No other active sessions found. Your account is only signed in on this device.
                  </p>
                </div>
              )}

              {/* Security info */}
              <div className="bg-[#E8414A]/10 border border-[#E8414A]/20 rounded-2xl p-5">
                <div className="text-[10px] font-bold text-[#E8414A] uppercase tracking-widest mb-2">
                  Security
                </div>
                <p className="text-xs font-semibold text-gray-300 leading-relaxed">
                  Sessions are automatically tracked when you sign in. Logging out a device immediately revokes its access — they'll be signed out on their next action.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
