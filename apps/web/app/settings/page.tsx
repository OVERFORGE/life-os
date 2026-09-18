"use client";

import { useDiagnostics } from "@/hooks/useDiagnostics";
import { useRouter } from "next/navigation";
import { Power, Activity, ShieldCheck, ChevronRight, User as UserIcon } from "lucide-react";

export default function SettingsDashboard() {
  const router = useRouter();
  const { diagnostics, health, performance, metrics, isLoading, refresh } = useDiagnostics();

  const handleLogout = () => {
    if (confirm("Are you sure you want to sign out?")) {
      window.location.href = "/api/auth/signout";
    }
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 max-w-3xl mx-auto w-full pt-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-100">System Diagnostics & Settings</h1>
          <p className="text-sm text-gray-400 mt-1">Kernel V1 telemetry, subsystem latency profiler, and configuration.</p>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs font-bold tracking-wider text-red-500 hover:bg-red-500/20 transition-colors uppercase"
        >
          <Power size={14} /> Logout
        </button>
      </div>

      <div className="flex-1 pb-20 space-y-6">
        {/* Kernel Telemetry Health Card */}
        {health && (
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
                <div>
                  <h3 className="text-lg font-bold text-white">Kernel Health Telemetry</h3>
                  <p className="text-xs text-gray-400">Snapshot ID: {diagnostics?.snapshotId}</p>
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  health.status === "Healthy"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-amber-500/20 text-amber-400"
                }`}
              >
                {health.status} ({health.score}/100)
              </span>
            </div>

            {health.evidence && health.evidence.length > 0 && (
              <div className="border-t border-[#2A2B2F] pt-3 text-xs text-gray-400">
                <span className="font-semibold text-gray-300">Health Evidence: </span>
                {health.evidence.join(" • ")}
              </div>
            )}
          </div>
        )}

        {/* Subsystem Performance Profiler */}
        {performance && (
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#E8414A]" />
                <span>Subsystem Latency Profiler</span>
              </h3>
              <button
                onClick={() => refresh()}
                className="px-3 py-1 bg-[#2A2B2F] hover:bg-[#323338] text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Re-profile Latencies
              </button>
            </div>

            <div className="space-y-2">
              {performance.subsystemLatencies.slice(0, 6).map((item) => (
                <div key={item.subsystem} className="flex items-center justify-between bg-[#25262A] p-3 rounded-xl text-xs">
                  <span className="font-bold text-white">{item.subsystem}</span>
                  <div className="flex items-center gap-4 text-gray-400 font-mono">
                    <span>Avg {item.avgLatencyMs.toFixed(1)}ms</span>
                    <span>P95 {item.p95LatencyMs.toFixed(1)}ms</span>
                    <span className="text-gray-500">({item.executionCount} calls)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Personalization Navigation Link */}
        <div
          onClick={() => router.push("/settings/personalization")}
          className="bg-[#1F2023] border border-[#2A2B2F] hover:border-[#383A40] rounded-2xl p-6 cursor-pointer transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[#E8414A]/10 text-[#E8414A] rounded-xl">
              <UserIcon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white group-hover:text-[#E8414A] transition-colors">
                Personalization & Behavioral Learning
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                View work window rules, behavioral profiles, and active signals.
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </div>
  );
}
