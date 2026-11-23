"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { KernelClient } from "@/lib/kernelClient";
import { queryKeys } from "@/lib/queryKeys";

export function useWorld() {
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated" && Boolean((session?.user as any)?.id);

  const query = useQuery({
    queryKey: queryKeys.world(),
    queryFn: () => KernelClient.getWorld(),
    enabled: isAuthenticated,
  });

  const world = query.data ?? null;

  return {
    world,
    lifeState: world?.lifeState,
    predictions: world?.predictions || [],
    trends: world?.trends || [],
    projectStates: world?.projectStates || [],
    insights: world?.insights || [],
    isLoading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    lastUpdated: query.dataUpdatedAt || null,
    refresh: async () => {
      await query.refetch();
    },
  };
}
