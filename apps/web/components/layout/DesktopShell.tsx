"use client";

import { ReactNode, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { TopNavigation } from "./TopNavigation";
import { CommandPalette } from "../ui/CommandPalette";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

const PUBLIC_PATHS = ["/", "/login", "/desktop-login", "/desktop-callback"];

export function DesktopShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith("/desktop-")
  );

  // Client-side auth guard — redirect unauthenticated users on protected pages
  useEffect(() => {
    if (!isPublic && (status === "unauthenticated" || (status === "authenticated" && !session?.user))) {
      router.replace("/login");
    }
  }, [status, session, isPublic, router]);

  // On the landing page and login page, we don't want the authenticated layout
  if (isPublic) {
    return (
      <div className="flex flex-col min-h-screen bg-[#161618] text-gray-100">
        {children}
      </div>
    );
  }

  // While session is loading on a protected route, show nothing to avoid flicker
  if (status === "loading" || status === "unauthenticated") {
    return <div className="h-screen w-full bg-[#0A0A0B]" />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0A0A0B] p-3 text-gray-100 selection:bg-[#E8414A] selection:text-white font-[var(--font-regular)]">
      
      {/* Left Sidebar - Native Dark */}
      <div className="rounded-2xl overflow-hidden border border-[#2A2B2F] bg-[#161618] shadow-sm">
        <Sidebar />
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-w-0 bg-[#161618] relative rounded-2xl overflow-hidden border border-[#2A2B2F] shadow-sm ml-3">
        <TopNavigation />
        
        <main className="flex-1 overflow-y-auto overflow-x-hidden relative scroll-smooth">
          <div className="mx-auto max-w-7xl h-full">
            {children}
          </div>
        </main>
      </div>
      
      {/* Global Modals */}
      <CommandPalette />
      
    </div>
  );
}

