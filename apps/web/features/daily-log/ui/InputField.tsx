export function InputField({
  label,
  description,
  type = "text",
  value,
  onChange,
}: {
  label: string;
  description?: string;
  type?: string;
  value: string | number;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5 mb-4">
      <div className="text-[11px] font-semibold text-gray-400 capitalize">{label}</div>
      {description && <div className="text-[10px] text-gray-500">{description}</div>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#161618] border border-[#2A2B2F] text-gray-100 rounded-xl px-4 py-3 text-sm focus:border-[#E8414A] focus:outline-none transition-colors"
      />
    </div>
  );
}
