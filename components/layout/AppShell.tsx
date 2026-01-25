"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { MobileTopbar } from "./MobileTopbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0f1115] text-gray-100 flex">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile Sidebar */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-64">
            <Sidebar mobile onClose={() => setOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <MobileTopbar onMenu={() => setOpen(true)} />

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
