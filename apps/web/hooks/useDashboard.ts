"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { KernelClient } from "@/lib/kernelClient";
import { queryKeys } from "@/lib/queryKeys";

export function useDashboard() {
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated" && Boolean((session?.user as any)?.id);

  const query = useQuery({
    queryKey: queryKeys.dashboard(),
    queryFn: () => KernelClient.getDashboard(),
    enabled: isAuthenticated,
  });

  return {
    dashboard: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    lastUpdated: query.dataUpdatedAt || null,
    refresh: async () => {
      await query.refetch();
    },
  };
}
