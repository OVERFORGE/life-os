import React from "react";

export function Card({ children, className = "", noPadding = false }: { children: React.ReactNode; className?: string; noPadding?: boolean }) {
  return (
    <div className={`bg-[var(--color-bg-card)] rounded-[var(--radius-xl)] shadow-[var(--shadow-surface)] overflow-hidden transition-all duration-300 ${!noPadding ? "p-[var(--spacing-8)]" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between mb-[var(--spacing-4)] ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={`font-[var(--font-bold)] text-[var(--text-lg)] text-[var(--color-text-primary)] ${className}`}>
      {children}
    </h3>
  );
}
