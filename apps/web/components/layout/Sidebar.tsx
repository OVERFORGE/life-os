"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  Compass,
  Calendar,
  Zap,
  Target,
  Activity,
  SlidersHorizontal,
  ChevronsRight,
} from "lucide-react";

interface WorkspaceItem {
  id: string;
  href: string;
  label: string;
  shortcut: string;
  icon: typeof Compass;
  matches: (pathname: string) => boolean;
}

const PRIMARY_WORKSPACES: WorkspaceItem[] = [
  {
    id: "cockpit",
    href: "/dashboard",
    label: "Cockpit",
    shortcut: "1",
    icon: Compass,
    matches: (p) => p === "/dashboard" || p === "/cockpit" || p.startsWith("/dashboard/"),
  },
  {
    id: "timeline",
    href: "/calendar",
    label: "Timeline",
    shortcut: "2",
    icon: Calendar,
    matches: (p) => p === "/calendar" || p === "/timeline" || p === "/history" || p.startsWith("/calendar/"),
  },
  {
    id: "execute",
    href: "/tasks",
    label: "Execute",
    shortcut: "3",
    icon: Zap,
    matches: (p) => p === "/tasks" || p === "/execute" || p.startsWith("/tasks/") || p.startsWith("/execute/"),
  },
  {
    id: "trajectory",
    href: "/goals",
    label: "Trajectory",
    shortcut: "4",
    icon: Target,
    matches: (p) => p === "/goals" || p === "/trajectory" || p.startsWith("/goals/"),
  },
  {
    id: "vitals",
    href: "/checkin",
    label: "Vitals",
    shortcut: "5",
    icon: Activity,
    matches: (p) =>
      p === "/checkin" ||
      p === "/vitals" ||
      p.startsWith("/checkin/") ||
      p === "/gym" ||
      p === "/nutrition",
  },
];

interface SidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  mobile?: boolean;
}

export function Sidebar({
  isCollapsed = false,
  onToggleCollapse,
  onClose,
  mobile,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const isSettingsActive = pathname === "/settings" || pathname.startsWith("/settings/");

  // Global Workspace Hotkeys: 1-5 for workspaces, Cmd+, for settings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        router.push("/settings");
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "1") {
          e.preventDefault();
          router.push("/dashboard");
        } else if (e.key === "2") {
          e.preventDefault();
          router.push("/calendar");
        } else if (e.key === "3") {
          e.preventDefault();
          router.push("/tasks");
        } else if (e.key === "4") {
          e.preventDefault();
          router.push("/goals");
        } else if (e.key === "5") {
          e.preventDefault();
          router.push("/checkin");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  return (
    <aside
      className={`h-full bg-transparent flex flex-col justify-between select-none relative z-20 shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isCollapsed ? "w-14 items-center" : "w-48"
      }`}
      aria-label="LifeOS Master Navigation Rail"
    >
      {/* 1. TOP ISLAND: 5 Primary Workspaces */}
      <div
        className={`bg-[#17171A] border border-[#23242A] rounded-2xl p-1.5 flex flex-col gap-1 shadow-xl transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${
          isCollapsed ? "w-14 items-center" : "w-full"
        }`}
      >
        {PRIMARY_WORKSPACES.map((workspace) => {
          const active = workspace.matches(pathname);
          const Icon = workspace.icon;

          return (
            <Link
              key={workspace.id}
              href={workspace.href}
              onClick={onClose}
              className={`relative group flex items-center rounded-xl transition-colors duration-150 overflow-hidden ${
                isCollapsed
                  ? "w-11 h-11 justify-center"
                  : "w-full px-3 py-2.5"
              } ${
                active
                  ? "bg-[#23252B] text-[#F7F5F0]"
                  : "text-[#C5C2BA] hover:text-[#F7F5F0] hover:bg-[#1E1F24]"
              }`}
            >
              {/* Active Indicator Bar on Left Edge */}
              <span
                className={`absolute top-1/2 -translate-y-1/2 w-[3px] h-4 bg-[#D98B2B] rounded-full shadow-[0_0_8px_rgba(217,139,43,0.8)] transition-all duration-200 ${
                  active
                    ? isCollapsed
                      ? "left-1.5 opacity-100"
                      : "left-2 opacity-100"
                    : "opacity-0 -left-1"
                }`}
              />

              {/* Icon Container */}
              <div
                className={`flex items-center justify-center shrink-0 transition-transform ${
                  active ? "text-[#D98B2B]" : "text-[#85827A] group-hover:text-[#F7F5F0]"
                } ${!isCollapsed ? "ml-1.5" : ""}`}
              >
                <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
              </div>

              {/* Label when expanded with buttery smooth slide/fade */}
              <div
                className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex items-center ${
                  isCollapsed
                    ? "max-w-0 opacity-0 -translate-x-2 pointer-events-none"
                    : "max-w-[130px] opacity-100 translate-x-0 pointer-events-auto ml-2.5"
                }`}
              >
                <span
                  className={`text-xs whitespace-nowrap truncate ${
                    active ? "font-semibold text-[#F7F5F0]" : "font-medium text-[#C5C2BA]"
                  }`}
                >
                  {workspace.label}
                </span>
              </div>

              {/* Floating Tooltip when collapsed */}
              {isCollapsed && (
                <div className="absolute left-full ml-3 px-2.5 py-1 bg-[#1E1F24] border border-[#23242A] text-[11px] font-medium text-[#F7F5F0] rounded-lg whitespace-nowrap shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 flex items-center gap-2">
                  <span>{workspace.label}</span>
                  <span className="font-mono text-[10px] text-[#85827A] px-1 py-0.2 bg-[#17171A] rounded border border-[#23242A]">
                    {workspace.shortcut}
                  </span>
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Middle Spacer: pure transparent canvas showing background grid */}
      <div className="flex-1" />

      {/* 2. BOTTOM ISLAND: Settings + Collapse Rail Toggle */}
      <div
        className={`bg-[#17171A] border border-[#23242A] rounded-2xl p-1.5 flex flex-col gap-1 shadow-xl transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${
          isCollapsed ? "w-14 items-center" : "w-full"
        }`}
      >
        {/* Settings Item */}
        <Link
          href="/settings"
          onClick={onClose}
          className={`relative group flex items-center rounded-xl transition-colors duration-150 overflow-hidden ${
            isCollapsed
              ? "w-11 h-11 justify-center"
              : "w-full px-3 py-2.5"
          } ${
            isSettingsActive
              ? "bg-[#23252B] text-[#F7F5F0]"
              : "text-[#C5C2BA] hover:text-[#F7F5F0] hover:bg-[#1E1F24]"
          }`}
          title="Settings (⌘,)"
        >
          <span
            className={`absolute top-1/2 -translate-y-1/2 w-[3px] h-4 bg-[#D98B2B] rounded-full shadow-[0_0_8px_rgba(217,139,43,0.8)] transition-all duration-200 ${
              isSettingsActive
                ? isCollapsed
                  ? "left-1.5 opacity-100"
                  : "left-2 opacity-100"
                : "opacity-0 -left-1"
            }`}
          />

          <div
            className={`flex items-center justify-center shrink-0 transition-transform ${
              isSettingsActive
                ? "text-[#D98B2B]"
                : "text-[#85827A] group-hover:text-[#F7F5F0]"
            } ${!isCollapsed ? "ml-1.5" : ""}`}
          >
            <SlidersHorizontal size={18} strokeWidth={isSettingsActive ? 2.2 : 1.8} />
          </div>

          <div
            className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex items-center ${
              isCollapsed
                ? "max-w-0 opacity-0 -translate-x-2 pointer-events-none"
                : "max-w-[130px] opacity-100 translate-x-0 pointer-events-auto ml-2.5"
            }`}
          >
            <span
              className={`text-xs whitespace-nowrap truncate ${
                isSettingsActive ? "font-semibold text-[#F7F5F0]" : "font-medium text-[#C5C2BA]"
              }`}
            >
              Settings
            </span>
          </div>

          {isCollapsed && (
            <div className="absolute left-full ml-3 px-2.5 py-1 bg-[#1E1F24] border border-[#23242A] text-[11px] font-medium text-[#F7F5F0] rounded-lg whitespace-nowrap shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 flex items-center gap-2">
              <span>Settings</span>
              <span className="font-mono text-[10px] text-[#85827A] px-1 py-0.2 bg-[#17171A] rounded border border-[#23242A]">
                ⌘,
              </span>
            </div>
          )}
        </Link>

        {/* Collapse / Expand Rail Toggle Button */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className={`relative group flex items-center rounded-xl text-[#85827A] hover:bg-[#1E1F24] hover:text-[#F7F5F0] transition-colors duration-150 cursor-pointer overflow-hidden ${
              isCollapsed
                ? "w-11 h-11 justify-center"
                : "w-full px-3 py-2.5"
            }`}
            title={isCollapsed ? "Expand Rail (⌘B)" : "Collapse Rail (⌘B)"}
          >
            <div className={`flex items-center justify-center shrink-0 ${!isCollapsed ? "ml-1.5" : ""}`}>
              <ChevronsRight
                size={16}
                strokeWidth={2}
                className={`transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  isCollapsed ? "rotate-0" : "rotate-180"
                }`}
              />
            </div>

            <div
              className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex items-center ${
                isCollapsed
                  ? "max-w-0 opacity-0 -translate-x-2 pointer-events-none"
                  : "max-w-[130px] opacity-100 translate-x-0 pointer-events-auto ml-2.5"
              }`}
            >
              <span className="text-xs font-mono text-[#85827A] group-hover:text-[#F7F5F0] whitespace-nowrap truncate">
                Collapse Rail
              </span>
            </div>

            {isCollapsed && (
              <div className="absolute left-full ml-3 px-2.5 py-1 bg-[#1E1F24] border border-[#23242A] text-[11px] font-medium text-[#F7F5F0] rounded-lg whitespace-nowrap shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 flex items-center gap-2">
                <span>Expand Rail</span>
                <span className="font-mono text-[10px] text-[#85827A] px-1 py-0.2 bg-[#17171A] rounded border border-[#23242A]">
                  ⌘B
                </span>
              </div>
            )}
          </button>
        )}
      </div>
    </aside>
  );
}
