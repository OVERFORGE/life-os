import { Card } from "../ui/Card";

export function ReflectionReadOnlyCard({ data }: { data: any }) {
  const r = data.reflection;
  if (!r) return null;

  const Block = ({ label, value }: { label: string; value: string }) =>
    value ? (
      <div>
        <div className="text-xs text-gray-400 mb-1">{label}</div>
        <div className="bg-[#0f1115] border border-[#232632] rounded-lg p-3 text-sm">
          {value}
        </div>
      </div>
    ) : null;

  return (
    <Card title="Reflection">
      <div className="space-y-4">
        <Block label="1 Win" value={r.win} />
        <Block label="1 Mistake" value={r.mistake} />
        <Block label="What did you learn?" value={r.learned} />
        <Block label="What's bothering you?" value={r.bothering} />
      </div>
    </Card>
  );
}
