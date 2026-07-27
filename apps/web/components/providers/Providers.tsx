"use client";

import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  // Refetch session every 15 seconds to instantly log out if remotely revoked
  return <SessionProvider refetchInterval={15}>{children}</SessionProvider>;
}
