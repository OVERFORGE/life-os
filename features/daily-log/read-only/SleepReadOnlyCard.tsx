import { Card } from "../ui/Card";

export function SleepReadOnlyCard({ data }: { data: any }) {
  const s = data.sleep;
  if (!s) return null;

  return (
    <Card title="Sleep">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <Item label="Hours" value={`${s.hours} hrs`} />
        <Item label="Quality" value={`${s.quality}/10`} />
        <Item label="Sleep Time" value={s.sleepTime || "-"} />
        <Item label="Wake Time" value={s.wakeTime || "-"} />
      </div>
    </Card>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0f1115] border border-[#232632] rounded-lg p-3">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-base">{value}</div>
    </div>
  );
}
