"use client";

import { SessionProvider } from "next-auth/react";
import { KernelProvider } from "@/providers/KernelProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={15}>
      <KernelProvider>{children}</KernelProvider>
    </SessionProvider>
  );
}
