export function SliderField({
  label,
  description,
  leftLabel,
  rightLabel,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  leftLabel: string;
  rightLabel: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-3 mb-6">
      <div>
        <div className="text-[11px] font-semibold text-gray-400 capitalize">{label}</div>
        {description && <div className="text-[10px] text-gray-500">{description}</div>}
      </div>

      <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-4">
        <div className="flex justify-between items-center gap-1 mb-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => (
            <button
              key={v}
              onClick={() => onChange(v)}
              className={`flex-1 aspect-square rounded-lg flex items-center justify-center transition-colors ${
                value >= v ? 'bg-[#E8414A]/15' : 'bg-[#2A2B2F] hover:bg-[#3A3C42]'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${value >= v ? 'bg-[#E8414A]' : 'bg-[#2A2B2F]'}`} />
            </button>
          ))}
        </div>
        
        <div className="flex justify-between items-center text-[10px] font-bold text-gray-600 uppercase tracking-widest">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      </div>
    </div>
  );
}
