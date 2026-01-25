"use client";

import { Menu } from "lucide-react";

export function MobileTopbar({ onMenu }: { onMenu: () => void }) {
  return (
    <div className="md:hidden h-14 border-b border-[#232632] flex items-center px-4">
      <button onClick={onMenu}>
        <Menu className="w-5 h-5 text-gray-300" />
      </button>
      <div className="ml-4 font-semibold">LifeOS</div>
    </div>
  );
}
