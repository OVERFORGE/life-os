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
    <div className="space-y-1">
      <div className="font-medium">{label}</div>
      {description && <div className="text-sm text-gray-400">{description}</div>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#0f1115] border border-[#232632] rounded-lg p-2 min-h-[80px]"
      />
    </div>
  );
}
