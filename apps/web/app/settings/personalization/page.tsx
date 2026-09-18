"use client";

import { useLearning } from "@/hooks/useLearning";
import { ArrowLeft, Clock, Moon, Activity, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function PersonalizationPage() {
  const router = useRouter();
  const { learning, profile, patterns, activeSignals, isLoading, refresh } = useLearning();

  if (isLoading && !learning) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin" />
        <div className="text-gray-400 mt-4 text-sm font-medium">Syncing Behavioral Learning Telemetry...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 bg-[#1F2023] border border-[#2A2B2F] rounded-xl text-gray-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Personalization & Behavioral Learning</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Deterministic behavioral profile and execution patterns observed by LifeOS Kernel V1.
            </p>
          </div>
        </div>
        <button
          onClick={() => refresh()}
          className="px-4 py-2 bg-[#2A2B2F] hover:bg-[#323338] text-white text-xs font-semibold rounded-lg transition-colors"
        >
          Refresh Profile
        </button>
      </div>

      <div className="space-y-6">
        {/* Behavioral Profile Card */}
        {profile && (
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#E8414A]" />
              <span>Execution Windows & Metrics</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="bg-[#25262A] p-4 rounded-xl border border-[#303136]">
                <span className="text-xs text-gray-400">Preferred Work Window</span>
                <p className="text-base font-bold text-white mt-1">
                  {profile.workHours.startHour}:00 AM - {profile.workHours.endHour > 12 ? profile.workHours.endHour - 12 : profile.workHours.endHour}:00 PM
                </p>
              </div>
              <div className="bg-[#25262A] p-4 rounded-xl border border-[#303136]">
                <span className="text-xs text-gray-400">Preferred Sleep Window</span>
                <p className="text-base font-bold text-white mt-1">
                  {profile.sleepWindow.startHour}:00 PM - {profile.sleepWindow.endHour}:00 AM
                </p>
              </div>
              <div className="bg-[#25262A] p-4 rounded-xl border border-[#303136]">
                <span className="text-xs text-gray-400">Task Completion Rate</span>
                <p className="text-base font-bold text-emerald-400 mt-1">
                  {Math.round((profile.taskCompletionRate || 0.8) * 100)}%
                </p>
              </div>
              <div className="bg-[#25262A] p-4 rounded-xl border border-[#303136]">
                <span className="text-xs text-gray-400">Execution Consistency</span>
                <p className="text-base font-bold text-blue-400 mt-1">
                  {Math.round((profile.executionConsistency || 0.85) * 100)}%
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Observed Behavioral Patterns */}
        {patterns.length > 0 && (
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#E8414A]" />
              <span>Observed Behavioral Patterns ({patterns.length})</span>
            </h2>
            <div className="space-y-3">
              {patterns.map((p) => (
                <div key={p.patternId} className="bg-[#25262A] p-4 rounded-xl border border-[#303136] flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">{p.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{p.description}</p>
                  </div>
                  <span className="text-xs bg-[#E8414A]/20 text-[#E8414A] px-2.5 py-1 rounded font-semibold capitalize">
                    {p.confidence}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Learning Signals */}
        {activeSignals.length > 0 && (
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Active Kernel Signals ({activeSignals.length})</span>
            </h2>
            <div className="space-y-3">
              {activeSignals.map((s) => (
                <div key={s.signalId} className="bg-[#25262A] p-4 rounded-xl border border-[#303136]">
                  <div className="flex items-center justify-between text-xs font-bold text-white mb-1">
                    <span>{s.title}</span>
                    <span className="text-emerald-400 capitalize">{s.confidence}</span>
                  </div>
                  <p className="text-xs text-gray-300">{s.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
