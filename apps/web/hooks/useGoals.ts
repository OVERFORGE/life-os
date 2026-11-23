"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { KernelClient } from "@/lib/kernelClient";
import { queryKeys } from "@/lib/queryKeys";

export function useGoals() {
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated" && Boolean((session?.user as any)?.id);

  const query = useQuery({
    queryKey: queryKeys.goals(),
    queryFn: () => KernelClient.getGoals(),
    enabled: isAuthenticated,
  });

  const goals = query.data || [];

  return {
    goals,
    highPressureGoals: goals.filter((g) => (g.pressure?.pressureScore ?? 0) >= 50),
    isLoading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    lastUpdated: query.dataUpdatedAt || null,
    refresh: async () => {
      await query.refetch();
    },
  };
}
