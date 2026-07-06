export function EraPhaseTable({ phases }: any) {
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">Detailed Phases</h2>

      <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-gray-400 border-b border-[#2A2B2F]">
            <tr>
              <th className="p-3 text-left">Phase</th>
              <th className="p-3 text-left">From</th>
              <th className="p-3 text-left">To</th>
              <th className="p-3 text-right">Days</th>
            </tr>
          </thead>
          <tbody>
            {phases.map((p: any, i: number) => (
              <tr key={i} className="border-b border-[#2A2B2F]/50">
                <td className="p-3 capitalize">{p.phase}</td>
                <td className="p-3 text-gray-400">{p.startDate}</td>
                <td className="p-3 text-gray-400">{p.endDate || "Now"}</td>
                <td className="p-3 text-right">{p.durationDays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
