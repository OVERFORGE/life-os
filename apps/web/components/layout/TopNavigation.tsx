"use client";

import { Bell, Search, Command } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";

export function TopNavigation() {
  const { data: session } = useSession();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between px-6 bg-[#161618] border-b border-[#2A2B2F]">
      
      {/* Search / Command Palette Trigger */}
      <div className="flex flex-1 items-center gap-4">
        <button className="flex w-full max-w-md items-center gap-3 rounded-xl bg-[#1F2023] border border-[#2A2B2F] px-4 py-2.5 text-sm text-gray-400 transition-all duration-200 hover:bg-[#2A2B2F] group">
          <Search size={16} className="text-[#9ca3af] group-hover:text-gray-300 transition-colors" />
          <span>Search or type a command...</span>
          <div className="ml-auto flex items-center gap-1 rounded bg-[#2A2B2F] px-1.5 py-0.5 text-[10px] font-bold text-gray-400">
            <Command size={10} />
            <span>K</span>
          </div>
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-5">
        <Link href="/notifications" className="relative p-2 text-gray-400 hover:text-gray-200 transition-colors block">
          <Bell size={20} />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#E8414A] ring-2 ring-[#161618]"></span>
        </Link>
        
        <div className="h-9 w-9 overflow-hidden rounded-full border border-[#2A2B2F] bg-[#1F2023] cursor-pointer hover:border-gray-500 transition-colors">
          {session?.user?.image ? (
            <img src={session.user.image} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=LifeOS" alt="Profile" className="h-full w-full object-cover" />
          )}
        </div>
      </div>
      
    </header>
  );
}
