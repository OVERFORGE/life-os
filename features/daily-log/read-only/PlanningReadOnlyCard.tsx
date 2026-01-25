import { Card } from "../ui/Card";

export function PlanningReadOnlyCard({ data }: { data: any }) {
  const p = data.planning;
  if (!p) return null;

  return (
    <Card title="Planning vs Reality">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <Item label="Planned" value={`${p.plannedTasks}`} />
        <Item label="Completed" value={`${p.completedTasks}`} />
      </div>

      {p.reasonNotCompleted && (
        <div className="mt-4">
          <div className="text-xs text-gray-400 mb-1">Reason</div>
          <div className="bg-[#0f1115] border border-[#232632] rounded-lg p-3 text-sm">
            {p.reasonNotCompleted}
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
