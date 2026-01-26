"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  BarChart3,
  Settings,
  Target,
  X,
  LogOut,
  LogIn,
} from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/checkin", label: "Daily Check-in", icon: CheckSquare },
  { href: "/goals", label: "Goals", icon: Target },
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
  const { data: session, status } = useSession();

  return (
    <div className="h-full w-64 bg-[#0f1115] border-r border-[#232632] flex flex-col">
      {/* Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-[#232632]">
        <div className="font-semibold">LifeOS</div>
        {mobile && (
          <button onClick={onClose}>
            <X className="w-5 h-5 text-gray-400" />
          </button>
        )}
      </div>

      {/* Nav */}
      <div className="p-2 space-y-1 flex-1">
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

      {/* Footer / Auth */}
      <div className="p-3 border-t border-[#232632]">
        {status === "loading" ? (
          <div className="text-sm text-gray-400">Loading...</div>
        ) : session?.user ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {session.user.image && (
                <img
                  src={session.user.image}
                  alt="avatar"
                  className="w-8 h-8 rounded-full"
                />
              )}
              <div className="text-sm">
                <div className="text-gray-200 font-medium leading-tight">
                  {session.user.name}
                </div>
                <div className="text-xs text-gray-400">
                  {session.user.email}
                </div>
              </div>
            </div>

            <button
              onClick={() => signOut()}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-[#161922]"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={() => signIn("google")}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-[#161922]"
          >
            <LogIn className="w-4 h-4" />
            Sign in with Google
          </button>
        )}
      </div>
    </div>
  );
}
