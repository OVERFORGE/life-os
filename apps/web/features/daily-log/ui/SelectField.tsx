"use client";

type Option = {
  value: string;
  label: string;
};

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5 mb-4">
      {label && <div className="text-[11px] font-semibold text-gray-400 capitalize">{label}</div>}

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#161618] border border-[#2A2B2F] rounded-xl px-4 py-3 text-sm font-semibold text-gray-100 focus:border-[#E8414A] focus:outline-none transition-colors appearance-none"
      >
        <option key="__default" value="" className="text-gray-500">
          Select...
        </option>

        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
