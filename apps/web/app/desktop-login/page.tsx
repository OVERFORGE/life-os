"use client";
import { useEffect } from "react";
import { signIn } from "next-auth/react";

export default function DesktopLoginInitiator() {
  useEffect(() => {
    signIn("google", { callbackUrl: "/desktop-callback" });
  }, []);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#161618] text-white">
      <div className="flex flex-col items-center">
        <div className="w-10 h-10 border-4 border-white/20 border-t-[#E8414A] rounded-full animate-spin mb-4"></div>
        <p className="text-[#ECE7E3]/60 text-sm tracking-widest uppercase">Opening secure portal...</p>
      </div>
    </div>
  );
}
