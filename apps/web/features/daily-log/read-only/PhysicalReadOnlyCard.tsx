import { Card } from "../ui/Card";

export function PhysicalReadOnlyCard({ data }: { data: any }) {
  const p = data.physical;
  if (!p) return null;

  return (
    <Card title="Physical Health">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <Item label="Gym" value={p.gym ? "Yes" : "No"} />
        <Item label="Workout" value={p.workoutType || "-"} />
        <Item label="Calories" value={`${p.calories}`} />
        <Item label="Meals" value={`${p.meals}`} />
        <Item label="Steps" value={`${p.steps}`} />
        <Item label="Body Feeling" value={p.bodyFeeling} />
      </div>

      {p.painNote && (
        <div className="mt-4">
          <div className="text-xs text-gray-400 mb-1">Pain / Sickness</div>
          <div className="bg-[#0f1115] border border-[#232632] rounded-lg p-3 text-sm">
            {p.painNote}
          </div>
        </div>
      )}
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
