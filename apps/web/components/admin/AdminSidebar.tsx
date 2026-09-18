"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FlaskConical,
  Play,
  Users,
  FileCode,
  History,
  CheckCircle2,
  GitCompare,
  Zap,
  BarChart3,
  Cpu,
  Activity,
  Sliders,
  ChevronDown,
  ChevronRight,
  Terminal,
} from "lucide-react";
import { ADMIN_NAVIGATION, NavItem } from "./constants";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  FlaskConical,
  Play,
  Users,
  FileCode,
  History,
  CheckCircle2,
  GitCompare,
  Zap,
  BarChart3,
  Cpu,
  Activity,
  Sliders,
};

export function AdminSidebar() {
  const pathname = usePathname();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    "Kernel Lab": true,
  });

  const toggleGroup = (title: string) => {
    setExpandedGroups((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const isLinkActive = (href: string) => {
    if (href === "/admin") {
      return pathname === "/admin";
    }
    return pathname.startsWith(href);
  };

  return (
    <aside className="w-64 h-full bg-[#0E0E11] border-r border-[#27272A] flex flex-col select-none shrink-0 font-sans">
      {/* Console Brand Header */}
      <div className="p-4 border-b border-[#27272A] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-md bg-[#1E1E22] border border-[#27272A] text-[#E8414A]">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-mono font-bold tracking-wider text-white uppercase">
              LIFEOS LAB
            </div>
            <div className="text-[10px] font-mono text-[#71717A]">
              ENGINEERING CONSOLE
            </div>
          </div>
        </div>
        <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-[#1E1E22] text-[#A1A1AA] border border-[#27272A]">
          v1.1
        </span>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-3 space-y-6 overflow-y-auto">
        {ADMIN_NAVIGATION.map((section, idx) => (
          <div key={idx} className="space-y-1">
            {section.sectionTitle && (
              <div className="px-2 pb-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-[#71717A]">
                {section.sectionTitle}
              </div>
            )}

            {section.items.map((item) => (
              <RenderNavItem
                key={item.href}
                item={item}
                pathname={pathname}
                isLinkActive={isLinkActive}
                expandedGroups={expandedGroups}
                toggleGroup={toggleGroup}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* System Status Footer */}
      <div className="p-3 border-t border-[#27272A] bg-[#121215]">
        <div className="flex items-center justify-between text-[11px] font-mono text-[#A1A1AA]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#E8414A] animate-pulse" />
            <span>KERNEL: STANDBY</span>
          </div>
          <span className="text-[10px] text-[#71717A]">SEED 0x4F8A</span>
        </div>
      </div>
    </aside>
  );
}

function RenderNavItem({
  item,
  isLinkActive,
  expandedGroups,
  toggleGroup,
}: {
  item: NavItem;
  pathname: string;
  isLinkActive: (href: string) => boolean;
  expandedGroups: Record<string, boolean>;
  toggleGroup: (title: string) => void;
}) {
  const IconComponent = item.icon ? ICON_MAP[item.icon] : null;
  const active = isLinkActive(item.href);

  if (item.children && item.children.length > 0) {
    const isExpanded = expandedGroups[item.title] ?? true;
    const hasActiveChild = item.children.some((child) => isLinkActive(child.href));

    return (
      <div className="space-y-1">
        <button
          onClick={() => toggleGroup(item.title)}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-mono transition-colors ${
            hasActiveChild
              ? "text-white font-medium bg-[#18181B]"
              : "text-[#A1A1AA] hover:text-white hover:bg-[#18181B]/60"
          }`}
        >
          <div className="flex items-center gap-2">
            {IconComponent && (
              <IconComponent
                className={`w-3.5 h-3.5 ${hasActiveChild ? "text-[#E8414A]" : "text-[#71717A]"}`}
              />
            )}
            <span>{item.title}</span>
          </div>
          {isExpanded ? (
            <ChevronDown className="w-3 h-3 text-[#71717A]" />
          ) : (
            <ChevronRight className="w-3 h-3 text-[#71717A]" />
          )}
        </button>

        {isExpanded && (
          <div className="ml-3 pl-2.5 border-l border-[#27272A] space-y-1 mt-1">
            {item.children.map((child) => {
              const ChildIcon = child.icon ? ICON_MAP[child.icon] : null;
              const childActive = isLinkActive(child.href);

              return (
                <Link
                  key={child.href}
                  href={child.href}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-mono transition-colors ${
                    childActive
                      ? "bg-[#E8414A]/15 text-white font-medium border border-[#E8414A]/30"
                      : "text-[#A1A1AA] hover:text-white hover:bg-[#18181B]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {ChildIcon && (
                      <ChildIcon
                        className={`w-3.5 h-3.5 ${
                          childActive ? "text-[#E8414A]" : "text-[#71717A]"
                        }`}
                      />
                    )}
                    <span>{child.title}</span>
                  </div>
                  {child.isComingSoon && (
                    <span className="px-1.5 py-0.2 text-[9px] font-mono rounded bg-[#1E1E22] text-[#71717A] border border-[#27272A]">
                      SOON
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-mono transition-colors ${
        active
          ? "bg-[#E8414A]/15 text-white font-medium border border-[#E8414A]/30"
          : "text-[#A1A1AA] hover:text-white hover:bg-[#18181B]"
      }`}
    >
      <div className="flex items-center gap-2">
        {IconComponent && (
          <IconComponent
            className={`w-3.5 h-3.5 ${active ? "text-[#E8414A]" : "text-[#71717A]"}`}
          />
        )}
        <span>{item.title}</span>
      </div>
      {item.isComingSoon && (
        <span className="px-1.5 py-0.2 text-[9px] font-mono rounded bg-[#1E1E22] text-[#71717A] border border-[#27272A]">
          SOON
        </span>
      )}
    </Link>
  );
}
