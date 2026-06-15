import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Log } from "../utils/stats";

export function MoodEnergyChart({ logs }: { logs: Log[] }) {
  const last14 = logs.slice(-14);

  const data = last14.map((l) => ({
    date: l.date.slice(5),
    mood: l.mental?.mood ?? null,
    energy: l.mental?.energy ?? null,
  }));

  return (
    <div className="bg-[#161922] border border-[#232632] rounded-xl p-4 h-[300px]">
      <div className="mb-2 font-medium">Mood & Energy (Last 14 Days)</div>

      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="date" />
          <YAxis domain={[0, 10]} />
          <Tooltip />
          <Line type="monotone" dataKey="mood" stroke="#60a5fa" />
          <Line type="monotone" dataKey="energy" stroke="#34d399" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
