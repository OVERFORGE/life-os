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
    <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 md:p-8 space-y-6 shadow-sm mb-6">
      <div className="space-y-1 pb-4 border-b border-[#2A2B2F]/50">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{title}</div>
        {subtitle && <div className="text-sm font-semibold text-gray-400">{subtitle}</div>}
      </div>
      <div>
        {children}
      </div>
    </div>
  );
}
