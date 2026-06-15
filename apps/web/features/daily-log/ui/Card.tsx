export function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#161922] border border-[#232632] rounded-xl p-5 space-y-4">
      <div>
        <div className="text-lg font-semibold">{title}</div>
        {subtitle && <div className="text-sm text-gray-400">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}
