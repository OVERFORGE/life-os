import {
  Moon,
  Smile,
  Dumbbell,
  Zap,
  Brain,
  Code2,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Log } from "../utils/stats";
import { computeCorrelations } from "../utils/correlations";

function InsightCard({
  title,
  value,
  description,
  iconLeft,
  iconRight,
}: {
  title: string;
  value: number;
  description: string;
  iconLeft: React.ReactNode;
  iconRight: React.ReactNode;
}) {
  const strength =
    Math.abs(value) > 0.6 ? "Strong" : Math.abs(value) > 0.3 ? "Moderate" : "Weak";

  const color =
    Math.abs(value) > 0.6
      ? "text-green-400"
      : Math.abs(value) > 0.3
      ? "text-yellow-400"
      : "text-gray-400";

  const TrendIcon = value >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className="bg-[#161922] border border-[#232632] rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#0f1115] border border-[#232632] flex items-center justify-center">
            {iconLeft}
          </div>
          <span className="text-gray-500">→</span>
          <div className="w-8 h-8 rounded-lg bg-[#0f1115] border border-[#232632] flex items-center justify-center">
            {iconRight}
          </div>
        </div>
        <TrendIcon className="w-5 h-5 text-gray-400" />
      </div>

      <div>
        <div className="text-sm text-gray-400">{title}</div>
        <div className={`text-lg font-semibold ${color}`}>
          {strength} ({value.toFixed(2)})
        </div>
      </div>

      <div className="text-xs text-gray-400">{description}</div>
    </div>
  );
}

export function InsightsGrid({ logs }: { logs: Log[] }) {
  const c = computeCorrelations(logs);

  return (
    <div className="space-y-4">
      <div className="font-medium">Insights</div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InsightCard
          title="Sleep vs Mood"
          value={c.sleepMood}
          description="More sleep is associated with better mood."
          iconLeft={<Moon className="w-4 h-4" />}
          iconRight={<Smile className="w-4 h-4" />}
        />

        <InsightCard
          title="Gym vs Energy"
          value={c.gymEnergy}
          description="Working out seems to boost your energy."
          iconLeft={<Dumbbell className="w-4 h-4" />}
          iconRight={<Zap className="w-4 h-4" />}
        />

        <InsightCard
          title="Sleep Quality vs Focus"
          value={c.sleepFocus}
          description="Better sleep quality improves focus."
          iconLeft={<Moon className="w-4 h-4" />}
          iconRight={<Brain className="w-4 h-4" />}
        />

        <InsightCard
          title="Coding vs Focus"
          value={c.codingFocus}
          description="Coding days are linked with higher focus."
          iconLeft={<Code2 className="w-4 h-4" />}
          iconRight={<Brain className="w-4 h-4" />}
        />
      </div>
    </div>
  );
}
