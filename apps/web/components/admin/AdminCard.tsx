"use client";

import React from "react";

interface AdminCardProps {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function AdminCard({ children, className = "", noPadding = false }: AdminCardProps) {
  return (
    <div
      className={`bg-[#121215] border border-[#27272A] rounded-lg transition-all duration-200 hover:border-[#3F3F46] ${
        !noPadding ? "p-5" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function AdminCardHeader({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between pb-3 mb-4 border-b border-[#1E1E22] ${className}`}>
      {children}
    </div>
  );
}

export function AdminCardTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={`font-mono text-xs uppercase tracking-wider font-semibold text-white ${className}`}>
      {children}
    </h3>
  );
}
