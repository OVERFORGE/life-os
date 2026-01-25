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
    <div className="space-y-2">
      <div>
        <div className="font-medium">{label}</div>
        {description && <div className="text-sm text-gray-400">{description}</div>}
      </div>

      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />

      <div className="flex justify-between text-xs text-gray-400">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>

      <div className="text-right text-xs text-gray-400">
        {value} / 10
      </div>
    </div>
  );
}
