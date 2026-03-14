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
    <div className="space-y-1">
      <div className="text-sm font-medium text-gray-200">{label}</div>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#0f1115] border border-[#232632] rounded-lg px-3 py-2 text-gray-100"
      >
        <option key="__default" value="">
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
