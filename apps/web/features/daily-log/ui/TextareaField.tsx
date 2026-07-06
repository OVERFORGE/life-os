export function TextareaField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5 mb-4">
      <div className="text-[11px] font-semibold text-gray-400 capitalize">{label}</div>
      {description && <div className="text-[10px] text-gray-500">{description}</div>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#161618] border border-[#2A2B2F] text-gray-100 rounded-xl px-4 py-3 text-sm min-h-[80px] resize-none focus:border-[#E8414A] focus:outline-none transition-colors"
      />
    </div>
  );
}
