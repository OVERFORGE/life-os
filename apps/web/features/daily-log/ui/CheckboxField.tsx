export function CheckboxField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 mb-4 cursor-pointer group">
      <div className="flex items-center justify-between">
        <span className="text-[14px] text-gray-300 group-hover:text-gray-100 transition-colors">{label}</span>
        <div className={`w-12 h-6 rounded-full p-1 transition-colors ${checked ? 'bg-[#E8414A]' : 'bg-[#2A2B2F]'}`}>
          <div className={`w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
        </div>
      </div>
      {description && <div className="text-[10px] text-gray-500">{description}</div>}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="hidden"
      />
    </label>
  );
}
