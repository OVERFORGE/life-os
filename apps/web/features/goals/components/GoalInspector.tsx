import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Target, Activity, Zap, TrendingUp, AlertCircle, Sparkles } from "lucide-react";

export function GoalInspector({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGoal();
  }, [goalId]);

  const fetchGoal = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/goals/${goalId}`);
      const json = await res.json();
      if (!json.error) setData(json);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  if (loading) return <div className="text-sm text-[#9ca3af] animate-pulse">Loading goal context...</div>;
  if (!data || !data.goal) return <div className="text-sm text-[#ef4444]">Goal not found</div>;

  const { goal, stats, adaptation, pressure } = data;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Title */}
      <div className="space-y-4 pb-6 border-b border-[#2A2B2F]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-100">
              {goal.title}
            </h2>
            {goal.description && (
              <p className="text-sm text-gray-400 mt-2">
                {goal.description}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <button 
              onClick={() => router.push(`/goals/new?editId=${goalId}`)}
              className="px-3 py-1.5 text-xs font-medium bg-[#1F2023] border border-[#2A2B2F] rounded-lg text-gray-300 hover:bg-[#2A2B2F] transition-colors"
            >
              Edit Goal
            </button>
            <button 
              onClick={async () => {
                if (confirm("Are you sure you want to delete this goal?")) {
                  await fetch(`/api/goals/${goalId}`, { method: "DELETE" });
                  router.push("/goals");
                }
              }}
              className="px-3 py-1.5 text-xs font-medium bg-[#E8414A]/10 border border-[#E8414A]/20 rounded-lg text-[#E8414A] hover:bg-[#E8414A]/20 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-[#2A2B2F]/50 space-y-1">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">
            <Activity size={10} /> State
          </span>
          <div className="text-sm font-medium text-gray-200 capitalize">
            {stats?.state?.replace("_", " ") || "Unknown"}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#2A2B2F]/50 space-y-1">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">
            <TrendingUp size={10} /> Progress
          </span>
          <div className="text-sm font-medium text-gray-200">
            {stats?.currentScore || 0}%
          </div>
        </div>
      </div>

      {/* AI Adaptation (If any) */}
      {adaptation?.recommendation && adaptation.recommendation !== "maintain" && (
        <div className="p-5 rounded-xl bg-[#E8414A]/10 border border-[#E8414A]/20 space-y-3">
          <div className="flex items-center gap-2 text-[#E8414A]">
            <Sparkles size={16} />
            <h4 className="text-sm font-bold">Jarvis Adaptation</h4>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">
            {adaptation.reasoning}
          </p>
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-[#E8414A] text-white text-xs font-medium rounded-lg shadow-sm hover:bg-[#D62C35] transition-colors">
              Accept {adaptation.recommendation}
            </button>
          </div>
        </div>
      )}

      {/* Signals */}
      {goal.signals && goal.signals.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">
            Tracked Signals
          </h4>
          <div className="space-y-2">
            {goal.signals.map((sig: any) => (
              <div key={sig._id} className="flex items-center justify-between p-4 rounded-xl bg-[#2A2B2F]/50">
                <span className="text-sm font-medium text-gray-200">{sig.key}</span>
                <span className="text-xs text-gray-400">{sig.direction === "higher_better" ? "↑ Maximize" : "↓ Minimize"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
    </div>
  );
}
