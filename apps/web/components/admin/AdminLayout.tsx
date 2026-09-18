"use client";

import React from "react";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopNav } from "./AdminTopNav";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#09090B] text-gray-100 selection:bg-[#E8414A] selection:text-white font-sans">
      {/* Left Sidebar */}
      <AdminSidebar />

      {/* Main Container */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        {/* Top Navigation */}
        <AdminTopNav />

        {/* Content Viewport */}
        <main className="flex-1 overflow-y-auto p-6 scroll-smooth bg-[#09090B]">
          <div className="mx-auto max-w-7xl h-full space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
