"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  Settings,
  Target,
  LogOut,
  LogIn,
  BrainCircuit,
  Activity,
  Apple,
  Dumbbell,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";

const navSections = [
  {
    title: "Intelligence",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/dashboard/assistant", label: "Assistant", icon: BrainCircuit },
    ],
  },
  {
    title: "Organization",
    items: [
      { href: "/calendar", label: "Calendar", icon: Calendar },
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
      { href: "/goals", label: "Goals", icon: Target },
      { href: "/history", label: "Timeline", icon: Calendar },
    ],
  },
  {
    title: "Execution",
    items: [
      { href: "/checkin", label: "Daily Log", icon: Activity },
      { href: "/gym", label: "Gym", icon: Dumbbell },
      { href: "/nutrition", label: "Nutrition", icon: Apple },
    ],
  },
];

interface SidebarProps {
  mobile?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({
  mobile,
  onClose,
  isCollapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  const collapsed = isCollapsed && !mobile;

  return (
    <aside
      className={`h-full flex flex-col pt-2 transition-all duration-300 ease-in-out select-none bg-[#161618] ${
        collapsed ? "w-[68px]" : "w-[260px]"
      }`}
    >
      {/* Brand Header */}
      <div
        className={`h-16 flex items-center transition-all duration-300 ${
          collapsed ? "px-3 justify-center" : "px-5 justify-between"
        }`}
      >
        {collapsed ? (
          <div className="flex flex-col items-center">
            <button
              onClick={onToggleCollapse}
              className="group relative w-10 h-10 rounded-xl bg-[#E8414A]/10 border border-[#E8414A]/25 flex items-center justify-center overflow-hidden hover:border-[#E8414A]/50 hover:bg-[#E8414A]/20 transition-all shadow-sm active:scale-95"
              title="Expand sidebar (Ctrl+B)"
            >
              <img
                src="/logo.png"
                alt="LifeOS Logo"
                className="w-5 h-5 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/icon.png";
                }}
              />
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <PanelLeftOpen size={16} className="text-white" />
              </div>
            </button>
          </div>
        ) : (
          <>
            <Link
              href="/dashboard"
              className="flex items-center gap-3 group transition-opacity hover:opacity-90"
            >
              <div className="w-9 h-9 rounded-xl bg-[#E8414A]/10 border border-[#E8414A]/25 flex items-center justify-center overflow-hidden shrink-0 shadow-sm transition-all group-hover:border-[#E8414A]/40 group-hover:bg-[#E8414A]/15">
                <img
                  src="/logo.png"
                  alt="LifeOS Logo"
                  className="w-5 h-5 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/icon.png";
                  }}
                />
              </div>
              <div className="flex items-baseline gap-1 select-none">
                <span className="font-extrabold text-base tracking-[0.14em] text-[#FFFDFC] uppercase font-sans">
                  Life
                </span>
                <span className="font-semibold text-base tracking-[0.14em] text-[#ECE7E3]/60 uppercase font-sans">
                  OS
                </span>
              </div>
            </Link>

            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                title="Collapse sidebar (Ctrl+B)"
              >
                <PanelLeftClose size={17} />
              </button>
            )}
          </>
        )}
      </div>

      {/* Navigation */}
      <div
        className={`flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-6 ${
          collapsed ? "px-2" : "px-3"
        }`}
      >
        {navSections.map((section, idx) => (
          <div key={section.title}>
            {collapsed ? (
              idx > 0 && <div className="w-8 mx-auto my-3 border-t border-[#2A2B2F]" />
            ) : (
              <div className="px-3 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#ECE7E3]/50 opacity-70">
                  {section.title}
                </span>
              </div>
            )}

            <div className="space-y-1">
              {section.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
                const Icon = item.icon;

                if (collapsed) {
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={`relative group flex items-center justify-center w-10 h-10 mx-auto rounded-xl transition-all duration-200 ${
                        active
                          ? "bg-white/10 text-white border border-white/15 shadow-sm"
                          : "text-gray-400 hover:bg-white/5 hover:text-white"
                      }`}
                      title={item.label}
                    >
                      <Icon
                        size={18}
                        className={
                          active
                            ? "text-white"
                            : "text-gray-400 group-hover:text-gray-200"
                        }
                      />

                      {/* Floating Tooltip */}
                      <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-[#1F2023] border border-[#2A2B2F] text-xs text-white rounded-lg whitespace-nowrap shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 z-50">
                        {item.label}
                      </div>
                    </Link>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                      active
                        ? "bg-white/10 text-white shadow-sm font-semibold"
                        : "text-gray-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon
                      size={16}
                      className={
                        active
                          ? "text-white"
                          : "text-gray-400 group-hover:text-gray-200"
                      }
                    />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer / Settings & Sign Out */}
      <div
        className={`p-3 mb-2 space-y-1 border-t border-[#2A2B2F]/60 ${
          collapsed ? "px-2" : "px-3"
        }`}
      >
        {collapsed ? (
          <>
            <Link
              href="/settings"
              onClick={onClose}
              className={`relative group flex items-center justify-center w-10 h-10 mx-auto rounded-xl transition-all duration-200 ${
                pathname === "/settings" || pathname.startsWith("/settings/")
                  ? "bg-white/10 text-white border border-white/15 shadow-sm"
                  : "text-gray-400 hover:bg-white/5 hover:text-white"
              }`}
              title="Settings"
            >
              <Settings size={18} />
              <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-[#1F2023] border border-[#2A2B2F] text-xs text-white rounded-lg whitespace-nowrap shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 z-50">
                Settings
              </div>
            </Link>

            {session?.user && (
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="relative group flex items-center justify-center w-10 h-10 mx-auto rounded-xl text-[#F3767D] hover:bg-white/5 transition-all duration-200"
                title="Sign out"
              >
                <LogOut size={18} />
                <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-[#1F2023] border border-[#2A2B2F] text-xs text-white rounded-lg whitespace-nowrap shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 z-50">
                  Sign out
                </div>
              </button>
            )}
          </>
        ) : (
          <>
            <Link
              href="/settings"
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                pathname === "/settings" || pathname.startsWith("/settings/")
                  ? "bg-white/10 text-white shadow-sm font-semibold"
                  : "text-gray-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Settings size={16} />
              <span>Settings</span>
            </Link>

            {status === "loading" ? (
              <div className="px-3 py-2 text-xs text-gray-500">Loading...</div>
            ) : session?.user ? (
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-[#F3767D] hover:bg-white/5 transition-all duration-200"
              >
                <LogOut size={16} />
                <span>Sign out</span>
              </button>
            ) : (
              <button
                onClick={() => (window.location.href = "/login")}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-400 hover:bg-white/5 hover:text-white transition-all duration-200"
              >
                <LogIn size={16} />
                <span>Sign in</span>
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
