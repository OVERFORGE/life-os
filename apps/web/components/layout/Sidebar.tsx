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
  Dumbbell
} from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";

const navSections = [
  {
    title: "Intelligence",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/dashboard/assistant", label: "Assistant", icon: BrainCircuit },
    ]
  },
  {
    title: "Organization",
    items: [
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
      { href: "/goals", label: "Goals", icon: Target },
      { href: "/history", label: "Timeline", icon: Calendar },
    ]
  },
  {
    title: "Execution",
    items: [
      { href: "/checkin", label: "Daily Log", icon: Activity },
      { href: "/gym", label: "Gym", icon: Dumbbell },
      { href: "/nutrition", label: "Nutrition", icon: Apple },
    ]
  },
];

export function Sidebar({ mobile, onClose }: { mobile?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  return (
    <aside className="h-full w-[var(--layout-sidebarWidth,260px)] shrink-0 bg-[var(--color-bg-base)] flex flex-col pt-2 transition-all">
      {/* Brand Header */}
      <div className="h-16 px-6 flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-alpha-white5)] shadow-[var(--shadow-surface)]">
          <Target size={14} className="text-[var(--color-text-primary)]" />
        </div>
        <div className="flex items-baseline gap-1">
          <span className="font-[var(--font-bold)] text-[var(--text-base)] tracking-[var(--tracking-wider)] text-[var(--color-text-primary)] uppercase">Life</span>
          <span className="font-[var(--font-medium)] text-[var(--text-base)] tracking-[var(--tracking-wider)] text-[var(--color-text-muted)] uppercase">OS</span>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-8">
        {navSections.map((section) => (
          <div key={section.title}>
            <div className="px-3 mb-2">
              <span className="text-[10px] font-[var(--font-bold)] uppercase tracking-[var(--tracking-widest)] text-[var(--color-text-muted)] opacity-70">
                {section.title}
              </span>
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-[var(--text-sm)] font-[var(--font-medium)] transition-all duration-200 ${
                      active
                        ? "bg-[var(--color-alpha-white10)] text-[var(--color-text-primary)] shadow-[var(--shadow-surface)]"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-alpha-white5)] hover:text-[var(--color-text-primary)]"
                    }`}
                  >
                    <Icon size={16} className={active ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)]"} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer / Settings */}
      <div className="p-3 mb-4 space-y-0.5">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-[var(--text-sm)] font-[var(--font-medium)] text-[var(--color-text-secondary)] hover:bg-[var(--color-alpha-white5)] hover:text-[var(--color-text-primary)] transition-all duration-200"
        >
          <Settings size={16} className="text-[var(--color-text-muted)]" />
          Settings
        </Link>

        {status === "loading" ? (
          <div className="px-3 py-2 text-[var(--text-xs)] text-[var(--color-text-muted)]">Loading...</div>
        ) : session?.user ? (
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-[var(--text-sm)] font-[var(--font-medium)] text-[var(--color-status-error)] hover:bg-[var(--color-alpha-white5)] transition-all duration-200"
          >
            <LogOut size={16} />
            Sign out
          </button>
        ) : (
          <button
            onClick={() => signIn("google")}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-[var(--text-sm)] font-[var(--font-medium)] text-[var(--color-text-secondary)] hover:bg-[var(--color-alpha-white5)] hover:text-[var(--color-text-primary)] transition-all duration-200"
          >
            <LogIn size={16} className="text-[var(--color-text-muted)]" />
            Sign in
          </button>
        )}
      </div>
    </aside>
  );
}
