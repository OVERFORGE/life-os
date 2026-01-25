import { Card } from "../ui/Card";

export function WorkReadOnlyCard({ data }: { data: any }) {
  const w = data.work;
  if (!w) return null;

  return (
    <Card title="Work & Output">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <Item label="Deep Work" value={`${w.deepWorkHours} hrs`} />
        <Item label="Coded" value={w.coded ? "Yes" : "No"} />
        <Item label="Executioners" value={w.executioners ? "Yes" : "No"} />
        <Item label="Studied" value={w.studied ? "Yes" : "No"} />
      </div>

      {w.mainWork && (
        <div className="mt-4">
          <div className="text-xs text-gray-400 mb-1">Main Work</div>
          <div className="bg-[#0f1115] border border-[#232632] rounded-lg p-3 text-sm">
            {w.mainWork}
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
