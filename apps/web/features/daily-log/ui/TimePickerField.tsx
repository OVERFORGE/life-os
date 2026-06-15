"use client";

import { SelectField } from "@/features/daily-log/ui/SelectField";

export function TimePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [hour, minutePart] = value.split(":");
  const minute = minutePart || "00";

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const minutes = ["00", "15", "30", "45"];
  const periods = ["AM", "PM"];

  function update(newHour: string, newMinute: string, period: string) {
    let h = Number(newHour);

    if (period === "PM" && h !== 12) h += 12;
    if (period === "AM" && h === 12) h = 0;

    const final = `${String(h).padStart(2, "0")}:${newMinute}`;
    onChange(final);
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-gray-200">{label}</div>

      <div className="grid grid-cols-3 gap-2">
        {/* Hour */}
        <SelectField
          label=""
          value={hour ? String(((Number(hour) + 11) % 12) + 1) : "1"}
          options={hours.map((h) => ({ value: h, label: h }))}
          onChange={(h) =>
            update(h, minute, Number(hour) >= 12 ? "PM" : "AM")
          }
        />

        {/* Minute */}
        <SelectField
          label=""
          value={minute}
          options={minutes.map((m) => ({ value: m, label: m }))}
          onChange={(m) =>
            update(
              hour ? String(((Number(hour) + 11) % 12) + 1) : "1",
              m,
              Number(hour) >= 12 ? "PM" : "AM"
            )
          }
        />

        {/* AM/PM */}
        <SelectField
          label=""
          value={Number(hour) >= 12 ? "PM" : "AM"}
          options={periods.map((p) => ({ value: p, label: p }))}
          onChange={(p) =>
            update(
              hour ? String(((Number(hour) + 11) % 12) + 1) : "1",
              minute,
              p
            )
          }
        />
      </div>
    </div>
  );
}
