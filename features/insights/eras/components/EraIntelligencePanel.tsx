export function EraIntelligencePanel({ explanation }: { explanation: any }) {
  if (!explanation) return null;

  const { causes, changes, signals, risks, leverage } = explanation;

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <IntelBlock title="Why this era happened" items={causes} />
      <IntelBlock title="What changed" items={changes} />
      <IntelBlock title="Key signals" items={signals} />
      <IntelBlock title="Risks" items={risks} />
      <IntelBlock title="Leverage points" items={leverage} />
    </div>
  );
}

function IntelBlock({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="bg-[#161922] border border-[#232632] rounded-xl p-5">
      <div className="text-sm text-gray-400 mb-2">{title}</div>
      <ul className="list-disc pl-5 text-gray-300 space-y-1 text-sm">
        {items.map((i, idx) => (
          <li key={idx}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
