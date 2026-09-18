"use client";

import { useWorld } from "@/hooks/useWorld";

export default function InsightsView() {
  const { world, lifeState, predictions, trends, insights, isLoading, refresh } = useWorld();

  if (isLoading && !world) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10 text-center text-gray-400">
        <div className="w-8 h-8 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin mx-auto mb-4" />
        <p className="text-sm">Analyzing World State Simulation...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">LifeOS System Insights</h1>
          <p className="text-sm text-gray-400">
            Real-time simulation of your life state, execution trends, and predictive trajectory.
          </p>
        </div>
        <button
          onClick={() => refresh()}
          className="px-4 py-2 bg-[#2A2B2F] hover:bg-[#323338] text-white text-xs font-semibold rounded-lg transition-colors"
        >
          Refresh Insights
        </button>
      </div>

      <div className="space-y-6">
        {/* Life State Banner */}
        {lifeState && (
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm">
            <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2">
              Macro Life Phase & Context
            </div>
            <h2 className="text-2xl font-bold text-white mb-1">{lifeState.state}</h2>
            <p className="text-sm text-gray-300 mb-4">{lifeState.explanation}</p>
            {lifeState.evidence && lifeState.evidence.length > 0 && (
              <div className="border-t border-[#2A2B2F] pt-3 text-xs text-gray-400">
                <span className="font-semibold text-gray-300">Key Evidence: </span>
                {lifeState.evidence.join(" • ")}
              </div>
            )}
          </div>
        )}

        {/* Predictions & Trends Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {predictions.length > 0 && (
            <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">
                Trajectory Predictions ({predictions.length})
              </h3>
              <div className="space-y-3">
                {predictions.map((p, idx) => (
                  <div key={idx} className="bg-[#25262A] p-3.5 rounded-xl border border-[#303136]">
                    <div className="flex items-center justify-between text-xs font-bold text-white mb-1">
                      <span>{p.title}</span>
                      <span className="text-[#E8414A]">{Math.round((p.confidence || 0.8) * 100)}% Conf.</span>
                    </div>
                    <p className="text-xs text-gray-300">{p.predictionText}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {trends.length > 0 && (
            <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">
                Execution Metric Trends ({trends.length})
              </h3>
              <div className="space-y-3">
                {trends.map((t, idx) => (
                  <div key={idx} className="bg-[#25262A] p-3.5 rounded-xl border border-[#303136]">
                    <div className="flex items-center justify-between text-xs font-bold text-white mb-1">
                      <span>{t.metricName}</span>
                      <span className="capitalize text-emerald-400">{t.trend}</span>
                    </div>
                    <p className="text-xs text-gray-300">{t.changeDescription}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Insights Bullets */}
        {insights.length > 0 && (
          <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">
              System Adjustments & Observations
            </h3>
            <ul className="space-y-2 text-sm text-gray-300">
              {insights.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-[#E8414A] font-bold">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}