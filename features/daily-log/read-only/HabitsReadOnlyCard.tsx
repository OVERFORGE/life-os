import { Card } from "../ui/Card";

export function HabitsReadOnlyCard({ data }: { data: any }) {
  const h = data.habits;
  if (!h) return null;

  const ItemRow = ({ label, value }: { label: string; value: boolean }) => (
    <div className="flex justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span>{value ? "Yes" : "No"}</span>
    </div>
  );

  return (
    <Card title="Habits & Discipline">
      <div className="space-y-2">
        <ItemRow label="Gym" value={h.gym} />
        <ItemRow label="Reading" value={h.reading} />
        <ItemRow label="Meditation" value={h.meditation} />
        <ItemRow label="Coding" value={h.coding} />
        <ItemRow label="Content" value={h.content} />
        <ItemRow label="Learning" value={h.learning} />
        <ItemRow label="NoFap" value={h.noFap} />
        <ItemRow label="Social media overuse" value={h.socialMediaOveruse} />
      </div>

      {h.junkFood?.had && (
        <div className="mt-4 text-sm">
          <div className="text-gray-400">Junk Food</div>
          <div className="mt-1">
            {h.junkFood.times} time(s) — {h.junkFood.what}
          </div>
        </div>
      )}
    </Card>
  );
}
