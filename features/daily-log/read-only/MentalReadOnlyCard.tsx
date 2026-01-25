import { Card } from "../ui/Card";

export function MentalReadOnlyCard({ data }: { data: any }) {
  const m = data.mental;

  if (!m) return null;

  return (
    <Card title="Mental State">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <Item label="Mood" value={`${m.mood}/10`} />
        <Item label="Energy" value={`${m.energy}/10`} />
        <Item label="Stress" value={`${m.stress}/10`} />
        <Item label="Anxiety" value={`${m.anxiety}/10`} />
        <Item label="Focus" value={`${m.focus}/10`} />
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
