"use client";

type Option = {
  value: string;
  label: string;
};

function generateTimeOptions() {
  const options: Option[] = [];

  for (let h = 0; h < 24; h++) {
    for (let m of [0, 15, 30, 45]) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");

      const value = `${hh}:${mm}`;

      const hour12 = h % 12 === 0 ? 12 : h % 12;
      const ampm = h < 12 ? "AM" : "PM";

      options.push({
        value,
        label: `${hour12}:${mm} ${ampm}`,
      });
    }
  }

  return options;
}

const TIME_OPTIONS = generateTimeOptions();

export function TimeSelectField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-sm font-medium text-gray-200">{label}</div>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#141821] border border-[#2a2f3a] rounded-xl px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-white/20"
      >
        <option value="">Select...</option>

        {TIME_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
