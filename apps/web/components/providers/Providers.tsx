"use client";

import { useState } from "react";
import { SessionProvider } from "next-auth/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/queryClient";
import { KernelProvider } from "@/providers/KernelProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => getQueryClient());

  return (
    <SessionProvider refetchInterval={15}>
      <QueryClientProvider client={queryClient}>
        <KernelProvider>{children}</KernelProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
