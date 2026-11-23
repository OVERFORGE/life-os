"use client";

import { ReactNode, useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopNavigation } from "./TopNavigation";
import { OfflineBanner } from "./OfflineBanner";
import { CommandPalette } from "../ui/CommandPalette";
import { AmbientActiveExecutionBanner } from "@/components/surface/AmbientActiveExecutionBanner";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

const PUBLIC_PATHS = ["/", "/login", "/desktop-login", "/desktop-callback", "/hud"];

export function DesktopShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Restore sidebar collapsed preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("lifeos_sidebar_collapsed");
      if (saved !== null) {
        setIsSidebarCollapsed(saved === "true");
      }
    } catch {}
  }, []);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("lifeos_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  // Keyboard shortcut Ctrl+B or Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        if (
          document.activeElement?.tagName === "INPUT" ||
          document.activeElement?.tagName === "TEXTAREA"
        ) {
          return;
        }
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith("/desktop-")
  );

  // Client-side auth guard — redirect unauthenticated users on protected pages
  useEffect(() => {
    if (!isPublic && (status === "unauthenticated" || (status === "authenticated" && !session?.user))) {
      router.replace("/login");
    }
  }, [status, session, isPublic, router]);

  // For Desktop HUD overlay, ensure 100% transparent background for Dynamic Ledge notch
  if (pathname === "/hud") {
    return (
      <div className="w-screen h-screen bg-transparent overflow-hidden select-none">
        {children}
      </div>
    );
  }

  // On the landing page, login page, or internal admin console, bypass consumer shell
  if (isPublic || pathname.startsWith("/admin")) {
    return (
      <div className="flex flex-col min-h-screen bg-[#111113] text-[#F7F5F0]">
        {children}
      </div>
    );
  }

  // While session is loading on a protected route, show dark canvas to avoid flicker
  if (status === "loading" || status === "unauthenticated") {
    return <div className="h-screen w-full bg-[#111113]" />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#111113] text-[#F7F5F0] selection:bg-[#D98B2B]/30 selection:text-[#F7F5F0] font-sans">
      
      {/* 1. Full-Width Top Horizon Bar (Acts as the Native Electron Window Top Bar) */}
      <TopNavigation
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={toggleSidebar}
      />

      <OfflineBanner />

      {/* 2. Master Viewport Body (Floating Left Rail + Main Content Canvas) */}
      <div className="flex flex-1 min-h-0 px-3 pb-3 gap-3 overflow-hidden pt-2">
        {/* Floating Left Dock */}
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />

        {/* Floating Main Content Workspace Canvas */}
        <div className="flex flex-col flex-1 min-w-0 bg-[#111113] relative rounded-2xl overflow-hidden border border-[#23242A] shadow-2xl">
          <main className="flex-1 overflow-y-auto overflow-x-hidden relative scroll-smooth bg-[#111113]">
            <div className="h-full">
              {children}
            </div>
          </main>
        </div>
      </div>
      
      {/* Global Modals & Ambient Interaction Layer */}
      <CommandPalette />
      <AmbientActiveExecutionBanner />
      
    </div>
  );
}
