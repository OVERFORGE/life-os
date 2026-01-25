"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  BarChart3,
  Settings,
  X,
} from "lucide-react";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/checkin", label: "Daily Check-in", icon: CheckSquare },
  { href: "/history", label: "History", icon: Calendar },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  mobile,
  onClose,
}: {
  mobile?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="h-full w-64 bg-[#0f1115] border-r border-[#232632] flex flex-col">
      <div className="h-14 px-4 flex items-center justify-between border-b border-[#232632]">
        <div className="font-semibold">LifeOS</div>
        {mobile && (
          <button onClick={onClose}>
            <X className="w-5 h-5 text-gray-400" />
          </button>
        )}
      </div>

      <div className="p-2 space-y-1">
        {nav.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                active
                  ? "bg-[#161922] text-white"
                  : "text-gray-400 hover:bg-[#161922] hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
