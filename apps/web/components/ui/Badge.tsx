import React from "react";

export function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full bg-[var(--color-bg-highlight)] px-2.5 py-0.5 text-[var(--text-xs)] font-[var(--font-bold)] uppercase tracking-[var(--tracking-wide)] text-[var(--color-brand-primary)] border border-[var(--color-border-highlight)] ${className}`}>
      {children}
    </span>
  );
}
